// Pure rollups over a ticket's tasks.
//
// No runtime imports (type-only, relative) so this is a plain function of its inputs, directly
// unit-testable with `node --test`, and so every screen agrees on the numbers. Counters are NEVER
// stored on the request — they are always derived here.
import type { Task, TaskState } from "./types";

/**
 * Safety and consent steps, recognised by the planner's own wording. They always come first, a
 * model may never rewrite them (lib/taskRefineRules.ts), and the board marks them as fixed.
 */
const LOCKED_STEP = /crisis protocol|safety check|safety before|consent/i;
export const isLockedStep = (item: { title: string }) => LOCKED_STEP.test(item.title);

export interface TaskRollup {
  total: number;
  done: number;
  inReview: number;
  needsFollowUp: number;
  needsAssignment: number;
  /** Approved work that has not reached `done` yet. */
  outstanding: number;
  /** Drafts awaiting a coordinator's review. */
  suggestions: number;
  /** 0-100, by completed tasks. 0 when the ticket has no tasks. */
  pct: number;
}

export interface RollupInput {
  tasks?: Task[];
  taskSuggestions?: { status: "draft" | "approved"; items: unknown[] };
}

export function rollup(req: RollupInput | undefined): TaskRollup {
  const tasks = req?.tasks ?? [];
  const total = tasks.length;
  const by = (s: TaskState) => tasks.filter((t) => t.state === s).length;
  const done = by("done");
  const suggestions = req?.taskSuggestions?.status === "draft" ? (req.taskSuggestions.items?.length ?? 0) : 0;
  return {
    total,
    done,
    inReview: by("in_review"),
    needsFollowUp: by("needs_followup"),
    needsAssignment: by("needs_assignment"),
    outstanding: total - done,
    suggestions,
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

/**
 * The one quiet line a Board card shows, or null for a legacy ticket with nothing to say — its
 * card then renders exactly as it always did.
 */
export function boardTaskLine(req: RollupInput | undefined): string | null {
  const r = rollup(req);
  if (r.total > 0) {
    const base = `${r.done}/${r.total} task${r.total === 1 ? "" : "s"} done`;
    return r.inReview > 0 ? `${base} · ${r.inReview} in review` : base;
  }
  if (r.suggestions > 0) return `${r.suggestions} suggested task${r.suggestions === 1 ? "" : "s"}`;
  return null;
}

/**
 * Whether the ticket still has approved work that has not finished.
 *
 * Used to keep the ticket honest: a Board column may say Delivered or Verified while tasks remain,
 * so the UI surfaces this rather than letting a rollup quietly imply everything arrived.
 */
export function hasUnfinishedTasks(req: RollupInput | undefined): boolean {
  return rollup(req).outstanding > 0;
}

/** Tasks this person is responsible for right now. */
export function tasksAssignedTo(tasks: Task[] | undefined, identity: { name: string; partnerId?: string }): Task[] {
  return (tasks ?? []).filter((t) => isAssignedTo(t, identity));
}

export function isAssignedTo(task: Task, identity: { name: string; partnerId?: string }): boolean {
  if (!task.assignee) return false;
  if (task.assignee.kind === "person") return task.assignee.name === identity.name || task.assignee.id === identity.name;
  return Boolean(identity.partnerId) && task.assignee.id === identity.partnerId;
}

/** The single primary action a task card offers, chosen by state. */
export type PrimaryAction = "assign" | "partner_answer" | "send_update" | "review" | "assign_again" | "none";

export function primaryAction(state: TaskState): PrimaryAction {
  switch (state) {
    case "needs_assignment": return "assign";
    case "awaiting_partner": return "partner_answer";
    case "in_progress": return "send_update";
    case "in_review": return "review";
    case "needs_followup": return "assign_again";
    case "done": return "none";
  }
}

export const PRIMARY_ACTION_LABEL: Record<PrimaryAction, string> = {
  assign: "Assign",
  partner_answer: "Record partner answer",
  send_update: "Send update",
  review: "Review",
  assign_again: "Assign again",
  none: "",
};

/** Status chip tone. Colour carries meaning; the UI always pairs it with an icon and text. */
export type TaskTone = "neutral" | "brand" | "amber" | "green" | "red";

export const TASK_TONE: Record<TaskState, TaskTone> = {
  needs_assignment: "amber",
  awaiting_partner: "brand",
  in_progress: "brand",
  in_review: "amber",
  done: "green",
  needs_followup: "red",
};

/** Plain-words status, including "Waiting on <Partner>" when we know who. */
export function stateLabel(task: Pick<Task, "state" | "assignee">): string {
  if (task.state === "awaiting_partner" && task.assignee?.kind === "partner") return `Waiting on ${task.assignee.name}`;
  return {
    needs_assignment: "Needs assignment",
    awaiting_partner: "Awaiting partner",
    in_progress: "In progress",
    in_review: "Ready for review",
    done: "Done",
    needs_followup: "Needs follow-up",
  }[task.state];
}

/**
 * A task is "quiet" when it is still open but nothing has happened on it for a while. This is how
 * unfinished help becomes visible instead of just sitting in a column: a finished or
 * awaiting-review task is never quiet, because somebody already owes it an action.
 */
export const QUIET_AFTER_MS = 24 * 60 * 60 * 1000;

export function lastActivityAt(task: Pick<Task, "lastUpdate" | "updatedAt">): string {
  return task.lastUpdate?.at ?? task.updatedAt;
}

export function quietFor(task: Pick<Task, "state" | "lastUpdate" | "updatedAt">, now: number, after = QUIET_AFTER_MS): number {
  if (task.state === "done") return 0;
  const since = Date.parse(lastActivityAt(task));
  if (!Number.isFinite(since) || !now) return 0;
  const idle = now - since;
  return idle > after ? idle : 0;
}

export function isQuiet(task: Pick<Task, "state" | "lastUpdate" | "updatedAt">, now: number, after = QUIET_AFTER_MS): boolean {
  return quietFor(task, now, after) > 0;
}

/** The filters offered above the task list, so a long ticket stays readable. */
export type TaskFilter = "all" | "needs_action" | "mine" | "done";

/** Work that is waiting on somebody right now — the default view for a coordinator. */
export function needsAction(task: Task): boolean {
  return task.state === "needs_assignment" || task.state === "in_review" || task.state === "needs_followup";
}

export function filterTasks(tasks: Task[], filter: TaskFilter, identity: { name: string; partnerId?: string }): Task[] {
  switch (filter) {
    case "needs_action": return tasks.filter(needsAction);
    case "mine": return tasks.filter((t) => isAssignedTo(t, identity));
    case "done": return tasks.filter((t) => t.state === "done");
    case "all": return tasks;
  }
}

/** Short relative time, matching the tone of lib/stats.ts timeAgo. */
export function relTime(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (!now) return "";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
