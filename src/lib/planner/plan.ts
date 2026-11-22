// Relay local planner: request text -> needs, priority, draft tasks, similar past cases, self-check.
// Runs inside the Next.js server. No API key, no GPU, no network.

import { NeedClassifier, detectNeeds, type DetectedNeed, type NeedId, type NeedModel } from "./needs.ts";
import { readSignals, CRITICAL_HAZARDS, type Signals } from "./signals.ts";
import { NEED_TEMPLATES, type HelperType } from "./templates.ts";

export const ENGINE = "relay-local-planner/1";
/** Model-only scores below this become "possible needs" (no tasks) for a coordinator to decide. */
export const WEAK_GUESS = 0.55;

export interface BankCase {
  id: string;
  theme: string;
  resident_text: string;
  need_categories: string[];
}

export interface DraftTask {
  id: string;
  order: number;
  title: string;
  description: string;
  category: NeedId | "intake" | "follow_up";
  helperType: HelperType;
  suggestedRole: string;
  heldUntilCoordinatorClears?: boolean;
}

export interface PlanOptions {
  /** Needs already on the request (from intake). If given, tasks are made ONLY for these;
   *  anything else the planner notices goes to possibleExtraNeeds for a coordinator to decide. */
  knownNeeds?: NeedId[];
}

export interface Plan {
  engine: string;
  needs: DetectedNeed[];
  possibleExtraNeeds: DetectedNeed[];
  priority: "normal" | "time_sensitive" | "safety_review";
  signals: Omit<Signals, "evidence"> & { notes: string[] };
  tasks: DraftTask[];
  followUpQuestions: string[];
  similarCases: { id: string; theme: string; needs: string[]; similarity: number }[];
  check: { passed: boolean; issues: string[] };
}

export class RelayPlanner {
  private clf: NeedClassifier | null;
  private bank: { c: BankCase; v: Map<number, number> }[] = [];

  constructor(model: NeedModel | null, bank: BankCase[] = []) {
    this.clf = model ? new NeedClassifier(model) : null;
    if (this.clf) this.bank = bank.map((c) => ({ c, v: this.clf!.vectorize(c.resident_text) }));
  }

