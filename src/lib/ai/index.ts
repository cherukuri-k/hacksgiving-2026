import { NEEDS, NEIGHBORHOODS, type Need, type StructuredIntake, type Urgency } from "../types";
import { redactPII } from "./redact";
import { detectSafety, isMissingPerson, mayBeMinor } from "../safety";
import { complete, llmConfigured, parseJson } from "./llm";

const KEYWORDS: Record<Need, RegExp> = {
  food: /\b(food|grocer\w*|hungry|eat|pantry|meals?|formula|diapers?)\b/i,
  rent: /\b(rent|evict|landlord|5[- ]day|notice to (quit|vacate)|behind on)\b/i,
  utilities: /\b(we ?energies|electric|power|gas bill|water bill|shut ?off|disconnect|heat(ing)? (bill|shut))\b/i,
  housing: /\b(homeless|shelter|displaced|fire|flood|staying in (my|our|the) car|nowhere to (stay|go)|no heat|couch)\b/i,
  mediation: /\b(dispute|argu|fight|beef|neighbor|mediat|conflict|threaten|it almost got physical)\b/i,
  safety: /\b(threat|gun|shot|shoot|violence|pop off|retaliat|scared|unsafe|weapon|stab|jump(ed)?)\b/i,
  health: /\b(med(s|ication|ical)|doctor|clinic|dialysis|insulin|pharmacy|hospital|pregnan|mental|anxiety|depress)\b/i,
  transport: /\b(ride|bus|transit|car broke|get to work|uber|lyft|voucher)\b/i,
  youth: /\b(son|daughter|teens?|kids?|children|school|youth|15|16|17|my boy|my girl)\b/i,
  legal: /\b(court|lawyer|attorney|legal|notice|warrant|custody|id card|identification)\b/i,
  other: /$^/,
};

function fallbackStructure(redacted: string): Omit<StructuredIntake, "redactedText" | "redactions"> {
  const needs = NEEDS.filter((n) => KEYWORDS[n].test(redacted)) as Need[];
  if (!needs.length) needs.push("other");
  let urgency: Urgency = "normal";
  if (/\b(tonight|today|now|asap|emergency|weapon|gun|physical|fire|shut ?off (is )?(monday|tomorrow|today)|5[- ]day|baby|infant)\b/i.test(redacted)) urgency = "critical";
  else if (/\b(this week|friday|monday|soon|threat|kids|children|dialysis|behind)\b/i.test(redacted)) urgency = "high";
  const hood = NEIGHBORHOODS.find((h) => redacted.toLowerCase().includes(h.toLowerCase())) ?? guessHoodFromStreets(redacted) ?? "Unknown";
  const householdSize = guessHousehold(redacted);
  const language = /\b(hola|necesito|ayuda|gracias|por favor)\b/i.test(redacted) ? "es" : "en";
  const summary = looksSpoken(redacted) ? composeHeadline(needs, householdSize, redacted) : cleanSummary(redacted);
  return { summary, needs: needs.slice(0, 3), urgency, neighborhood: hood, householdSize, language, source: "rules", safety: detectSafety(redacted) };
}

const FILLER = /\b(okay|ok|uh+|um+|hmm+|yeah|so|like|you know)\b/gi;

/** Transcribed speech: long, full of fillers, or multiple sentences — a raw excerpt makes a bad card title. */
function looksSpoken(t: string): boolean {
  const fillers = (t.match(FILLER) ?? []).length;
  return fillers >= 2 || t.length > 160 || (t.match(/[.!?…]/g) ?? []).length >= 3;
}

const HEADLINE: Record<Need, string> = {
  food: "Groceries",
  rent: "Rent assistance",
  utilities: "Utility shutoff help",
  housing: "Emergency housing",
  mediation: "Neighbor mediation",
  safety: "Safety concern",
  health: "Medical / medication help",
  transport: "Transportation",
  youth: "Support for a young person",
  legal: "Legal / paperwork help",
  other: "Request for help",
};

