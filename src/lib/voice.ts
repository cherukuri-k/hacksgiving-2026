import { db } from "./db";
import { intake, flagSafety } from "./actions";
import { sendSms, CODE_TEXT, MISSING_PERSON_TEXT } from "./sms";
import { redactPII } from "./ai/redact";
import { summarizeCall, structureIntake } from "./ai";
import { textDestination, type CallNumbers } from "./callText";
import type { CallTurn, HelpRequest } from "./types";

export { normalizePhone } from "./callText";

/** Fields the voice agent collects mid-call and posts via its webhook tool. */
export interface CallToolInput extends CallNumbers {
  conversation_id?: string;
  what_they_need: string;
  area?: string;
  household_size?: number | string;
  urgency?: "low" | "normal" | "high" | "critical" | string;
  language?: string;
  /** Jordan sets this when the caller describes risk to themselves or others */
  safety_concern?: boolean | string;
  safety_level?: "concern" | "crisis" | string;
  /** One neutral sentence on what was said, no names */
  safety_note?: string;
  /** Which crisis lines Jordan read out, e.g. ["988","sojourner"] */
  resources_shared?: string[] | string;
}

const yes = (v: unknown) => v === true || /^(true|yes|y|1)$/i.test(String(v ?? ""));

export interface CallRequestResult {
  request: HelpRequest;
  shortCode: string;
  texted: boolean;
  /** The number the code was texted to, and the line the call is on, when known. */
  textedTo?: string;
  line?: string;
  /** True when this was a second tool call in the same conversation: same request, code sent again. */
  resent?: boolean;
}

const codeText = (r: HelpRequest) => (r.safety?.kind === "missing_person" ? MISSING_PERSON_TEXT(r.shortCode, r.language) : CODE_TEXT(r.shortCode, r.language));

/** A webhook retried within this window is the same call arriving twice, not the caller asking again. */
const RETRY_WINDOW_MS = 8000;

/**
 * Jordan calls the tool again in the same conversation when the caller says the text never
 * came or gives a corrected number. That must not create a second request: same request, same
 * code, sent again.
 */
async function resendCode(req: HelpRequest, to: string | undefined, line: string | undefined): Promise<CallRequestResult> {
  const number = to ?? req.contactRef;
  if (!number) return { request: req, shortCode: req.shortCode, texted: false, line, resent: true };
  const corrected = number !== req.contactRef;
  if (!corrected && Date.now() - Date.parse(req.createdAt) < RETRY_WINDOW_MS) return { request: req, shortCode: req.shortCode, texted: true, textedTo: number, line, resent: true };
  const r = await sendSms(number, codeText(req));
  const note = r.ok ? `Tracking code texted again${corrected ? " to a corrected number" : ""}${r.mocked ? " (mock SMS)" : ""}` : `Could not text code: ${r.error}`;
  const updated = (await db.updateRequest(req.id, corrected ? { contactRef: number } : {}, { actor: "system", type: "sms_out", text: note })) ?? req;
  return { request: updated, shortCode: updated.shortCode, texted: r.ok, textedTo: r.ok ? number : undefined, line, resent: true };
}

/** Called by the ElevenLabs agent while the resident is still on the line. Returns a tracking code it can read back. */
export async function createRequestFromCall(input: CallToolInput): Promise<CallRequestResult> {
  const { to: contactRef, line } = textDestination(input);
  const existing = input.conversation_id ? (await db.snapshot()).requests.find((r) => r.call?.conversationId === input.conversation_id) : undefined;
  if (existing) return resendCode(existing, contactRef, line);

  const parts = [input.what_they_need];
  if (input.area) parts.push(`We're near ${input.area}.`);
  const hh = Number(input.household_size);
  if (hh > 0) parts.push(`There are ${hh} of us in the household.`);
  const text = parts.join(" ");

  const { request } = await intake({
    text,
    channel: "voice",
    consentToShare: true,
    contactRef,
    neighborhoodHint: undefined,
  });

  const urg = String(input.urgency ?? "").toLowerCase();
  const patch: Partial<HelpRequest> = {
    call: { conversationId: input.conversation_id ?? `local-${Date.now()}`, transcript: [] },
  };
  if (["low", "normal", "high", "critical"].includes(urg)) patch.urgency = urg as HelpRequest["urgency"];
  if (input.language) patch.language = input.language;
  if (hh > 0) patch.householdSize = hh;

  let updated = (await db.updateRequest(request.id, patch, { actor: "ai", type: "call", text: "Phone intake in progress — created live during the call" })) ?? request;

  if (yes(input.safety_concern) || input.safety_level === "crisis" || input.safety_level === "concern") {
    const level = input.safety_level === "crisis" ? "crisis" : "concern";
    const shared = Array.isArray(input.resources_shared) ? input.resources_shared : String(input.resources_shared ?? "").split(/[,\s]+/).filter(Boolean);
    updated = (await flagSafety(updated.id, level, text, input.safety_note, shared.map((k) => k.toLowerCase()))) ?? updated;
  }

  // Text the code so nobody has to memorize it over the phone; the same number is the reply channel.
  let texted = false;
  if (contactRef) {
    const r = await sendSms(contactRef, codeText(updated));
    texted = r.ok;
    const note = r.ok ? `Tracking code texted to the resident${r.mocked ? " (mock SMS)" : ""}` : `Could not text code: ${r.error}`;
    updated = (await db.updateRequest(updated.id, {}, { actor: "system", type: "sms_out", text: note })) ?? updated;
  }
  return { request: updated, shortCode: updated.shortCode, texted, textedTo: texted ? contactRef : undefined, line };
}