  plan(text: string, opts: PlanOptions = {}): Plan {
    const clean = (text ?? "").trim();
    let needs = clean ? detectNeeds(clean, this.clf) : [];
    let possibleExtraNeeds: DetectedNeed[] = [];
    // Weak model-only guesses never create tasks; a coordinator sees them as "possible" instead.
    possibleExtraNeeds = needs.filter((n) => n.source === "model" && n.confidence < WEAK_GUESS);
    needs = needs.filter((n) => !(n.source === "model" && n.confidence < WEAK_GUESS));
    // An EMPTY knownNeeds means "the caller has no need list", not "the request has no needs":
    // narrowing to nothing would throw away real detections and leave only the call-back task.
    if (opts.knownNeeds?.length) {
      const known = new Set(opts.knownNeeds);
      possibleExtraNeeds = [...possibleExtraNeeds, ...needs].filter((n) => !known.has(n.need) && n.need !== "safety" && n.need !== "mental_health");
      const detected = new Map(needs.map((n) => [n.need, n]));
      needs = [...known].map((k) => detected.get(k) ?? { need: k, confidence: 1, source: "keyword" as const, evidence: "already on the request" });
      // safety / crisis detection still runs below on the text, regardless of known needs
    }
    const sig = readSignals(clean, needs.some((n) => n.need === "language_access"));

    // A crisis always adds the safety need, even if the model missed it.
    if (sig.crisis && !needs.some((n) => n.need === "safety" || n.need === "mental_health")) {
      needs = [{ need: "safety", confidence: 1, source: "keyword", evidence: "crisis signal" }, ...needs];
    }
    // Safety and mental health come only from explicit signals, never from the model alone.
    if (!sig.crisis) needs = needs.filter((n) => n.need !== "safety" && n.need !== "mental_health");
    if (!sig.crisis && sig.safetyConcern) {
      needs = [{ need: "safety", confidence: 0.9, source: "keyword", evidence: "caller describes a safety concern" }, ...needs];
    }

    const tasks: DraftTask[] = [];
    const add = (t: Omit<DraftTask, "id" | "order">) => tasks.push({ ...t, id: `t${tasks.length + 1}`, order: tasks.length + 1 });

    if (sig.crisis) {
      add({ title: "Coordinator follows the crisis protocol now and contacts emergency services if anyone is in danger",
        description: "Other tasks wait until a coordinator clears this ticket. Do not put crisis details in task cards.",
        category: "safety", helperType: "coordinator_only", suggestedRole: "trained crisis coordinator" });
    } else if (sig.unsafeConditions.length || sig.safetyConcern) {
      const what = [...sig.unsafeConditions, ...(sig.safetyConcern ? ["caller feels unsafe"] : [])].join(", ");
      add({ title: `Coordinator safety check first: ${what}`,
        description: "Call back to confirm everyone is safe, escalate to emergency services if anyone is in danger, and only then send volunteers.",
        category: sig.safetyConcern ? "safety" : "intake", helperType: "coordinator_only", suggestedRole: "coordinator" });
    }
    if (sig.thirdPartyCaller) {
      add({ title: "Get consent from the person who needs help before sharing details or sending anyone",
        description: "The caller is asking for someone else.", category: "intake", helperType: "coordinator_only", suggestedRole: "intake coordinator" });
    }
    if (sig.languageNeed) {
      const t = NEED_TEMPLATES.language_access.tasks[0];
      add({ title: t.title, description: t.why, category: "language_access", helperType: t.helperType, suggestedRole: t.role });
    }

    if (needs.length === 0) {
      add({ title: "Call back to ask what kind of help is needed", description: "The request did not name a clear need; do not guess.",
        category: "intake", helperType: "volunteer", suggestedRole: "intake volunteer" });
    }

    for (const n of needs) {
      if (n.need === "language_access") continue; // already added first
      if (n.need === "safety" || n.need === "mental_health") continue; // covered by the crisis or safety-check task
      for (const t of NEED_TEMPLATES[n.need].tasks) {
        add({ title: t.title, description: `${t.why} (detected from ${n.evidence})`, category: n.need, helperType: t.helperType,
          suggestedRole: t.role, heldUntilCoordinatorClears: sig.crisis || undefined });
      }
    }
    if (needs.length) {
      add({ title: "Follow up with the resident to confirm what help actually arrived and what is still needed",
        description: "A referral is not the same as help received.", category: "follow_up", helperType: "volunteer",
        suggestedRole: "follow-up volunteer", heldUntilCoordinatorClears: sig.crisis || undefined });
    }

    const temperatureRisk = sig.unsafeConditions.some((h) => h === "no heat in cold weather" || h === "extreme heat");
    const critical = sig.unsafeConditions.some((h) => CRITICAL_HAZARDS.has(h)) || (temperatureRisk && sig.vulnerablePerson);
    const priority: Plan["priority"] = sig.crisis || sig.safetyConcern || critical ? "safety_review"
      : sig.urgent.length || sig.unsafeConditions.length ? "time_sensitive" : "normal";

    const followUpQuestions = [...new Set(needs.map((n) => NEED_TEMPLATES[n.need].question))].slice(0, 4);
    if (sig.thirdPartyCaller) followUpQuestions.unshift("Does the person who needs help agree to be contacted?");

    const { evidence, ...rest } = sig;
    const plan: Plan = {
      engine: ENGINE, needs, possibleExtraNeeds, priority, signals: { ...rest, notes: evidence }, tasks,
      followUpQuestions, similarCases: this.similar(clean), check: { passed: true, issues: [] },
    };
    plan.check = checkPlan(plan);
    return plan;
  }

  similar(text: string, k = 3) {
    if (!this.clf || !this.bank.length || !text) return [];
    const q = this.clf.vectorize(text);
    return this.bank
      .map(({ c, v }) => {
        let s = 0;
        for (const [i, x] of q) { const y = v.get(i); if (y !== undefined) s += x * y; }
        return { id: c.id, theme: c.theme, needs: c.need_categories, similarity: Math.round(s * 100) / 100 };
      })
      .filter((r) => r.similarity > 0.1)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }
}

const OVERPROMISE = /\b(secured|restored|guaranteed?|in place|completed|delivered|accepted|approved)\b/i;

/** Same rules as the Rosie judge, applied to every plan before a coordinator sees it. */
export function checkPlan(p: Plan): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const n of p.needs) {
    if (n.need === "safety" || n.need === "mental_health") continue;
    if (!p.tasks.some((t) => t.category === n.need)) issues.push(`need "${n.need}" has no task`);
  }
  for (const t of p.tasks) if (OVERPROMISE.test(t.title)) issues.push(`task "${t.title}" claims an outcome`);
  if (p.signals.crisis) {
    if (p.tasks[0]?.helperType !== "coordinator_only") issues.push("crisis case does not start with a coordinator task");
    if (p.priority !== "safety_review") issues.push("crisis case is not safety_review");
    if (p.tasks.slice(1).some((t) => t.helperType !== "coordinator_only" && !t.heldUntilCoordinatorClears))
      issues.push("volunteer task not held during a crisis");
  }
  if ((p.signals.unsafeConditions.length || p.signals.safetyConcern) && p.tasks[0]?.helperType !== "coordinator_only")
    issues.push("hazard present but no safety check first");
  if (p.signals.thirdPartyCaller && !p.tasks.some((t) => /consent/i.test(t.title)))
    issues.push("third-party caller without a consent step");
  return { passed: issues.length === 0, issues };
}
