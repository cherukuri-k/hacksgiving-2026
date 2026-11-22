export interface SmsResult { ok: boolean; sid?: string; mocked: boolean; error?: string }

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM_NUMBER;

export const smsConfigured = Boolean(sid && token && from);

export interface SmsLogEntry { id: string; dir: "out" | "in"; number: string; body: string; at: string; mocked?: boolean }
const g = globalThis as unknown as { __relaySmsLog?: SmsLogEntry[] };
const log = (g.__relaySmsLog ??= []);

/** Every text in either direction, newest last. Powers the /phone simulator and survives dev HMR. */
export function smsLog(number?: string): SmsLogEntry[] {
  const want = number?.replace(/\D/g, "").slice(-10);
  return want ? log.filter((e) => e.number.replace(/\D/g, "").slice(-10) === want) : log;
}
export function recordSms(entry: Omit<SmsLogEntry, "id" | "at">): SmsLogEntry {
  const e = { ...entry, id: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() };
  log.push(e);
  if (log.length > 500) log.shift();
  return e;
}
export function clearSmsLog() { log.length = 0; }

/** Sends via Twilio when configured; otherwise logs and reports `mocked: true` so the UI can say so. */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!smsConfigured) {
    console.log(`[sms:mock] -> ${to}: ${body}`);
    recordSms({ dir: "out", number: to, body, mocked: true });
    return { ok: true, mocked: true };
  }
  recordSms({ dir: "out", number: to, body });
  try {
    const { default: twilio } = await import("twilio");
    const client = twilio(sid, token);
    const msg = await client.messages.create({ to, from, body });
    return { ok: true, sid: msg.sid, mocked: false };
  } catch (err) {
    return { ok: false, mocked: false, error: (err as Error).message };
  }
}

type Lang = string | undefined;
const es = (l: Lang) => l === "es";
const hmn = (l: Lang) => l === "hmn";

/** "Did help arrive?" — Spanish for Spanish speakers; Hmong gets a short Hmong line plus English since staff follow up by voice. */
export const VERIFY_PROMPT = (code: string, lang?: Lang) =>
  es(lang)
    ? `Relay MKE: ¿Llegó la ayuda de su solicitud ${code}? Responda 1 = sí, 2 = en parte, 3 = no. Responda STOP para no recibir más mensajes.`
    : hmn(lang)
      ? `Relay MKE: Puas tau txais kev pab ${code}? Teb 1 = tau, 2 = tau ib nrab, 3 = tsis tau. (Did the help for ${code} arrive? Reply 1 = yes, 2 = partly, 3 = no.)`
      : `Relay MKE: Did the help for request ${code} arrive? Reply 1 = yes, 2 = partly, 3 = no. Reply STOP to opt out.`;

export const CODE_TEXT = (code: string, lang?: Lang) =>
  es(lang)
    ? `Relay MKE: su solicitud quedó registrada como ${code}. Envíe ${code} a este número cuando quiera saber cómo va. Le avisaremos cuando la ayuda esté en camino. Responda STOP para no recibir más mensajes.`
    : hmn(lang)
      ? `Relay MKE: koj qhov kev thov yog ${code}. Xa ${code} rau tus xov tooj no kom paub xov xwm. Ib tug neeg hais lus Hmoob yuav hu rov qab rau koj. (Your request is ${code}; a Hmong-speaking neighbor will call you back.)`
      : `Relay MKE: your request is logged as ${code}. Text ${code} to this number any time for an update. We'll text you when help is on the way. Reply STOP to opt out.`;

/** Tracking-code text for a missing-person report: the first thing it says is to call 911, so nobody waits on us instead. */
export const MISSING_PERSON_TEXT = (code: string, lang?: Lang) =>
  es(lang)
    ? `Relay MKE: llame al 911 ahora para reportar a una persona desaparecida. No tiene que esperar 24 horas. Su solicitud es ${code}; el equipo de ComForce la está viendo y alguien le llamará. Mantenga su teléfono cerca.`
    : `Relay MKE: call 911 now to report a missing person. You do not have to wait 24 hours. Your request is ${code}; ComForce's team is looking at it now and someone will call you. Keep your phone close.`;

/** Final text after Jordan's call-back, echoing what the resident said so they have it in writing. */
export const CALL_CLOSE_TEXT = (code: string, reply: "1" | "2" | "3", lang?: Lang) => {
  if (es(lang)) {
    return reply === "1"
      ? `Relay MKE: gracias por hablar con Jordan. Anotamos que la ayuda de ${code} llegó y cerramos su solicitud. Si necesita algo más, envíe un mensaje a este número.`
      : reply === "2"
        ? `Relay MKE: gracias por hablar con Jordan. Anotamos que solo llegó parte de la ayuda de ${code}. El equipo revisará lo que falta y le avisaremos.`
        : `Relay MKE: gracias por hablar con Jordan. Anotamos que la ayuda de ${code} no llegó. Reabrimos su solicitud y avisamos al equipo; le escribiremos pronto.`;
  }
  const hm = hmn(lang) ? "Ua tsaug. " : "";
  return reply === "1"
    ? `${hm}Relay MKE: thanks for talking with Jordan. We've recorded that the help for ${code} arrived and your request is now closed. Text this number any time if you need anything else.`
    : reply === "2"
      ? `${hm}Relay MKE: thanks for talking with Jordan. We've recorded that only part of the help for ${code} arrived. The team is checking what's missing and we'll text you.`
      : `${hm}Relay MKE: thanks for talking with Jordan. We've recorded that the help for ${code} did not arrive. Your request is reopened and the team has been notified — we'll be in touch soon.`;
};

export const THANKS_TEXT = (lang?: Lang, reopened = false) =>
  reopened
    ? es(lang) ? "Gracias. Reabrimos su solicitud y avisamos al equipo." : "Thank you. We've reopened your request and the team has been notified."
    : es(lang) ? "Gracias por avisarnos." : hmn(lang) ? "Ua tsaug. (Thank you for letting us know.)" : "Thank you for letting us know.";