export interface PostCallPayload {
  conversation_id: string;
  caller_id?: string;
  duration_sec?: number;
  turns: { role: "agent" | "caller"; text: string; t: number }[];
  /** ElevenLabs' own one-paragraph summary, if provided */
  provider_summary?: string;
}

/** After the call ends: redact the transcript, run the second LLM, attach to the request (or create it if the tool never fired). */
export async function finalizeCall(p: PostCallPayload): Promise<HelpRequest | undefined> {
  const transcript: CallTurn[] = p.turns.map((t) => ({ role: t.role, t: t.t, text: redactPII(t.text).redactedText }));
  const summary = await summarizeCall(transcript, p.provider_summary);

  const snap = await db.snapshot();
  let req = snap.requests.find((r) => r.call?.conversationId === p.conversation_id);

  if (!req) {
    const callerText = p.turns.filter((t) => t.role === "caller").map((t) => t.text).join(" ");
    if (!callerText.trim()) return undefined;
    const created = await intake({ text: callerText, channel: "voice", consentToShare: true, contactRef: p.caller_id });
    req = created.request;
  }

  // Re-derive the card from everything the resident actually said, not just the mid-call tool fields.
  const callerText = p.turns.filter((t) => t.role === "caller").map((t) => t.text).join(" ");
  const patch: Partial<HelpRequest> = {};
  if (callerText.trim().length > 20) {
    const st = await structureIntake(callerText);
    patch.redactedText = st.redactedText;
    // Only an LLM result beats the agent's own clean "what they need" phrasing; the rules fallback shouldn't overwrite it.
    if (st.source === "llm" || !req.call) patch.summary = st.summary;
    patch.needs = Array.from(new Set([...st.needs, ...req.needs])).slice(0, 3);
    if (!req.householdSize && st.householdSize) patch.householdSize = st.householdSize;
    if (st.language && st.language !== "en") patch.language = st.language;
  }

  const mins = p.duration_sec ? `${Math.floor(p.duration_sec / 60)}m ${p.duration_sec % 60}s` : undefined;
  const call = { ...(req.call ?? { conversationId: p.conversation_id, transcript: [] }), transcript, summary, durationSec: p.duration_sec, endedAt: new Date().toISOString() };
  return db.updateRequest(req.id, { ...patch, call }, {
    actor: "ai",
    type: "call",
    text: `Call ended${mins ? ` · ${mins}` : ""} · transcript redacted and summarized: ${summary}`,
  });
}

/** Map an ElevenLabs post_call_transcription payload to our shape. Tolerant of missing fields. */
export function fromElevenLabs(data: Record<string, unknown>): PostCallPayload {
  const transcript = (Array.isArray(data.transcript) ? data.transcript : []) as Record<string, unknown>[];
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const phone = (meta.phone_call ?? {}) as Record<string, unknown>;
  const analysis = (data.analysis ?? {}) as Record<string, unknown>;
  return {
    conversation_id: String(data.conversation_id ?? ""),
    caller_id: typeof phone.external_number === "string" ? phone.external_number : undefined,
    duration_sec: typeof meta.call_duration_secs === "number" ? meta.call_duration_secs : undefined,
    turns: transcript
      .filter((t) => typeof t.message === "string" && (t.message as string).trim())
      .map((t) => ({ role: t.role === "agent" ? "agent" : "caller", text: String(t.message), t: Number(t.time_in_call_secs ?? 0) })),
    provider_summary: typeof analysis.transcript_summary === "string" ? analysis.transcript_summary : undefined,
  };
}
