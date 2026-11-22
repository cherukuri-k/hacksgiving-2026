// The PURE rules around AI task handling: what a model is allowed to say, and what a volunteer's
// words may do to a task.
//
// No relative runtime imports (only `zod`, a bare specifier, and type-only imports) so this runs
// directly under `node --test` type-stripping — the same shape as lib/attention.ts and
// lib/coordination.ts. The model-calling wrappers live in lib/ai/*.
import { z } from "zod";
import type { Need, TaskSuggestionItem } from "./types";

// ---------------------------------------------------------------------------
// Volunteer update proposals
// ---------------------------------------------------------------------------

/** What the volunteer's words imply. `finished_work` means "ready for review", never Done. */
export const PROPOSED_STATES = ["no_change", "started", "mostly_done", "finished_work", "cannot_finish"] as const;
export type ProposedState = (typeof PROPOSED_STATES)[number];

export interface TaskForPrompt {
  id: string;
  title: string;
  description: string;
  state: string;
}

export interface TaskProposal {
  taskId: string;
  proposedState: ProposedState;
  /** Work finished that this task actually asked for. */
  doneItems: string[];
  /** Work still outstanding that is WITHIN this task's own scope. */
  remainingItems: string[];
  /**
   * Needs the volunteer mentioned that this task never covered — e.g. "still needs clothing" on a
   * task that only asked for food. Kept separate so an unrelated need can't hold the task open or
   * make it look half-finished. A coordinator decides whether each one becomes its own task.
   */
  outOfScopeItems: string[];
  blockerReason?: string;
  /** A short phrase copied from the volunteer's own words, so the UI can show the evidence. */
  evidence: string;
}

export interface ProposalResult {
  proposals: TaskProposal[];
  /** True when we could not confidently match a task and the person must choose one. */
  needsManualPick: boolean;
  /** True when no model was available and the UI should show the manual picker. */
  usedFallback: boolean;
}

const ProposalSchema = z.object({
  proposals: z.array(z.object({
    taskId: z.string(),
    proposedState: z.string(),
    doneItems: z.array(z.string().max(160)).max(8).optional(),
    remainingItems: z.array(z.string().max(160)).max(8).optional(),
    outOfScopeItems: z.array(z.string().max(160)).max(8).optional(),
    blockerReason: z.string().max(240).nullable().optional(),
    evidence: z.string().max(240).optional(),
  })).max(10),
});

/**
 * Validate raw model output against the tasks this person may actually update.
 *
 * The model is data, never a command: an id the caller does not own is dropped, an unknown state
 * is dropped, and evidence that does not appear in the update is replaced by the real text.
 */
export function validateProposals(raw: unknown, tasks: TaskForPrompt[], updateText: string): ProposalResult {
  const parsed = ProposalSchema.safeParse(raw);
  if (!parsed.success) return { proposals: [], needsManualPick: true, usedFallback: false };

  const allowed = new Set(tasks.map((t) => t.id));
  const seen = new Set<string>();
  const proposals: TaskProposal[] = [];

  for (const p of parsed.data.proposals) {
    if (!allowed.has(p.taskId) || seen.has(p.taskId)) continue;
    if (!(PROPOSED_STATES as readonly string[]).includes(p.proposedState)) continue;
    if (p.proposedState === "no_change") continue;
    seen.add(p.taskId);
    const ev = (p.evidence ?? "").trim();
    const evidence = ev && updateText.toLowerCase().includes(ev.toLowerCase().slice(0, 16)) ? ev : updateText.slice(0, 140);
    const remainingItems = (p.remainingItems ?? []).filter(Boolean).slice(0, 8);
    const outOfScopeItems = (p.outOfScopeItems ?? []).filter(Boolean).slice(0, 8);
    proposals.push({
      taskId: p.taskId,
      proposedState: p.proposedState as ProposedState,
      doneItems: (p.doneItems ?? []).filter(Boolean).slice(0, 8),
      remainingItems,
      outOfScopeItems,
      blockerReason: p.blockerReason?.trim() || undefined,
      evidence,
    });
  }

  return { proposals, needsManualPick: proposals.length === 0, usedFallback: false };
}

/**
 * True when everything THIS task asked for is finished and the only thing the volunteer still
 * mentions belongs to a different need. The UI says so plainly, so a coordinator does not read a
 * finished food run as half-done because clothing came up.
 */
export function scopeComplete(p: Pick<TaskProposal, "remainingItems" | "outOfScopeItems">): boolean {
  return p.remainingItems.length === 0 && p.outOfScopeItems.length > 0;
}

/**
 * The state a CONFIRMED proposal moves the task to.
 * Note there is deliberately no path to "done": only a coordinator's review can do that.
 */
export function stateForProposal(p: ProposedState): "in_progress" | "in_review" | "needs_followup" | null {
  switch (p) {
    case "started": return "in_progress";
    case "mostly_done": return "in_progress";
    case "finished_work": return "in_review";
    case "cannot_finish": return "needs_followup";
    case "no_change": return null;
  }
}

// ---------------------------------------------------------------------------
// Suggestion fallback (used whenever no model is configured)
// ---------------------------------------------------------------------------

export const SUGGESTION_MAX = 5;

export const SUGGESTION_PER_NEED: Record<Need, { title: string; description: string }> = {
  food: { title: "Coordinate food supplies", description: "Arrange a food delivery or pantry pickup for the household." },
  rent: { title: "Arrange rent assistance", description: "Check eligibility for rent help and connect the household to a fund." },
  utilities: { title: "Arrange utility assistance", description: "Pursue a pledge or payment plan so service stays on." },
  housing: { title: "Arrange housing support", description: "Find somewhere safe for the household to stay." },
  mediation: { title: "Arrange mediation support", description: "Connect the household with a mediator for the dispute." },
  safety: { title: "Follow the safety protocol", description: "Confirm the household is safe and share the right resources." },
  health: { title: "Arrange health support", description: "Connect the household to a clinic or health service." },
  transport: { title: "Arrange transportation", description: "Organise a ride for the household." },
  youth: { title: "Arrange youth support", description: "Connect the young person with a youth programme." },
  legal: { title: "Arrange legal support", description: "Connect the household with legal aid." },
  other: { title: "Coordinate assistance", description: "Work out what this household needs and who can provide it." },
};

let seq = 0;
function suggestionId(): string {
  return `sg-${Date.now().toString(36)}-${(seq++).toString(36)}`;
}

/** Exactly one suggestion per need already on the request. Never invents a need. */
export function fallbackSuggestions(needs: Need[]): TaskSuggestionItem[] {
  const unique = [...new Set(needs)].slice(0, SUGGESTION_MAX);
  const use = unique.length ? unique : (["other"] as Need[]);
  return use.map((n) => ({ id: suggestionId(), title: SUGGESTION_PER_NEED[n].title, description: SUGGESTION_PER_NEED[n].description, category: n }));
}

export { suggestionId };
