// Need detection: TF-IDF + logistic regression (trained on Rosie-generated + public data),
// combined with a small keyword layer for rare needs. Pure TypeScript, no network, no GPU.

export type NeedId =
  | "food" | "water" | "housing" | "utilities" | "medical" | "home_repair" | "disaster_cleanup"
  | "disaster_recovery" | "transportation" | "household_goods" | "clothing" | "financial" | "legal_aid"
  | "language_access" | "internet_access" | "employment" | "mental_health" | "safety";

export interface NeedModel {
  version: number;
  needs: NeedId[];
  terms: string[];
  idf: number[];
  classifiers: Record<string, { intercept: number; threshold: number; weights: Record<string, number> } | null>;
}

export interface DetectedNeed {
  need: NeedId;
  confidence: number; // 0..1
  source: "model" | "keyword" | "model+keyword";
  evidence: string; // short phrase from the request, or the model score
}

const TOKEN = /[a-z0-9']+/g; // must match train_needs.py

export function normalize(text: string): string {
  return text.toLowerCase().replace(/’/g, "'");
}

/** For keyword and signal rules only (NOT the model): unify contractions so "do not" and "don't" match the same rule. */
export function forRules(text: string): string {
  return normalize(text)
    .replace(/\bcan ?not\b/g, "can't").replace(/\bdo not\b/g, "don't").replace(/\bdoes not\b/g, "doesn't")
    .replace(/\bdid not\b/g, "didn't").replace(/\bis not\b/g, "isn't").replace(/\bhas not\b/g, "hasn't")
    .replace(/\bhave not\b/g, "haven't").replace(/\bwill not\b/g, "won't").replace(/\bi am\b/g, "i'm");
}

export function tokenize(text: string): string[] {
  return normalize(text).match(TOKEN) ?? [];
}

/** Word 1-grams and 2-grams, joined with a space exactly like scikit-learn. */
export function ngrams(tokens: string[]): string[] {
  const out = [...tokens];
  for (let i = 0; i + 1 < tokens.length; i++) out.push(tokens[i] + " " + tokens[i + 1]);
  return out;
}

export class NeedClassifier {
  private index = new Map<string, number>();
  private model: NeedModel;
  constructor(model: NeedModel) {
    this.model = model;
    model.terms.forEach((t, i) => this.index.set(t, i));
  }

  /** Sparse l2-normalised TF-IDF vector (sublinear tf), identical to sklearn's TfidfVectorizer. */
  vectorize(text: string): Map<number, number> {
    const counts = new Map<number, number>();
    for (const g of ngrams(tokenize(text))) {
      const i = this.index.get(g);
      if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1);
    }
    const vec = new Map<number, number>();
    let norm = 0;
    for (const [i, c] of counts) {
      const v = (1 + Math.log(c)) * this.model.idf[i];
      vec.set(i, v);
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [i, v] of vec) vec.set(i, v / norm);
    return vec;
  }

  probabilities(text: string): Partial<Record<NeedId, number>> {
    const vec = this.vectorize(text);
    const out: Partial<Record<NeedId, number>> = {};
    for (const need of this.model.needs) {
      const c = this.model.classifiers[need];
      if (!c) continue;
      let z = c.intercept;
      for (const [i, v] of vec) {
        const w = c.weights[String(i)];
        if (w !== undefined) z += w * v;
      }
      out[need] = 1 / (1 + Math.exp(-z));
    }
    return out;
  }

  threshold(need: NeedId): number {
    return this.model.classifiers[need]?.threshold ?? 0.5;
  }
}

// Keyword layer: catches needs the model saw too rarely, and gives a human-readable reason.
// Patterns are deliberately specific to avoid false alarms.
const KEYWORDS: Record<Exclude<NeedId, "safety" | "mental_health">, RegExp> = {
  food: /\b(food|groceries|grocery|hungry|nothing to eat|meals?|pantry|formula|foodshare|snap benefits?)\b/,
  water: /\b(no (running )?water|water (was|is|got|has been) (shut|turned) off|water shut ?off|drinking water|bottled water)\b/,
  housing: /\b(evict(ed|ion)?|landlord|rent|homeless|place to stay|nowhere (stable )?to (stay|live|go)|temporary (lodging|housing)|staying with|shelter|lose (my|our) (home|apartment|house))\b/,
  utilities: /\b(electric(ity)?|power (is |was )?(out|off)|lost power|without power|no power|gas bill|heat(ing)? bill|utility|utilities|disconnect(ion)?|shut ?off notice|light bill|energy assistance)\b/,
  medical: /\b(doctor|clinic|medicine|medication|prescriptions?|hospital|insulin|medical)\b/,
  home_repair: /\b(furnace|heater|roof|leak(ing|s)?|ramp|broken (window|door|stairs|steps)|repair|plumbing|air conditioning|a\/c|ac (broke|is broken))\b/,
  disaster_cleanup: /\b(flood(ed|ing)?|basement (is |was )?(full of|under) water|water in (the|my|our) basement|muck|debris|mold|storm damage)\b/,
  disaster_recovery: /\b(fema|disaster (aid|assistance|help)|damage report|recovery (help|steps)|fire damaged|house fire|insurance (claim)?|federal (help|aid|assistance))\b/,
  transportation: /\b(ride|rides|transportation|bus pass|can't get (there|to (it|the pantry|the store|my appointment))|get to (my|the|her|his) (appointment|doctor|court|work|job)|car (broke|is broken|broke down)|can'?t drive)\b/,
  household_goods: /\b(diapers|fridge|refrigerator|stove|furniture|bed|appliance|wipes|school supplies)\b/,
  clothing: /\b(clothes|clothing|coat|coats|jacket|shoes|boots|blankets?)\b/,
  financial: /\b(can'?t (afford|pay)|behind on (bills|rent)|hours (got )?cut|lost (my|his|her) job|paycheck|money|benefits? (were |was )?(delayed|stopped|cut))\b/,
  legal_aid: /\b(lawyer|attorney|court( date)?|legal (help|aid)|eviction (notice|hearing)|my rights)\b/,
  language_access: /\b(interpreter|translat(e|or|ion)|spanish|hmong|somali|arabic|burmese|doesn'?t speak (much )?english|don'?t speak (much )?english|in (spanish|hmong|somali|arabic))\b/,
  internet_access: /\b(internet|wifi|wi-fi|hotspot|online access|don't have a computer|no computer)\b/,
  employment: /\b((find|finding|looking for|need|apply for|applying for) (a )?(job|jobs|work)|unemployed|resume|job search|lost (my|his|her) job)\b/,
};

export function detectNeeds(text: string, clf: NeedClassifier | null): DetectedNeed[] {
  const t = forRules(text);
  const found = new Map<NeedId, DetectedNeed>();
  if (clf) {
    const p = clf.probabilities(text);
    for (const [need, prob] of Object.entries(p) as [NeedId, number][]) {
      if (prob >= clf.threshold(need)) {
        found.set(need, { need, confidence: round(prob), source: "model", evidence: `model score ${round(prob)}` });
      }
    }
  }
  for (const [need, rx] of Object.entries(KEYWORDS) as [NeedId, RegExp][]) {
    const m = t.match(rx);
    if (!m) continue;
    const prev = found.get(need);
    found.set(need, prev
      ? { ...prev, source: "model+keyword", confidence: Math.max(prev.confidence, 0.9), evidence: `"${m[0]}"` }
      : { need, confidence: 0.75, source: "keyword", evidence: `"${m[0]}"` });
  }
  return [...found.values()].sort((a, b) => b.confidence - a.confidence);
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}
