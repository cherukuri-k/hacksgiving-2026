import { db } from "./db";
import { structureIntake } from "./ai";
import { makeShortCode } from "./db/seed";
import { sendSms, VERIFY_PROMPT, THANKS_TEXT, CALL_CLOSE_TEXT } from "./sms";
import { detectSafety, isMissingPerson, resourcesFor, resourcesSms, SAFETY_RESOURCES } from "./safety";
import { scheduleFollowUpCall, cancelFollowUp } from "./followup";
import { classifyResidentReply } from "./replyClassifier";
import { nudgeCooldownRemainingMs } from "./nudge";
import { buildSuggestions, plannerSetting } from "./ai/taskSuggest";
import { refineDraftTasks } from "./taskDrafts";
import type { Channel, HelpRequest, SafetyLevel, StructuredIntake } from "./types";

export interface IntakeInput {
  text: string;
  channel: Channel;
  consentToShare?: boolean;
  /** Phone or other contact handle. Stored in the ComForce-only tier, never shown on the board. */
  contactRef?: string;
  neighborhoodHint?: string;
}

export async function intake(input: IntakeInput): Promise<{ request: HelpRequest; structured: StructuredIntake }> {
  const structured = await structureIntake(input.text);
  const now = new Date().toISOString();
  const request: HelpRequest = {
    id: `req-${Date.now().toString(36)}`,
    shortCode: makeShortCode(),
    createdAt: now,
    updatedAt: now,
    status: "new",
    channel: input.channel,
    redactedText: structured.redactedText,
    summary: structured.summary,
    needs: structured.needs,
    urgency: structured.urgency,
    neighborhood: input.neighborhoodHint || structured.neighborhood,
    householdSize: structured.householdSize,
    language: structured.language,
    consentToShare: input.consentToShare ?? true,
    contactRef: input.contactRef,
  };
  const redactedNote = structured.redactions.length
    ? `Redacted ${structured.redactions.length} identifier(s): ${[...new Set(structured.redactions.map((r) => r.placeholder))].join(", ")}`
    : "No personal identifiers found";
  await db.createRequest(request, [
    { at: now, actor: "resident", type: "created", text: `Request received via ${input.channel}` },
    { at: now, actor: "ai", type: "structured", text: `${redactedNote}. Needs: ${structured.needs.join(", ")} · ${structured.urgency} · ${request.neighborhood}` },
  ]);
  // Safety first, and BEFORE the drafts: flagging adds the "safety" need and raises urgency, so
  // running it first is what lets the planner see the same situation the ticket does.
  const level = structured.safety ?? detectSafety(structured.redactedText);
  if (level) await flagSafety(request.id, level, structured.redactedText);

  // Draft tasks for this ticket, once. They assign nobody, contact nobody and do not change the
  // ticket's status — a coordinator reviews them first. Never allowed to fail intake.
  await ensureTaskSuggestions(request.id, level);

  return { request: (await db.getRequest(request.id)) ?? request, structured };
}

/**
 * Generate task suggestions exactly once per request. Idempotent by the presence of
 * `taskSuggestions`, so a refresh or a retry never produces duplicates.
 */
export async function ensureTaskSuggestions(requestId: string, knownSafety?: SafetyLevel): Promise<void> {
  try {
    const req = await db.getRequest(requestId);
    if (!req || req.taskSuggestions) return;
    const suggestions = await buildSuggestions(req.redactedText, req.needs, knownSafety ?? req.safety?.level);
    if (!suggestions.items.length) return;
    const { plannerActivityNote } = await import("./planner/adapter");
    const detail = suggestions.engine ? ` · ${plannerActivityNote(suggestions)}` : "";
    await db.updateRequest(requestId, { taskSuggestions: suggestions }, {
      actor: "ai",
      type: "task",
      text: `${suggestions.aiGenerated ? "AI" : "Relay"} prepared ${suggestions.items.length} suggested task${suggestions.items.length === 1 ? "" : "s"} for review: ${suggestions.items.map((i) => i.title).join(", ")}${detail}`,
    });

    // The other direction of the same rule: the planner's signals can see danger the keyword
    // screen missed. Deliberately CRISIS only. The planner's "concern" matches words as ordinary
    // as "scared", and flagging is not inert: it raises urgency to critical, pages the lead (mock)
    // and adds crisis resources to the resident's SMS reply. A planner concern still shows up in
    // the drafts (coordinator first, safety_review) without reaching the resident.
    if (suggestions.plannerSafety === "crisis" && !req.safety) {
      await flagSafety(requestId, "crisis", req.redactedText);
    }

    // Hybrid drafting: the planner's draft is saved and usable now; a hosted model tailors the
    // wording afterwards. Not awaited, so intake and Jordan's live call never wait on a model.
    // The short delay lets the caller finish its own writes (Jordan's safety note) first, so the
    // model sees the ticket as the coordinator will.
    if (plannerSetting() === "hybrid") setTimeout(() => { void refineDraftTasks(requestId, suggestions.generatedAt); }, 1200);
  } catch {
    // Suggestions are a convenience; intake must succeed regardless.
  }
}