/** Build a short neutral title from what the rules detected, e.g. "Groceries for a household of 5 · by Friday". */
function composeHeadline(needs: Need[], householdSize: number | undefined, t: string): string {
  if (isMissingPerson(t)) return mayBeMinor(t) ? "Missing child reported" : "Missing person reported";
  const primary = needs.find((n) => n !== "youth" && n !== "other") ?? needs[0] ?? "other";
  let s = HEADLINE[primary];
  if (householdSize) s += ` for a household of ${householdSize}`;
  else if (needs.includes("youth") && primary !== "youth") s += " for a family with kids";
  const when = t.match(/\b(tonight|today|tomorrow|this week(end)?|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|until (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|asap)\b/i)?.[0];
  if (when) s += ` · ${when.toLowerCase().replace(/^until/, "needed by").replace(/\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/, (d) => d[0].toUpperCase() + d.slice(1))}`;
  return s;
}

function cleanSummary(t: string): string {
  let s = t.replace(/\[(name|phone|address|email)\]/g, "").replace(/\s+/g, " ").trim();
  s = s.replace(/^((okay|ok|uh+|um+|so|yeah|hi|hello|hey|hola)[,.!]?\s*)+/i, "");
  s = s.replace(/^(this is|it'?s|i'?m|i am|my name is|me llamo|soy)\s*[,.]?\s*(and\s+)?/i, "");
  s = s.replace(/\b(call|text|reach) me at\s*[,.]?/gi, "").replace(/\s+/g, " ");
  s = s.replace(/^[,.\s]+/, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length > 90) s = s.slice(0, 87).replace(/\s+\S*$/, "") + "…";
  return s || "Request for help";
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const NUM = "(\\d|one|two|three|four|five|six|seven|eight|nine)";
const toNum = (w: string) => WORD_NUM[w.toLowerCase()] ?? Number(w);

/** "family of 5" / "5 of us" are totals; "four kids" implies at least one adult. */
function guessHousehold(t: string): number | undefined {
  const total = t.match(new RegExp(`\\b(?:family of|household of)\\s*${NUM}\\b|\\b${NUM}\\s*(?:of us|people)\\b`, "i"));
  if (total) return toNum(total[1] ?? total[2]);
  const kids = t.match(new RegExp(`\\b${NUM}\\s*(?:kids?|children|little ones)\\b`, "i"));
  if (kids) return toNum(kids[1]) + (/\b(single (mom|dad|parent)|just me and)\b/i.test(t) ? 1 : 2);
  return undefined;
}

function guessHoodFromStreets(t: string): string | undefined {
  const m: [RegExp, string][] = [
    [/\b(35th|burleigh|sherman)\b/i, "Sherman Park"],
    [/\b(holton|locust|mlk|king dr)\b/i, "Harambee"],
    [/\b(center st|27th|metcalfe)\b/i, "Metcalfe Park"],
    [/\b(fond du lac|north ave|lindsay)\b/i, "Amani"], // Lindsay Heights core sits in the city's Amani polygon
    [/\b(teutonia|villard|hampton ave)\b/i, "Old North Milwaukee"],
    [/\b(good hope)\b/i, "Thurston Woods"],
    [/\b(capitol dr|capitol drive)\b/i, "Roosevelt Grove"],
    [/\b(cesar chavez|national ave|clarke)\b/i, "Clarke Square"],
    [/\b(mitchell st|mitchell street)\b/i, "Historic Mitchell Street"],
    [/\b(kinnickinnic|kk ave|bay view)\b/i, "Bay View"],
    [/\b(humboldt|riverwest|center and holton)\b/i, "Riverwest"],
  ];
  return m.find(([re]) => re.test(t))?.[1];
}

const SYSTEM = `You structure incoming requests for help for a Milwaukee community organization.
The text has already had personal identifiers replaced with [name], [phone], [address], [email]. Never try to guess them back.
Return strict JSON: {"summary": string (<= 12 words, neutral, no names), "needs": string[] (1-3 from ${JSON.stringify(NEEDS)}), "urgency": "low"|"normal"|"high"|"critical", "neighborhood": one of ${JSON.stringify(NEIGHBORHOODS)} or "Unknown", "householdSize": number|null, "language": "en"|"es"|"hmn"|"other", "safety": "none"|"concern"|"crisis"}.
Safety: "crisis" = thoughts of self-harm, overdose, someone with a weapon or threatening to kill, or a missing person (a child or adult who has not come home, ran away, or cannot be found); "concern" = domestic violence, abuse, feeling unsafe at home, threats, stalking; otherwise "none".
A missing person: needs ["safety"] (add "youth" if they are a minor, never "legal"), urgency "critical", and a summary like "Missing child, last seen near <place> at <time>".
Urgency rules: critical = risk to life/safety, shutoff/eviction within 72h, infant without heat; high = needed within a week, or food/housing/utilities when children are in the home, or health; normal otherwise.
Neighborhood: only pick one if the text names it or names streets you are sure of (35th/Burleigh/Sherman = Sherman Park; Holton/Locust/MLK = Harambee; 27th/Center = Metcalfe Park; Fond du Lac/North Ave = Amani; Teutonia/Villard/Hampton Ave = Old North Milwaukee; Good Hope = Thurston Woods; Capitol Dr = Roosevelt Grove; Cesar Chavez/National = Clarke Square; Mitchell St = Historic Mitchell Street; KK/Bay View = Bay View; Humboldt/Riverwest = Riverwest). Otherwise "Unknown".
Describe the NEED. Never characterize people as dangerous or as suspects.`;

function maxSafety(a?: "concern" | "crisis", b?: "concern" | "crisis") {
  if (a === "crisis" || b === "crisis") return "crisis" as const;
  return a ?? b;
}

export async function structureIntake(rawText: string): Promise<StructuredIntake> {
  const { redactedText, redactions } = redactPII(rawText);
  const fallback = fallbackStructure(redactedText);
  if (!llmConfigured()) return { redactedText, redactions, ...fallback };

  try {
    const parsed = parseJson(await complete({ system: SYSTEM, user: redactedText, temperature: 0.1, json: true })) as Record<string, any>;
    const needs = (Array.isArray(parsed.needs) ? parsed.needs : []).filter((n: string) => (NEEDS as readonly string[]).includes(n)) as Need[];
    return {
      redactedText,
      redactions,
      summary: typeof parsed.summary === "string" && parsed.summary ? parsed.summary : fallback.summary,
      needs: needs.length ? needs : fallback.needs,
      urgency: (["low", "normal", "high", "critical"] as const).includes(parsed.urgency) ? parsed.urgency : fallback.urgency,
      // Street-name rules are deterministic; trust them over a model guess when they matched.
      neighborhood: fallback.neighborhood !== "Unknown" ? fallback.neighborhood : typeof parsed.neighborhood === "string" && parsed.neighborhood ? parsed.neighborhood : fallback.neighborhood,
      householdSize: typeof parsed.householdSize === "number" ? parsed.householdSize : fallback.householdSize,
      language: typeof parsed.language === "string" ? parsed.language : fallback.language,
      source: "llm",
      // The keyword screen is a floor: the model may raise a level but never clear an obvious one.
      safety: maxSafety(parsed.safety === "crisis" || parsed.safety === "concern" ? parsed.safety : undefined, detectSafety(redactedText)),
    };
  } catch (err) {
    console.warn("[ai] falling back to rules:", (err as Error).message);
    return { redactedText, redactions, ...fallback };
  }
}

export async function transcribeAudio(file: File): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set; voice notes need Whisper");
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: key });
  const r = await client.audio.transcriptions.create({ file, model: "whisper-1" });
  return r.text;
}

