import type { SafetyLevel } from "./types";

/** Real Milwaukee / Wisconsin crisis resources Jordan can read out. Kept short so they survive a phone call. */
export const SAFETY_RESOURCES = [
  { key: "911", name: "911", how: "call 911 now", when: "a missing person, immediate danger, a medical emergency" },
  { key: "ncmec", name: "National Center for Missing & Exploited Children", how: "1-800-843-5678 · 24/7", when: "a missing child, after calling 911" },
  { key: "988", name: "988 Suicide & Crisis Lifeline", how: "call or text 988", when: "thoughts of self-harm, overwhelming crisis" },
  { key: "county", name: "Milwaukee County Crisis Line", how: "414-257-7222 · 24/7", when: "mental-health crisis, mobile team" },
  { key: "sojourner", name: "Sojourner Family Peace Center", how: "414-933-2722 · 24/7", when: "domestic violence, feeling unsafe at home" },
  { key: "211", name: "IMPACT 2-1-1", how: "dial 211", when: "shelter tonight, any other urgent referral" },
] as const;
export type SafetyResourceKey = (typeof SAFETY_RESOURCES)[number]["key"];

const CRISIS = /\b(kill (my|him|her)self|suicid\w*|end (it|my life)|don'?t want to (be here|live)|hurt(ing)? myself|overdos\w*|he'?s? (going to|gonna) kill|she'?s? (going to|gonna) kill|has a gun|pointed a gun|holding a knife|strangl\w*|choked me)\b/i;
const CONCERN = /\b(hit(s|ting)? me|hits? the kids|beat(s|ing)? me|abus\w*|threaten\w*|scared (of|for)|unsafe at home|afraid (he|she|they)|won'?t let me leave|stalk\w*|restraining order|he'?s? drunk and|weapon|gun|shot|stab)\b/i;

const PERSON = "(?:son|daughter|child|kid|baby|toddler|boy|girl|teen(?:ager)?|grand(?:son|daughter|child|ma|mother|pa|father)|mom|mother|dad|father|brother|sister|husband|wife|niece|nephew|cousin|uncle|aunt|friend|neighbor)";
// "missing school", "missing work", "missing a payment" are not missing people.
const NOT_A_PERSON = "(?! (?:school|class|work|meals?|payments?|rent|out|teeth|his|her|their|a|an|the)\\b)";
const MISSING = new RegExp([
  `\\b${PERSON}\\b[^.?!]{0,60}\\b(?:is|went|gone|been|go) missing\\b${NOT_A_PERSON}`,
  `\\bmissing (?:person|${PERSON})\\b`,
  `\\b(?:didn'?t|did not|never|hasn'?t|has not) (?:come|came|made it|make it|been|get|got) (?:back )?home\\b`,
  `\\b(?:can'?t|cannot|couldn'?t|could not) find (?:him|her|them|(?:my|our) ${PERSON})\\b`,
  `\\b(?:nobody|no one) (?:has|have) seen (?:him|her|them)\\b`,
  `\\bhaven'?t (?:seen|heard from) (?:him|her|them|(?:my|our) ${PERSON}) (?:since|in|for)\\b`,
  `\\b(?:ran|run|runs|running) away\\b|\\brunaway\\b|\\b(?:abduct|kidnap)\\w*`,
  `\\bdesaparecid[oa]\\b|\\bno (?:ha )?(?:llegado|regresado|vuelto) a (?:la )?casa\\b`,
].join("|"), "i");

/** A child or adult who has not come home, ran away, or cannot be found. Milwaukee Police take the report at once; there is no 24-hour wait. */
export function isMissingPerson(text: string): boolean {
  return MISSING.test(text);
}

const AGE = /\b(\d{1,2})[\s-]*(?:years?|yrs?)[\s-]*old\b|\bis (\d{1,2})\b(?! (?:hours?|days?|blocks?|minutes?|miles?|weeks?|months?|times?)\b)|\b(\d{1,2}) años\b/i;
const YOUNG = /\b(son|daughter|child|kid|baby|toddler|boy|girl|teen(ager)?|minor|school|grand(son|daughter|child)|niece|nephew|hij[oa]|niñ[oa])\b/i;

/** True when the text gives an age under 18, or gives no age but uses words that usually mean a minor. */
export function mayBeMinor(text: string): boolean {
  const m = text.match(AGE);
  if (m) return Number(m[1] ?? m[2] ?? m[3]) < 18;
  return YOUNG.test(text);
}

/** Keyword screen used when the LLM is unavailable and as a floor under it: never downgrade an obvious crisis. */
export function detectSafety(text: string): SafetyLevel | undefined {
  if (CRISIS.test(text) || isMissingPerson(text)) return "crisis";
  if (CONCERN.test(text)) return "concern";
  return undefined;
}

const DV = /\b(hit|beat|abus|partner|husband|wife|boyfriend|girlfriend|ex\b|strangl|choke|won'?t let me leave|unsafe at home|afraid (he|she|they)|stalk)/i;
const SELF = /\b(suicid\w*|kill myself|end (it|my life)|don'?t want to (be here|live)|hurt(ing)? myself|overdos\w*|mental|depress\w*|anxi\w*|hopeless)\b/i;

/** Which resources Jordan should mention for a given level and text. */
export function resourcesFor(level: SafetyLevel, text: string): SafetyResourceKey[] {
  // A missing person is a police matter first. 988 only if the text also points to self-harm.
  if (isMissingPerson(text)) {
    const keys: SafetyResourceKey[] = ["911"];
    if (mayBeMinor(text)) keys.push("ncmec");
    if (SELF.test(text)) keys.push("988");
    return keys;
  }
  const out: SafetyResourceKey[] = [];
  const dv = DV.test(text);
  if (SELF.test(text) || (level === "crisis" && !dv)) out.push("988", "county");
  if (dv) out.push("sojourner");
  out.push("211");
  return Array.from(new Set(out));
}

/** One SMS-sized line of the same resources, for text-channel requests. */
export function resourcesSms(keys: string[], kind?: "missing_person"): string {
  const lines = SAFETY_RESOURCES.filter((r) => r.key !== "911" && (keys.includes(r.name) || keys.includes(r.key))).map((r) => `${r.name.replace(" Suicide & Crisis Lifeline", "").replace("Milwaukee County ", "County ").replace(" Family Peace Center", "").replace("National Center for Missing & Exploited Children", "Missing-child hotline")}: ${r.how.replace(" · 24/7", "")}`);
  if (kind === "missing_person") return `Call 911 now to report a missing person. You do not have to wait 24 hours.${lines.length ? ` Then: ${lines.join(" · ")}.` : ""}`;
  return `If you're in danger right now, call 911. ${lines.join(" · ")}.`;
}