/**
 * Mark a request as a safety situation: bumps urgency, records which crisis lines were shared,
 * and pages the ComForce on-call lead (mock page in the demo; a real pager/SMS hook goes here).
 */
export async function flagSafety(id: string, level: "concern" | "crisis", text: string, note?: string, shared?: string[]) {
  const cur = await db.getRequest(id);
  if (!cur) return cur;
  if (cur.safety) {
    // Intake already flagged this from the words alone. Keep Jordan's own note and what he actually read out.
    if (!note && !shared?.length) return cur;
    const said = shared?.length ? shared.map((k) => SAFETY_RESOURCES.find((r) => r.key === k)?.name ?? k) : cur.safety.resourcesShared;
    return db.updateRequest(id, { safety: { ...cur.safety, note: note ?? cur.safety.note, resourcesShared: said } }, { actor: "ai", type: "safety", text: `Jordan's note added · he shared ${said.join(", ")}` });
  }
  const now = new Date().toISOString();
  const missing = isMissingPerson(text);
  if (missing) level = "crisis";
  const keys = shared?.length ? shared : resourcesFor(level, text);
  const names = keys.map((k) => SAFETY_RESOURCES.find((r) => r.key === k)?.name ?? k);
  // TODO: this `.slice(0, 3)` silently drops a need. A ticket that came in with three needs
  // (say food + utilities + health) keeps only "safety" plus the first two, so the third need
  // loses its place on the card — and, since intake now flags safety BEFORE drafting tasks, it
  // also loses its draft tasks: the planner is given the truncated list as `knownNeeds`.
  // The three-need display limit is a Board/card constraint, not a data one; the fix is to keep
  // the full set on the request and truncate where it is rendered. Left as is for now so this
  // change stays an integration, not a data-model change. See lib/planner/adapter.ts.
  const needs = cur.needs.includes("safety") ? cur.needs : (["safety", ...cur.needs].slice(0, 3) as HelpRequest["needs"]);
  const first = await db.updateRequest(id, {
    urgency: "critical",
    needs,
    safety: { level, ...(missing ? { kind: "missing_person" as const } : {}), note, resourcesShared: names, at: now, leadPagedAt: now },
  }, { actor: "ai", type: "safety", text: `${missing ? "Missing person" : level === "crisis" ? "Crisis" : "Safety concern"} flagged · Jordan shared ${names.join(", ")}` });
  await db.updateRequest(id, {}, { actor: "system", type: "safety", text: `ComForce on-call lead${missing ? " and Missing Persons Network" : ""} paged (mock) · partner tier sees the need, not the details` });
  return first;
}

export async function claim(id: string, ownerName: string, ownerOrg: string, partnerId?: string) {
  return db.updateRequest(id, { status: "claimed", ownerName, ownerOrg, partnerId }, { actor: ownerName, type: "claimed", text: `${ownerName} (${ownerOrg}) claimed this request` });
}

export async function addNote(id: string, actor: string, text: string) {
  const cur = await db.getRequest(id);
  const patch = cur?.status === "claimed" ? { status: "in_progress" as const } : {};
  return db.updateRequest(id, patch, { actor, type: "note", text });
}

export async function markDelivered(id: string, actor: string) {
  const now = new Date().toISOString();
  const req = await db.updateRequest(id, { status: "delivered", deliveredAt: now }, { actor, type: "delivered", text: "Marked delivered" });
  if (!req) return undefined;
  const prompt = VERIFY_PROMPT(req.shortCode, req.language);
  const result = req.contactRef ? await sendSms(req.contactRef, prompt) : { ok: true, mocked: true };
  await db.updateRequest(id, { followUp: { status: "waiting_sms", language: req.language ?? "en", startedAt: now } }, { actor: "system", type: "verify_sent", text: result.mocked ? `Verification text sent (mock SMS): "${prompt}"` : `Sent resident: "${prompt}"` });
  scheduleFollowUpCall(id);
  return req;
}