export async function draftFunderNarrative(stats: Record<string, unknown>): Promise<string> {
  const fallback = `Over the reporting period, ComForce MKE and ${stats.partnerCount} partner organizations handled ${stats.total} requests for help across ${stats.neighborhoodCount} Milwaukee neighborhoods. ${stats.verifiedPct}% of completed requests were confirmed by the resident themselves, with a median time from first contact to delivered help of ${stats.medianMinutes} minutes. The most common needs were ${stats.topNeeds}. Every figure in this report is drawn from the live Relay record and can be audited request by request.`;
  if (!llmConfigured()) return fallback;
  try {
    const out = await complete({
      system: "Write a 120-160 word impact narrative for a nonprofit funder report. Plain, concrete, no hype, no names of individuals. Use only the numbers given.",
      user: JSON.stringify(stats),
      temperature: 0.4,
    });
    return out || fallback;
  } catch {
    return fallback;
  }
}

/** Answers a volunteer's question from the organization's own playbooks. Falls back to keyword retrieval. */
export async function answerFromPlaybooks(question: string, playbooks: { id: string; title: string; body: string; tags: string[] }[]): Promise<{ answer: string; sources: string[] }> {
  const q = question.toLowerCase();
  const scored = playbooks
    .map((p) => ({ p, score: (p.title + " " + p.body + " " + p.tags.join(" ")).toLowerCase().split(/\W+/).filter((w) => w.length > 3 && q.includes(w)).length }))
    .sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, 2).map((s) => s.p);
  const sources = top.map((p) => p.id);
  const fallback = top.length
    ? `From "${top[0].title}":\n${top[0].body.split("\n").slice(0, 4).join("\n")}${top.length > 1 ? `\n\nSee also: ${top[1].title}.` : ""}`
    : "No playbook covers that yet. Ask the on-call lead, then add what you learn to the Guide so the next volunteer has it.";
  if (!llmConfigured() || !top.length) return { answer: fallback, sources };
  try {
    const out = await complete({
      system: "You help community volunteers in Milwaukee. Answer ONLY from the playbooks provided, in 3-6 short numbered steps. If the playbooks do not cover it, say so. Never invent phone numbers or laws.",
      user: `Playbooks:\n${top.map((p) => `## ${p.title}\n${p.body}`).join("\n\n")}\n\nQuestion: ${question}`,
      temperature: 0.2,
    });
    return { answer: out || fallback, sources };
  } catch {
    return { answer: fallback, sources };
  }
}


