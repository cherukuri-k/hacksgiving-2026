import { db } from "./db";
import { NEED_LABEL, type CallTurn, type HelpRequest } from "./types";

/**
 * Closing the loop by voice. After "Mark delivered" the resident gets a text; if they don't reply within
 * FOLLOWUP_SMS_WAIT_MS, Jordan calls them back in the language they called in and asks whether the help arrived.
 *
 * Live mode (NEXT_PUBLIC_ELEVENLABS_FOLLOWUP_AGENT_ID set): the request is marked "calling", the resident's phone
 * (/phone) rings, and when they tap Answer the browser opens a real ElevenLabs conversation with the follow-up agent.
 * Jordan records the outcome through the `followup_result` webhook tool. The browser mirrors each turn here so the
 * Board sees the transcript live. Without the agent, a scripted simulation streams turn-by-turn instead.
 */
const SMS_WAIT_MS = Number(process.env.FOLLOWUP_SMS_WAIT_MS ?? 15000);
const RING_TIMEOUT_MS = Number(process.env.FOLLOWUP_RING_TIMEOUT_MS ?? 45000);
const LIVE_AGENT = process.env.NEXT_PUBLIC_ELEVENLABS_FOLLOWUP_AGENT_ID;
const RING_MS = Number(process.env.DISPATCH_SIM_RING_MS ?? 2500);
const TURN_MS = Number(process.env.DISPATCH_SIM_TURN_MS ?? 1700);

const timers: Map<string, ReturnType<typeof setTimeout>[]> = ((globalThis as unknown as { __relayFollowUpTimers?: Map<string, ReturnType<typeof setTimeout>[]> }).__relayFollowUpTimers ??= new Map());

export function cancelFollowUp(requestId: string) {
  timers.get(requestId)?.forEach(clearTimeout);
  timers.delete(requestId);
}