/**
 * Resident reply: "1" yes, "2" partly, "3" no — by text or on Jordan's call-back.
 * Only "1" verifies. "2" (partly) keeps the case open with the same owner; "3" reopens it.
 * The decision lives in the pure classifyResidentReply() so it is covered by tests and
 * behaves identically on the board route, the inbound-SMS path and the voice follow-up tool.
 */
export async function residentReply(id: string, reply: "1" | "2" | "3", via: "sms" | "call" = "sms") {
  const now = new Date().toISOString();
  cancelFollowUp(id);
  const cur = await db.getRequest(id);
  const outcome = classifyResidentReply(reply);
  const how = via === "call" ? " on Jordan's call-back" : " by text";
  const patch: Partial<HelpRequest> = { status: outcome.status, residentFeedback: outcome.residentFeedback };
  if (outcome.setVerifiedAt) patch.verifiedAt = now;
  if (outcome.clearDeliveredAt) patch.deliveredAt = undefined;
  // Still on the line with Jordan: don't interrupt them with a text. It goes out when they hang up.
  const onTheLine = via === "call" && !!cur?.followUp?.call && !cur.followUp.call.endedAt;
  if (cur?.followUp) patch.followUp = { ...cur.followUp, status: reply === "1" ? "confirmed" : reply === "2" ? "partial" : "reopened", ...(onTheLine ? { closingTextPending: reply } : {}) };
  const updated = await db.updateRequest(id, patch, { actor: "resident", type: outcome.event.type, text: outcome.event.text.replace(/^(Resident \w+)/, `$1${how}`) });
  // By text the webhook reply is the receipt; after a call-back, send one so the resident has the outcome in writing.
  if (onTheLine) {
    // Safety net: if the phone never reports the hang-up (tab closed, signal lost), send the receipt anyway.
    setTimeout(() => { sendClosingText(id).catch(() => {}); }, CLOSING_TEXT_MAX_WAIT_MS);
  } else if (via === "call" && cur?.contactRef) {
    const r = await sendSms(cur.contactRef, CALL_CLOSE_TEXT(cur.shortCode, reply, cur.language));
    await db.updateRequest(id, {}, { actor: "ai", type: "sms_out", text: `Closing text sent to the resident with the call-back outcome.${r.mocked ? " (simulated)" : ""}` });
  }
  return updated;
}

const CLOSING_TEXT_MAX_WAIT_MS = 120_000;

/** Sends the written receipt held back during a live call-back. Safe to call twice: the pending flag is cleared first. */
export async function sendClosingText(id: string) {
  const cur = await db.getRequest(id);
  const reply = cur?.followUp?.closingTextPending;
  if (!cur?.followUp || !reply) return cur;
  await db.updateRequest(id, { followUp: { ...cur.followUp, closingTextPending: undefined } });
  if (!cur.contactRef) return cur;
  const r = await sendSms(cur.contactRef, CALL_CLOSE_TEXT(cur.shortCode, reply, cur.language));
  return db.updateRequest(id, {}, { actor: "ai", type: "sms_out", text: `Closing text sent to the resident after the call ended.${r.mocked ? " (simulated)" : ""}` });
}

export type NudgeResult =
  | { ok: true; request: HelpRequest }
  | { ok: false; code: "no_owner" }
  | { ok: false; code: "cooldown"; retryAfterSec: number };

/**
 * Nudge the current owner to follow up. Records an auditable timeline event and uses the existing
 * SMS helper (which mocks when Twilio is not configured). NEVER sends automatically and never puts a
 * phone number in the timeline. Owners have no phone on the request, so we fall back to the partner's
 * phone if present, otherwise log a simulated nudge. A nudge is NOT a meaningful event, so it does
 * not reset the attention clock (see lib/attention.ts). A 30 minute cooldown (NUDGE_COOLDOWN_MS)
 * prevents nudge spam and is enforced here on the server, not just hidden in the UI.
 */
export async function nudgeOwner(id: string, actor: string): Promise<NudgeResult | undefined> {
  const req = await db.getRequest(id);
  if (!req) return undefined;
  if (!req.ownerName) return { ok: false, code: "no_owner" };
  const events = await db.listActivity(id);
  const remaining = nudgeCooldownRemainingMs(events, Date.now());
  if (remaining > 0) return { ok: false, code: "cooldown", retryAfterSec: Math.ceil(remaining / 1000) };
  const partner = (await db.listPartners()).find((p) => p.id === req.partnerId);
  const message = `Relay MKE: a coordinator flagged request ${req.shortCode} for follow-up. Please update the case when you can.`;
  const result = partner?.phone ? await sendSms(partner.phone, message) : { ok: true, mocked: true };
  const how = result.mocked ? " SMS simulated (not configured)." : " Text sent.";
  const updated = await db.updateRequest(id, {}, { actor, type: "nudge", text: `${actor} nudged ${req.ownerName} to follow up.${how}` });
  return updated ? { ok: true, request: updated } : undefined;
}

