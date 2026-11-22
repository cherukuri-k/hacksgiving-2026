// Bridge between the local planner (lib/planner) and Relay's task-suggestion shape.
//
// The planner's logic is NOT reimplemented here. This file only translates vocabulary:
//   app `Need`  <->  planner `NeedId`,
//   planner `DraftTask`  ->  app `TaskSuggestionItem`.
//
// Everything it produces is a SUGGESTION: it assigns nobody, contacts nobody, makes no network
// call, and never changes the ticket's status or urgency. A coordinator approves first.
import { join } from "node:path";
import { redactPII } from "../ai/redact";
import { detectSafety, isMissingPerson, mayBeMinor } from "../safety";
import { SUGGESTION_MAX, SUGGESTION_PER_NEED, suggestionId } from "../taskRules";
import type { Need, SafetyLevel, SuggestionPriority, TaskSuggestionItem, TaskSuggestions } from "../types";
import type { DraftTask, NeedId, Plan } from "./index.ts";

/**
 * App need -> planner need. Deliberately at most ONE planner need per app need: every entry in
 * `knownNeeds` produces its own task set, so expanding "housing" into four planner needs would
 * quadruple the drafts.
 *
 * `rent` maps to the planner's `housing`, whose template is "Refer to rent assistance, mediation,
 * or shelter options" — a closer fit than `financial`, which is about bills and benefits.
 *
 * `mediation`, `youth` and `other` have no planner equivalent. They are not forced into a
 * near-miss category; they keep the app's own deterministic template (SUGGESTION_PER_NEED).
 */
export const APP_TO_PLANNER: Partial<Record<Need, NeedId>> = {
  food: "food",
  rent: "housing",
  housing: "housing",
  utilities: "utilities",
  health: "medical",
  transport: "transportation",
  legal: "legal_aid",
  safety: "safety",
};

/** App needs the planner has no vocabulary for; they fall back to the app's own templates. */
export function unmappedNeeds(needs: Need[]): Need[] {
  return [...new Set(needs)].filter((n) => !APP_TO_PLANNER[n]);
}