export function scheduleFollowUpCall(requestId: string) {
  cancelFollowUp(requestId);
  const list: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, fn: () => Promise<unknown>) => list.push(setTimeout(() => { fn().catch(() => {}); }, ms));

  at(SMS_WAIT_MS, async () => {
    const req = await db.getRequest(requestId);
    if (!req || req.status !== "delivered" || req.followUp?.status !== "waiting_sms") return;
    const lang = req.language ?? "en";
    const script = residentScript(req, lang);
    const conversationId = `sim-fu-${req.id}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const mode = LIVE_AGENT ? "live" : "sim";
    await db.updateRequest(requestId, { followUp: { status: "calling", mode, language: lang, startedAt: now } }, { actor: "ai", type: "followup_call", text: `No text reply yet · Jordan is calling the resident back${lang === "en" ? "" : ` in ${lang === "es" ? "Spanish" : lang === "hmn" ? "Hmong (interpreter line)" : lang}`}` });

    if (mode === "live") {
      at(RING_TIMEOUT_MS, async () => {
        const cur = await db.getRequest(requestId);
        if (cur?.followUp?.status !== "calling") return;
        await db.updateRequest(requestId, { followUp: { ...cur.followUp, status: "no_answer" } }, { actor: "ai", type: "followup_call", text: "Call-back rang out · no answer. Volunteer should try later." });
        timers.delete(requestId);
      });
      return;
    }

    at(RING_MS, async () => {
      const cur = await db.getRequest(requestId);
      if (cur?.followUp?.status !== "calling") return;
      await db.updateRequest(requestId, { followUp: { ...cur.followUp, status: "answered", answeredAt: new Date().toISOString(), call: { conversationId, transcript: [] } } });
    });

    script.turns.forEach((turn, i) => {
      at(RING_MS + TURN_MS * (i + 1), async () => {
        const cur = await db.getRequest(requestId);
        if (!cur?.followUp?.call || cur.followUp.call.endedAt || cur.followUp.status !== "answered") return;
        const transcript: CallTurn[] = [...cur.followUp.call.transcript, { role: turn.role, t: (TURN_MS * (i + 1)) / 1000, text: turn.text }];
        await db.updateRequest(requestId, { followUp: { ...cur.followUp, call: { ...cur.followUp.call, transcript } } });
      });
    });

    at(RING_MS + TURN_MS * (script.turns.length + 1), async () => {
      const cur = await db.getRequest(requestId);
      if (!cur?.followUp?.call || cur.followUp.call.endedAt || cur.followUp.status !== "answered") return;
      const durationSec = Math.round((TURN_MS * script.turns.length) / 1000) + 20;
      const call = { ...cur.followUp.call, summary: script.summary, durationSec, endedAt: new Date().toISOString() };
      await db.updateRequest(requestId, { followUp: { ...cur.followUp, call } }, { actor: "ai", type: "followup_call", text: `Call-back ended · ${Math.floor(durationSec / 60)}m ${durationSec % 60}s · ${script.summary}` });
      // Lazy import avoids an actions ↔ followup cycle at module load.
      const { residentReply } = await import("./actions");
      await residentReply(requestId, "1", "call");
      timers.delete(requestId);
    });
  });
  timers.set(requestId, list);
}

// ---- Live mode: driven by /phone (answer / turns / hang-up) and the follow-up agent's webhook tool ----

/** Resident tapped Answer; the browser is opening the ElevenLabs session. */
export async function answerFollowUp(requestId: string, conversationId: string) {
  cancelFollowUp(requestId);
  const cur = await db.getRequest(requestId);
  if (cur?.followUp?.status !== "calling") return cur;
  return db.updateRequest(requestId, { followUp: { ...cur.followUp, status: "answered", answeredAt: new Date().toISOString(), call: { conversationId, transcript: [] } } }, { actor: "resident", type: "followup_call", text: "Resident picked up · live call with Jordan" });
}

/** Resident declined the call (or let it ring out). */
export async function declineFollowUp(requestId: string) {
  cancelFollowUp(requestId);
  const cur = await db.getRequest(requestId);
  if (cur?.followUp?.status !== "calling") return cur;
  return db.updateRequest(requestId, { followUp: { ...cur.followUp, status: "no_answer" } }, { actor: "resident", type: "followup_call", text: "Call-back declined · volunteer should try later" });
}

/** Mirrors one spoken turn from the live session so the Board transcript updates while the call is on. */
export async function appendFollowUpTurn(requestId: string, role: CallTurn["role"], text: string) {
  const cur = await db.getRequest(requestId);
  const call = cur?.followUp?.call;
  if (!cur?.followUp || !call || call.endedAt || !text.trim()) return cur;
  const t = cur.followUp.answeredAt ? Math.round((Date.now() - new Date(cur.followUp.answeredAt).getTime()) / 1000) : 0;
  return db.updateRequest(requestId, { followUp: { ...cur.followUp, call: { ...call, transcript: [...call.transcript, { role, t, text }] } } });
}

export type FollowUpResultInput = { arrived?: "yes" | "partial" | "no"; notes?: string; request_id?: string; request_code?: string; conversation_id?: string };

/** The agent's `followup_result` tool: closes the loop exactly like an SMS "1/2/3" would. */
export async function recordFollowUpResult(input: FollowUpResultInput) {
  const req = input.request_id ? await db.getRequest(input.request_id) : input.request_code ? await db.findByShortCode(input.request_code.toUpperCase()) : null;
  if (!req?.followUp || !input.arrived) return null;
  const reply = input.arrived === "yes" ? "1" : input.arrived === "partial" ? "2" : "3";
  const summary = input.notes?.trim() || (input.arrived === "yes" ? "Resident confirmed on the call that the help arrived." : input.arrived === "partial" ? "Resident said part of the help arrived." : "Resident said the help did not arrive.");
  if (req.followUp.call) await db.updateRequest(req.id, { followUp: { ...req.followUp, call: { ...req.followUp.call, summary } } });
  const { residentReply } = await import("./actions");
  return residentReply(req.id, reply, "call");
}

/** Live session disconnected. Stamps duration; if Jordan never recorded an outcome, the loop stays open. */
export async function endFollowUpCall(requestId: string) {
  const cur = await db.getRequest(requestId);
  const call = cur?.followUp?.call;
  if (!cur?.followUp || !call || call.endedAt) return cur;
  const durationSec = cur.followUp.answeredAt ? Math.round((Date.now() - new Date(cur.followUp.answeredAt).getTime()) / 1000) : 0;
  const unresolved = cur.followUp.status === "answered";
  const summary = call.summary ?? (unresolved ? "Call ended before the resident answered whether the help arrived." : undefined);
  const ended = await db.updateRequest(requestId, { followUp: { ...cur.followUp, status: unresolved ? "no_answer" : cur.followUp.status, call: { ...call, endedAt: new Date().toISOString(), durationSec, summary } } }, { actor: "ai", type: "followup_call", text: `Call-back ended · ${Math.floor(durationSec / 60)}m ${durationSec % 60}s${summary ? ` · ${summary}` : ""}` });
  // The resident has hung up: now send the written receipt that was held back during the call.
  const { sendClosingText } = await import("./actions");
  return (await sendClosingText(requestId)) ?? ended;
}

function residentScript(req: HelpRequest, lang: string): { turns: CallTurn[]; summary: string } {
  const need = NEED_LABEL[req.needs.find((n) => n !== "youth" && n !== "other") ?? req.needs[0] ?? "other"].toLowerCase();
  const who = req.ownerName ?? "our volunteer";
  if (lang === "es") {
    const turns: CallTurn[] = [
      { role: "caller", t: 0, text: "¿Aló?" },
      { role: "agent", t: 0, text: `Hola, habla Jordan de ComForce Milwaukee. Le llamo por su solicitud ${req.shortCode}. ${who} pasó a dejar la ayuda con ${need}. ¿Le llegó bien?` },
      { role: "caller", t: 0, text: "Sí, sí, ya llegó. Muchísimas gracias, de verdad no sabía qué íbamos a hacer." },
      { role: "agent", t: 0, text: "Qué bueno escuchar eso. ¿Hubo algo que faltara, o algo que debamos saber?" },
      { role: "caller", t: 0, text: "No, todo bien. Gracias por llamar." },
      { role: "agent", t: 0, text: "Con gusto. Lo marco como entregado. Si necesita algo más, mande un texto con su código a este mismo número. Cuídese." },
    ];
    return { turns, summary: "Resident confirmed in Spanish that the delivery arrived and nothing was missing." };
  }
  const interp = lang === "hmn" ? " (through the Hmong interpreter line)" : "";
  const turns: CallTurn[] = [
    { role: "caller", t: 0, text: "Hello?" },
    { role: "agent", t: 0, text: `Hi, this is Jordan with ComForce Milwaukee${interp}. I'm calling about your request ${req.shortCode}. ${who} came by with the ${need} — did it get to you okay?` },
    { role: "caller", t: 0, text: "Yes — yeah, we got it. Thank you so much, honestly, I didn't know what we were going to do." },
    { role: "agent", t: 0, text: "I'm really glad to hear that. Was anything missing, or anything we should know about?" },
    { role: "caller", t: 0, text: "No, it was all there. Thanks for checking." },
    { role: "agent", t: 0, text: "Of course. I'll mark it delivered. If you need anything else, just text your code to this same number. Take care." },
  ];
  return { turns, summary: `Resident confirmed${lang === "hmn" ? " via interpreter" : ""} that the delivery arrived and nothing was missing.` };
}