export interface ReassignInput {
  actorName: string;
  newOwnerName?: string;
  newOwnerOrg?: string;
  newPartnerId?: string;
  reason: string;
}

/**
 * Reassign a request to a new owner, or release it back to the unclaimed queue. Records the previous
 * owner, the new owner (if any), the reason, and who authorized it, using the dedicated "reassigned"
 * event type (not "reopened"). Authorization is enforced in the route via canReassign(); this mutator
 * assumes the caller already passed that check.
 */
export async function reassign(id: string, input: ReassignInput) {
  const req = await db.getRequest(id);
  if (!req) return undefined;
  const prevOwner = req.ownerName ? `${req.ownerName}${req.ownerOrg ? ` (${req.ownerOrg})` : ""}` : "no owner";
  const toNewOwner = Boolean(input.newOwnerName);
  const patch: Partial<HelpRequest> = toNewOwner
    ? { status: "claimed", ownerName: input.newOwnerName, ownerOrg: input.newOwnerOrg, partnerId: input.newPartnerId }
    : { status: "new", ownerName: undefined, ownerOrg: undefined, partnerId: undefined };
  const text = toNewOwner
    ? `Reassigned from ${prevOwner} to ${input.newOwnerName}${input.newOwnerOrg ? ` (${input.newOwnerOrg})` : ""} by ${input.actorName}. Reason: ${input.reason}`
    : `Released from ${prevOwner} to the unclaimed queue by ${input.actorName}. Reason: ${input.reason}`;
  return db.updateRequest(id, patch, { actor: input.actorName, type: "reassigned", text });
}

/** Parses an inbound SMS body such as "R-4F2K 1" or just "1" (when only one open verification exists for that number). */
export async function handleInboundSms(fromNumber: string, body: string): Promise<string> {
  const text = body.trim().toUpperCase();
  const codeMatch = text.match(/R-[A-Z0-9]{4}/);
  const replyMatch = text.match(/\b([123])\b/);
  if (codeMatch && replyMatch) {
    const req = await db.findByShortCode(codeMatch[0]);
    if (!req) return `Relay MKE: we couldn't find request ${codeMatch[0]}.`;
    await residentReply(req.id, replyMatch[1] as "1" | "2" | "3");
    return THANKS_TEXT(req.language, replyMatch[1] === "3");
  }
  if (replyMatch && !codeMatch) {
    const snap = await db.snapshot();
    const pending = snap.requests.filter((r) => r.status === "delivered" && r.contactRef && r.contactRef.replace(/\D/g, "").endsWith(fromNumber.replace(/\D/g, "").slice(-10)));
    if (pending.length === 1) {
      await residentReply(pending[0].id, replyMatch[1] as "1" | "2" | "3");
      return THANKS_TEXT(pending[0].language, replyMatch[1] === "3");
    }
  }
  if (codeMatch) {
    const req = await db.findByShortCode(codeMatch[0]);
    if (!req) return `Relay MKE: we couldn't find request ${codeMatch[0]}. Double-check the code or text us what you need.`;
    return `Relay MKE ${req.shortCode}: ${STATUS_TEXT[req.status](req)}`;
  }
  // Anything else is a new request for help.
  const { request } = await intake({ text: body, channel: "sms", contactRef: fromNumber, consentToShare: true });
  const base = `Relay MKE: got it. Your request number is ${request.shortCode}. A community responder will reach out${request.safety ? " right away" : ""}.`;
  return request.safety ? `${base} ${resourcesSms(request.safety.resourcesShared, request.safety.kind)}` : `${base} Reply STOP to opt out.`;
}

const STATUS_TEXT: Record<HelpRequest["status"], (r: HelpRequest) => string> = {
  new: () => "we have it and are finding the right partner. You'll hear from someone soon.",
  claimed: (r) => `${r.ownerName ?? "a community responder"} has picked this up and will reach out.`,
  in_progress: (r) => `${r.ownerName ?? "a responder"} is working on it right now.`,
  delivered: () => "we marked this delivered. Reply 1 = yes it arrived, 2 = partly, 3 = no.",
  verified: () => "this one is closed — you told us help arrived. Text us anytime you need something.",
};