/** Planner needs to ask for, in the request's own order, de-duplicated. */
export function plannerNeedsFor(needs: Need[]): NeedId[] {
  const out: NeedId[] = [];
  for (const n of [...new Set(needs)]) {
    const p = APP_TO_PLANNER[n];
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * Planner need -> the app need it came from ON THIS REQUEST, so a ticket whose need was "rent"
 * gets its tasks back under "rent" and not under "housing". When two app needs collapse onto one
 * planner need (rent + housing), the first one on the request wins.
 */
function originOf(needs: Need[]): Map<NeedId, Need> {
  const m = new Map<NeedId, Need>();
  for (const n of [...new Set(needs)]) {
    const p = APP_TO_PLANNER[n];
    if (p && !m.has(p)) m.set(p, n);
  }
  return m;
}

/** Process tasks the planner adds around the need tasks. Always kept, whatever the known needs. */
const PROCESS_CATEGORIES = new Set<DraftTask["category"]>(["intake", "follow_up", "safety", "language_access"]);

/**
 * A task's app category. Need tasks go back to the app need they came from; the planner's
 * process tasks (intake, consent, follow-up, safety) attach to a need already on the request so a
 * suggestion never introduces a category the ticket does not have.
 */
function toAppNeed(category: DraftTask["category"], origin: Map<NeedId, Need>, needs: Need[]): Need {
  // A safety task is always filed under safety, even if intake had not recorded that need yet:
  // calling it "youth" because youth happened to be first would hide it on the board.
  if (category === "safety") return "safety";
  const direct = origin.get(category as NeedId);
  if (direct) return direct;
  return needs[0] ?? "other";
}

/** crisis beats concern beats nothing. */
function maxLevel(a?: SafetyLevel, b?: SafetyLevel): SafetyLevel | undefined {
  if (a === "crisis" || b === "crisis") return "crisis";
  return a ?? b;
}

const isSafetyFirst = (t: DraftTask) => t.helperType === "coordinator_only" && /crisis protocol|safety check|safety before/i.test(t.title);
const isConsent = (t: DraftTask) => /consent/i.test(t.title);
const isFollowUp = (t: DraftTask) => t.category === "follow_up";

/**
 * Trim a plan to `max` tasks without ever losing the ones that keep people safe. Kept in order of
 * priority: (a) the coordinator crisis/safety task, (b) the consent task, (c) at least one task
 * per need, (d) the closing follow-up. A need's SECOND task is dropped first; the follow-up goes
 * before any need loses its only task, and (a) and (b) are never dropped.
 */
/**
 * How many drafts this plan may keep. A safety step does not spend one of the ordinary slots:
 * without this, "coordinator safety check + consent + one task per need" fills all five on a
 * three-need ticket and the closing follow-up is squeezed out. Applies whether the safety task
 * came from the planner or was injected by the adapter — it is the same slot either way.
 */
export function taskCap(tasks: DraftTask[], max = SUGGESTION_MAX): number {
  return tasks.some(isSafetyFirst) ? max + 1 : max;
}

export function capTasks(tasks: DraftTask[], max = SUGGESTION_MAX): DraftTask[] {
  if (tasks.length <= max) return tasks;
  const keep = new Set<string>();
  const seen = new Set<string>();

  for (const t of tasks) if (isSafetyFirst(t) || isConsent(t)) { keep.add(t.id); seen.add(t.category); }
  // (c) one task per remaining need category
  for (const t of tasks) {
    if (keep.has(t.id) || isFollowUp(t) || seen.has(t.category)) continue;
    seen.add(t.category);
    keep.add(t.id);
  }
  // (d) the closing follow-up, only if there is still room
  const followUp = tasks.find(isFollowUp);
  if (followUp && keep.size < max) keep.add(followUp.id);
  // (e) spend anything left on the needs' second tasks, in the planner's own order
  for (const t of tasks) {
    if (keep.size >= max) break;
    keep.add(t.id);
  }

  let kept = tasks.filter((t) => keep.has(t.id));
  // (a) + (b) + (c) can still exceed the cap on a busy ticket. Drop from the end, never the
  // coordinator or consent task.
  for (let i = kept.length - 1; i >= 0 && kept.length > max; i--) {
    if (isSafetyFirst(kept[i]) || isConsent(kept[i])) continue;
    kept = [...kept.slice(0, i), ...kept.slice(i + 1)];
  }
  return kept;
}

/** The task Relay adds when its own safety screen fires but the planner's signals did not. */
export function coordinatorSafetyTask(level: "concern" | "crisis"): DraftTask {
  return {
    id: "relay-safety",
    order: 0,
    title: "Coordinator checks safety before any volunteer is sent",
    description:
      level === "crisis"
        ? "Relay's safety screen flagged this request as a crisis even though the planner did not. Follow the crisis protocol, contact emergency services if anyone is in danger, and clear the ticket before the other tasks start."
        : "Relay's safety screen flagged a safety concern even though the planner did not. Call back to confirm everyone is safe, then clear the ticket before the other tasks start.",
    category: "safety",
    helperType: "coordinator_only",
    suggestedRole: "trained crisis coordinator",
  };
}

export interface PlannerSuggestionResult extends TaskSuggestions {
  /** Combined safety level Relay's own screen read, if any. The caller still owns flagging. */
  appSafety?: SafetyLevel;
  /** True when the adapter had to add a coordinator task the planner did not produce. */
  injectedSafetyTask?: boolean;
}

/**
 * The steps for a missing child or adult. The planner has no template for this: it read the
 * caller as a third party and asked for consent "from the person who needs help" — the person
 * who is missing — followed by "ask what kind of help is needed". A missing person has a fixed
 * order instead: the police report comes before anything ComForce organizes, and nothing is
 * shared publicly without the family and the police agreeing. Every step is a coordinator's.
 */
export function missingPersonTasks(minor: boolean): DraftTask[] {
  const step = (order: number, title: string, description: string, category: DraftTask["category"] = "safety"): DraftTask => ({
    id: `relay-missing-${order}`, order, title, description, category,
    helperType: "coordinator_only", suggestedRole: "Missing Persons Network coordinator", heldUntilCoordinatorClears: true,
  });
  return [
    step(1, "Ask whether the caller has reported this by calling 911", "Milwaukee Police take a missing person report at once; there is no 24-hour wait. If it has not been reported, ask the caller to ring 911 now and to stay reachable."),
    step(2, "Hand the report to the Missing Persons Network lead", "Pass on what the caller gave: age, where and when the person was last seen, and what they were wearing. Relay holds no name for the missing person."),
    ...(minor ? [step(3, "Offer the missing-child hotline once police have the report", "National Center for Missing & Exploited Children, 1-800-843-5678, any hour. It works alongside the police report, not instead of it.")] : []),
    step(4, "Ask the family how ComForce should help", "Someone to wait with them, help speaking with police, or community awareness. Share nothing publicly unless the family asks for it and the police agree."),
    step(5, "Follow up with the family until the person is found", "Check in with the caller, record what help was given, and note what is still needed.", "follow_up"),
  ];
}

/**
 * Draft tasks for a request with the local planner. No API key, no network, no GPU.
 *
 * `needs` are the needs already recorded at intake: tasks only ever cover those (the Missions
 * rule). Anything else the planner notices is reported as `possibleExtraNeeds` for a coordinator
 * to decide on, never as a task.
 */
export async function planSuggestions(rawText: string, needs: Need[], knownSafety?: SafetyLevel): Promise<PlannerSuggestionResult> {
  const generatedAt = new Date().toISOString();
  // Redact before the planner sees anything, even though intake already stored redacted text.
  const text = redactPII(rawText).redactedText;

  // Loaded lazily and only here, so the 2 MB model never reaches a client bundle.
  const { getPlanner, checkPlan } = await import("./index.ts");
  const planner = getPlanner(join(process.cwd(), "lib/planner/model"));

  const wanted = plannerNeedsFor(needs);
  const origin = originOf(needs);
  const plan = planner.plan(text, wanted.length ? { knownNeeds: wanted } : {});

  // Belt and braces: with knownNeeds the planner already restricts itself, but when the request's
  // needs have no planner equivalent it detects freely, and those tasks must not reach the ticket.
  const allowed = new Set<NeedId>(wanted);
  let tasks = plan.tasks.filter((t) => PROCESS_CATEGORIES.has(t.category) || allowed.has(t.category as NeedId));

  // Needs the planner detected confidently but that are not on this request. Their tasks were just
  // filtered out, so without this they would vanish silently instead of reaching a coordinator.
  const droppedNeeds = plan.needs.filter((n) => !allowed.has(n.need) && n.need !== "safety" && n.need !== "mental_health");

  // Relay's own safety screen is independent of the planner's. Either one raising a flag wins.
  // `knownSafety` carries what intake already decided (its model can see what the keyword rules
  // miss), so the adapter never reads less of the situation than the ticket does.
  const appSafety = maxLevel(knownSafety, detectSafety(text));
  const plannerSawDanger = plan.signals.crisis || plan.signals.safetyConcern || plan.signals.unsafeConditions.length > 0;

  // Compare like with like. A hazard the planner noticed is NOT an answer to a crisis Relay saw:
  // a missing child whose furnace is also broken must not be filed as merely time-sensitive.
  const needsEscalation =
    appSafety === "crisis" ? !plan.signals.crisis : appSafety === "concern" ? !plannerSawDanger : false;

  let injected = false;
  if (needsEscalation) {
    const held = tasks.map((t) => ({ ...t, heldUntilCoordinatorClears: true }));
    // Only a task that is ABOUT safety counts. Several ordinary templates (housing, medical) and
    // the consent step also lead with a coordinator; treating those as the safety step would
    // leave a flagged ticket whose first task is "Clarify the housing situation".
    if (tasks[0] && isSafetyFirst(tasks[0])) {
      tasks = [tasks[0], ...held.slice(1)];
    } else {
      injected = true;
      tasks = [coordinatorSafetyTask(appSafety!), ...held];
    }
  }

  // A missing person follows its own protocol, not a need template. Keep the coordinator's
  // safety step the block above put first and replace everything after it.
  const missing = isMissingPerson(text);
  if (missing && tasks[0] && isSafetyFirst(tasks[0])) {
    const first: DraftTask = { ...tasks[0], description: "A person is reported missing. Read the request, make sure the caller is safe and can be reached, and clear the ticket before the steps below start." };
    tasks = [first, ...missingPersonTasks(mayBeMinor(text))];
  }

  // The protocol already covers a missing person's ticket; a generic "Arrange youth support" has no place in it.
  const fallbacks = (missing ? [] : unmappedNeeds(needs)).map((n) => ({
    id: suggestionId(),
    title: SUGGESTION_PER_NEED[n].title,
    description: SUGGESTION_PER_NEED[n].description,
    category: n,
  }));

  // Leave room for the app-template needs, but never below what safety requires.
  const cap = taskCap(tasks);
  const kept = capTasks(tasks, Math.max(1, cap - fallbacks.length));

  // Re-check the trimmed plan with the planner's own rules, against the needs we kept tasks for.
  const capped: Plan = { ...plan, tasks: kept, needs: plan.needs.filter((n) => allowed.has(n.need)) };
  const check = checkPlan(capped);

  const seenTitle = new Set<string>();
  const planned: TaskSuggestionItem[] = [];
  for (const t of kept) {
    const key = t.title.trim().toLowerCase();
    if (seenTitle.has(key)) continue;
    seenTitle.add(key);
    planned.push({ id: suggestionId(), title: t.title, description: t.description, category: toAppNeed(t.category, origin, needs) });
  }

  const priority: SuggestionPriority = needsEscalation ? "safety_review" : plan.priority;
  // What the PLANNER's own signals read, so the caller can flag a ticket Relay's screen missed.
  const plannerSafety: SafetyLevel | undefined = plan.signals.crisis
    ? "crisis"
    : plan.signals.safetyConcern
      ? "concern"
      : undefined;

  return {
    status: "draft",
    items: [...planned, ...fallbacks].slice(0, cap),
    generatedAt,
    // A local model, not a hosted one: these are not "AI drafts" in the sense the UI means.
    aiGenerated: false,
    engine: plan.engine,
    priority,
    possibleExtraNeeds: [...plan.possibleExtraNeeds, ...droppedNeeds].map((n) => ({
      label: n.need.replace(/_/g, " "),
      confidence: Math.round(n.confidence * 100) / 100,
    })),
    followUpQuestions: plan.followUpQuestions,
    signalNotes: plan.signals.notes,
    similarCases: plan.similarCases.map((c) => ({ id: c.id, theme: c.theme, similarity: c.similarity })),
    check,
    heldForCoordinator: needsEscalation || plan.signals.crisis || undefined,
    plannerSafety,
    appSafety,
    injectedSafetyTask: injected || undefined,
  };
}

/** Human-readable one-liner for the activity history, so the record says what drafted the tasks. */
export function plannerActivityNote(s: TaskSuggestions): string {
  const bits = [`${s.engine ?? "local planner"} drafted ${s.items.length} task${s.items.length === 1 ? "" : "s"}`];
  if (s.priority) bits.push(`priority ${s.priority}`);
  if (s.possibleExtraNeeds?.length) bits.push(`possible extra needs: ${s.possibleExtraNeeds.map((n) => n.label).join(", ")} (not drafted)`);
  if (s.signalNotes?.length) bits.push(`signals: ${s.signalNotes.join("; ")}`);
  if (s.check && !s.check.passed) bits.push(`self-check flagged: ${s.check.issues.join("; ")}`);
  if (s.heldForCoordinator) bits.push("held until a coordinator clears the ticket");
  return bits.join(" · ");
}