const CALL_SUMMARY_SYSTEM = `You write a 2-3 sentence handoff note for a community responder, based on a phone-call transcript between an intake assistant and a resident in Milwaukee.
Rules: never include names, phone numbers, or street addresses (they are already replaced with tokens like [name]; keep it that way). Lead with what the resident needs and by when. Mention household size, neighborhood, and anything a responder should know before knocking. Plain, warm, specific. Output only the note itself: no heading, no label, no markdown.`;

const PARTNER_CALL_SYSTEM = `You write a 1-2 sentence status line for a community volunteer, based on a phone call where an intake assistant asked a partner organization (a pantry, clinic, etc.) to take a request.
Say clearly whether they accepted, when the items/service will be ready, who to ask for, and any condition they mentioned. No names of residents. No preamble, no heading, no markdown.`;

/** Second-model pass over a finished call: turns the transcript into a handoff note. */
export async function summarizeCall(turns: { role: "agent" | "caller"; text: string }[], providerSummary?: string, kind: "resident" | "partner" = "resident"): Promise<string> {
  const callerText = turns.filter((t) => t.role === "caller").map((t) => t.text).join(" ");
  // Prefer the call platform's own summary over a raw excerpt when the second model is unavailable.
  const fallback = providerSummary?.trim() || cleanSummary(callerText.slice(0, 220)) || (kind === "partner" ? "Partner call ended; see transcript." : "Resident called the Relay line; see transcript.");
  if (!llmConfigured() || !turns.length) return fallback;
  try {
    const other = kind === "partner" ? "Partner" : "Resident";
    const convo = turns.map((t) => `${t.role === "agent" ? "Assistant" : other}: ${t.text}`).join("\n");
    const out = (await complete({ system: kind === "partner" ? PARTNER_CALL_SYSTEM : CALL_SUMMARY_SYSTEM, user: convo, temperature: 0.2 }))
      ?.replace(/^\s*(\*\*|#+\s*)?[\w\s/-]{0,30}(note|summary)[\w\s/-]{0,10}(\*\*)?:?\s*\n+/i, "")
      .trim();
    return out || fallback;
  } catch (err) {
    console.warn("[ai] call summary fell back:", (err as Error).message);
    return fallback;
  }
}

/** Drafts three grant-application sections in the funder's own language. Only the numbers given may be used. */
export async function draftApplication(input: import("../grants").DraftInput): Promise<import("../grants").ApplicationDraft> {
  const { templateDraft } = await import("../grants");
  const fallback = templateDraft(input);
  if (!llmConfigured()) return fallback;
  const { funder, report, clusters, logic, story } = input;
  const facts = {
    period: report.period.label,
    kpis: report.kpis,
    topNeeds: report.needs.slice(0, 4).map((n) => `${n.label}: ${n.value}`),
    topNeighborhoods: report.neighborhoods.slice(0, 5).map((h) => `${h.neighborhood}: ${h.total}`),
    partners: report.partners.slice(0, 6).map((p) => `${p.name}: ${p.handled} handled, ${p.verified} verified`),
    clusters: { pctInClusters: clusters.pctInClusters, clustersReached: clusters.clustersReached, verifiedInClusters: clusters.verifiedInClusters, top: clusters.rows.slice(0, 5).map((r) => `Cluster ${r.cluster.n} (${r.cluster.name}): ${r.total} requests, ${r.verified} verified`) },
    logicModel: logic,
    story: story?.body ?? null,
    funder: { name: funder.name, program: funder.program, priorities: funder.priorities, metricsLanguage: funder.metricsLanguage },
  };
  try {
    const out = await complete({
      system: `You draft grant application sections for ComForce MKE, a resident-led violence-prevention and crisis-response organization in Milwaukee, using Relay MKE (its intake, dispatch and resident-verification system).
Write for the specific funder named. Use their vocabulary (metricsLanguage) and speak to their stated priorities.
Rules: use ONLY the numbers in the facts; never invent statistics, names, quotes or dollar amounts; no individuals' names; plain and concrete, no hype; do not mention AI models by brand.
Return strict JSON: {"need": string, "outcomes": string, "evaluation": string}. Each 140-200 words, one or two paragraphs, no headings.`,
      user: JSON.stringify(facts),
      temperature: 0.3,
      json: true,
      maxTokens: 1800,
    });
    const j = parseJson(out);
    if (typeof j.need === "string" && typeof j.outcomes === "string" && typeof j.evaluation === "string") return { need: j.need, outcomes: j.outcomes, evaluation: j.evaluation, source: "llm" };
    return fallback;
  } catch {
    return fallback;
  }
}
