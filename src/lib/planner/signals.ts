// Situation signals that change HOW tasks are planned (not WHAT is needed).
// Kept at pattern level. In Relay, also run the app's existing lib/safety.ts; either one raising a flag wins.

import { forRules } from "./needs.ts";

export interface Signals {
  crisis: boolean;            // possible self-harm, violence, or medical emergency -> coordinator only
  safetyConcern: boolean;     // caller says they feel unsafe / scared, or describes a safety risk -> coordinator first
  unsafeConditions: string[]; // physical hazards -> safety check before any volunteer goes in
  thirdPartyCaller: boolean;  // someone calling on behalf of another adult -> consent step
  languageNeed: boolean;
  urgent: string[];           // deadline / running-out phrases
  vulnerablePerson: boolean;  // older adult, infant, lives alone, disability -> heat/cold hazards become critical
  evidence: string[];
}

const CRISIS = /\b(kill (my|him|her)self|end (my|it all)|suicid\w*|hurt (my|him|her)self|(don't|not) (want|wanna) to (live|be here)|don't see the point|no point (in )?(going on|living)|can't go on|overdos\w*|not breathing|unconscious|chest pain|being (hit|hurt|threatened)|(he|she|they)('s| is| are) (hitting|hurting|threatening)|leave (my|our|her|his|their) (home|house|apartment) tonight|somewhere safe to (go|stay)|afraid for (my|our|her|his) (life|lives|safety)|(isn't|not) safe at home)\b/;

const HAZARDS: [string, RegExp][] = [
  ["standing water or flooding", /\b(flood(ed|ing)?|water (everywhere|in (the|my|our) basement)|standing water)\b/],
  ["no heat in cold weather", /\b(no heat|heat (is )?(out|off)|furnace (stopped|broke|is broken|isn'?t working)|heater (isn'?t|is not|stopped) working|freezing)\b/],
  ["extreme heat", /\b(heat wave|really hot|too hot|a\/?c (broke|is broken|stopped)|air conditioning (broke|is broken|stopped))\b/],
  ["gas or electrical hazard", /\b(smell (of )?gas|gas leak|sparks?|exposed wires?|carbon monoxide|(power|electricity) is (still )?on (down there|in the basement))\b/],
  ["structural damage", /\b(roof (caved|collapsed|is falling)|ceiling (fell|is falling|collapsed)|foundation|structural)\b/],
  ["person not seen or not responding", /\b(hasn't (come|been) out|haven't seen (him|her|them) in|(hasn't|haven't) left (their|her|his|the) (house|home|apartment)|not answering (the )?door|not responding)\b/],
  ["medical equipment that needs power", /\b(breathing machine|oxygen (machine|concentrator|tank)|ventilator|cpap|dialysis|medical (device|equipment))\b/],
  ["power outage", /\b(power('s| is| has been)? out|power (just )?went out|no power|without power|electricity (is |has been )?off|haven't had power)\b/],
  ["water coming into the home", /\b(roof (is )?leaking|water (is )?coming in|standing water)\b/],
  ["fire or security risk", /\b(smoke (detector|alarm) (isn't|doesn't|won't|not) work\w*|door won't lock|lock (is )?broken|broken (windows?|locks?)|windows? (is |are )?broken)\b/],
];

/** Hazards serious enough to raise the ticket to safety_review (others still get a safety check first). */
export const CRITICAL_HAZARDS = new Set(["gas or electrical hazard", "structural damage", "person not seen or not responding",
  "medical equipment that needs power"]);

const SAFETY_CONCERN = /\b((make sure|ensure|ensuring|check(ing)? if) (the|their|my|our|her|his) (house|home|place) is safe|unsafe|not safe|(feel|feeling|felt) (scared|afraid|unsafe)|scary|scared|worried about (my |our |their |the |his |her )?(kids'? |children'?s |family'?s |own )?safety|safety of (the|my|our|their))\b/;

const VULNERABLE = /\b(elderly|older adult|senior|(is|i'm|she's|he's|they're) ([6-9]\d|1[01]\d)|[6-9]\d years? old|newborn|infant|baby|lives alone|living alone|home alone|wheelchair|walker|disabled|disability)\b/;

const THIRD_PARTY = /\b(my (mom|mother|dad|father|parents?|grand(ma|pa|mother|father)|brother|sister|aunt|uncle|son|daughter|friend|neighbor|cousin)|calling for|on behalf of|next door|the family next door|my elderly (mom|mother|dad|father|neighbor))\b/;

const URGENT = /\b(tonight|today|tomorrow|this week|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|court (date|hearing)|eviction notice|shut ?off notice|disconnect(ion)? notice|out of food|no food|(two|2|three|3) days|running out|no heat|freezing|newborn|infant)\b/g;

export function readSignals(text: string, languageDetected: boolean): Signals {
  const t = forRules(text);
  const evidence: string[] = [];
  const crisis = CRISIS.test(t);
  if (crisis) evidence.push("crisis signal (details withheld from task cards)");
  const sc = t.match(SAFETY_CONCERN);
  if (sc) evidence.push(`safety concern: "${sc[0]}"`);
  const unsafeConditions = HAZARDS.filter(([, rx]) => rx.test(t)).map(([label]) => label);
  const tp = t.match(THIRD_PARTY);
  if (tp) evidence.push(`calling for someone else: "${tp[0]}"`);
  const urgent = [...new Set(t.match(URGENT) ?? [])];
  const vulnerablePerson = VULNERABLE.test(t);
  return { crisis, safetyConcern: !!sc, vulnerablePerson, unsafeConditions, thirdPartyCaller: !!tp, languageNeed: languageDetected, urgent, evidence };
}
