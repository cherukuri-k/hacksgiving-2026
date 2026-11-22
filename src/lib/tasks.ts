// All task mutations, plus the server-side permission rules.
//
// Two invariants hold throughout:
//  1. A task NEVER writes the ticket's status. Claim/Delivered/Verified stay exactly as they were;
//     tasks are additive detail, not a second status machine.
//  2. Only a coordinator's review can set a task to `done`. A volunteer saying "finished" moves the
//     task to `in_review`, never past it.
import { db } from "./db";
import { buildSuggestions } from "./ai/taskSuggest";
import { COORDINATOR_ORG } from "./coordination";
import { isAssignedTo } from "./missions";
import { stateForProposal, type TaskProposal } from "./ai/taskUpdate";
import { flagSafety } from "./actions";
import type { HelpRequest, Need, Task, TaskState } from "./types";

let seq = 0;
const newId = () => `tk-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const nowIso = () => new Date().toISOString();

export class TaskError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "TaskError";
  }
}

export interface Actor {
  name: string;
  org: string;
  partnerId?: string;
}

/** Demo-level authorization, mirroring lib/coordination.ts: identity comes from the browser. */
export function isCoordinator(actor: Actor): boolean {
  return actor.org === COORDINATOR_ORG;
}

function requireCoordinator(actor: Actor, what: string): void {
  if (!isCoordinator(actor)) throw new TaskError(`Only a ${COORDINATOR_ORG} coordinator can ${what}.`, 403);
}

async function load(requestId: string): Promise<{ req: HelpRequest; tasks: Task[] }> {
  const req = await db.getRequest(requestId);
  if (!req) throw new TaskError("That request no longer exists.", 404);
  return { req, tasks: [...(req.tasks ?? [])] };
}

function find(tasks: Task[], taskId: string): Task {
  const t = tasks.find((x) => x.id === taskId);
  if (!t) throw new TaskError("That task is not on this ticket.", 404);
  return t;
}

function put(tasks: Task[], updated: Task): Task[] {
  return tasks.map((t) => (t.id === updated.id ? { ...updated, updatedAt: nowIso() } : t));
}

async function save(requestId: string, tasks: Task[], actor: string, text: string, taskId?: string) {
  return db.updateRequest(requestId, { tasks }, { actor, type: "task", text, taskId });
}

// ---------------------------------------------------------------------------
// Suggestions -> approved tasks (coordinator only)
// ---------------------------------------------------------------------------

/**
 * Draft tasks for a ticket that has none — the path for requests that already existed before
 * Relay Missions, or whose intake ran without a model configured.
 *
 * Coordinator-only and explicit: generating costs a model call, so it is never triggered by
 * opening a page or by the 2s poll. Refuses when the ticket already has approved tasks, so it
 * can't quietly duplicate real work.
 */
export async function generateSuggestions(requestId: string, actor: Actor) {
  requireCoordinator(actor, "generate tasks");
  const { req, tasks } = await load(requestId);
  if (tasks.length) throw new TaskError("This ticket already has tasks. Add another one instead.", 409);

  const suggestions = await buildSuggestions(req.redactedText, req.needs, req.safety?.level);
  if (!suggestions.items.length) throw new TaskError("Relay could not draft any tasks for this request.", 422);

  const { plannerActivityNote } = await import("./planner/adapter");
  const detail = suggestions.engine ? ` · ${plannerActivityNote(suggestions)}` : "";
  const saved = await db.updateRequest(requestId, { taskSuggestions: suggestions }, {
    actor: actor.name,
    type: "task",
    text: `${suggestions.aiGenerated ? "AI" : "Relay"} drafted ${suggestions.items.length} suggested task${suggestions.items.length === 1 ? "" : "s"} for review: ${suggestions.items.map((i) => i.title).join(", ")}${detail}`,
  });

  // Same rule as intake, and crisis-only for the same reason: flagging raises urgency and pages
  // the lead, so the planner's broad "concern" signal must not trigger it on its own.
  if (suggestions.plannerSafety === "crisis" && !req.safety) {
    return (await flagSafety(requestId, "crisis", req.redactedText)) ?? saved;
  }
  return saved;
}

export async function approveSuggestions(
  requestId: string,
  actor: Actor,
  items: { id: string; title: string; description: string; category: Need }[],
) {
  requireCoordinator(actor, "approve tasks");
  const { req, tasks } = await load(requestId);
  if (!items.length) throw new TaskError("Keep at least one task, or dismiss them all.");

  const at = nowIso();
  const added: Task[] = items.map((i) => ({
    id: newId(),
    title: i.title.trim(),
    description: i.description.trim(),
    category: i.category,
    state: "needs_assignment" as TaskState,
    notes: [],
    createdAt: at,
    updatedAt: at,
  }));

  return db.updateRequest(
    requestId,
    { tasks: [...tasks, ...added], taskSuggestions: req.taskSuggestions ? { ...req.taskSuggestions, status: "approved", items: [] } : undefined },
    { actor: actor.name, type: "task", text: `${actor.name} approved ${added.length} task${added.length === 1 ? "" : "s"}: ${added.map((t) => t.title).join(", ")}` },
  );
}

export async function dismissSuggestions(requestId: string, actor: Actor) {
  requireCoordinator(actor, "dismiss suggestions");
  const { req } = await load(requestId);
  if (!req.taskSuggestions) return req;
  return db.updateRequest(requestId, { taskSuggestions: { ...req.taskSuggestions, status: "approved", items: [] } }, { actor: actor.name, type: "task", text: `${actor.name} dismissed the suggested tasks` });
}

export async function addTask(requestId: string, actor: Actor, input: { title: string; description: string; category: Need }) {
  requireCoordinator(actor, "add a task");
  const { tasks } = await load(requestId);
  const at = nowIso();
  const task: Task = { id: newId(), title: input.title.trim(), description: input.description.trim(), category: input.category, state: "needs_assignment", notes: [], createdAt: at, updatedAt: at };
  return save(requestId, [...tasks, task], actor.name, `${actor.name} added the task "${task.title}"`, task.id);
}

export async function editTask(requestId: string, actor: Actor, taskId: string, input: { title: string; description: string }) {
  requireCoordinator(actor, "edit a task");
  const { tasks } = await load(requestId);
  const t = find(tasks, taskId);
  return save(requestId, put(tasks, { ...t, title: input.title.trim() || t.title, description: input.description.trim() }), actor.name, `${actor.name} edited "${t.title}"`, taskId);
}

export async function removeTask(requestId: string, actor: Actor, taskId: string) {
  requireCoordinator(actor, "remove a task");
  const { tasks } = await load(requestId);
  const t = find(tasks, taskId);
  return save(requestId, tasks.filter((x) => x.id !== taskId), actor.name, `${actor.name} removed the task "${t.title}"`);
}

// ---------------------------------------------------------------------------
// Assignment (coordinator only)
// ---------------------------------------------------------------------------

/**
 * Assign to a person (they can start work) or refer to a partner. A referral is NOT an
 * acceptance, so a partner assignment lands on `awaiting_partner`.
 */
export async function assignTask(
  requestId: string,
  actor: Actor,
  taskId: string,
  to: { kind: "person"; id: string; name: string } | { kind: "partner"; id: string; name: string },
) {
  requireCoordinator(actor, "assign tasks");
  const { tasks } = await load(requestId);
  const t = find(tasks, taskId);

  if (to.kind === "person") {
    const updated: Task = { ...t, assignee: { kind: "person", id: to.id, name: to.name }, state: "in_progress" };
    return save(requestId, put(tasks, updated), actor.name, `${actor.name} assigned "${t.title}" to ${to.name}`, taskId);
  }
  const handoffs = [...(t.handoffs ?? []), { partnerId: to.id, partnerName: to.name, status: "pending" as const, at: nowIso() }];
  const updated: Task = { ...t, assignee: { kind: "partner", id: to.id, name: to.name }, state: "awaiting_partner", handoffs };
  return save(requestId, put(tasks, updated), actor.name, `${actor.name} referred "${t.title}" to ${to.name}. Awaiting their answer.`, taskId);
}

/** Record how a partner answered. A decline leaves the task unresolved, attempt kept. */
export async function recordPartnerAnswer(requestId: string, actor: Actor, taskId: string, accepted: boolean, reason?: string) {
  requireCoordinator(actor, "record a partner answer");
  const { tasks } = await load(requestId);
  const t = find(tasks, taskId);
  const handoffs = [...(t.handoffs ?? [])];
  const idx = handoffs.map((h) => h.status).lastIndexOf("pending");
  if (idx === -1) throw new TaskError("There is no pending referral to answer for this task.", 409);
  const name = handoffs[idx].partnerName;
  handoffs[idx] = { ...handoffs[idx], status: accepted ? "accepted" : "declined", at: nowIso(), reason: accepted ? undefined : reason };

  const updated: Task = accepted
    ? { ...t, state: "in_progress", handoffs }
    : { ...t, state: "needs_assignment", assignee: undefined, handoffs };
  return save(requestId, put(tasks, updated), actor.name,
    accepted ? `${name} accepted "${t.title}"` : `${name} declined "${t.title}"${reason ? ` (${reason})` : ""}. It needs assigning again.`, taskId);
}

// ---------------------------------------------------------------------------
// Volunteer updates — persisted only after the person confirms
// ---------------------------------------------------------------------------

/** The assignee, or any coordinator, may send an update for a task. */
export function canUpdateTask(task: Task, actor: Actor): boolean {
  return isCoordinator(actor) || isAssignedTo(task, { name: actor.name, partnerId: actor.partnerId });
}

export interface ConfirmedUpdate {
  taskId: string;
  doneItems: string[];
  remainingItems: string[];
  /** Needs mentioned that this task never covered — recorded, but they do not hold it open. */
  outOfScopeItems?: string[];
  blocker?: string;
  proposedState: TaskProposal["proposedState"];
  noteText: string;
}

/**
 * Apply the volunteer's CONFIRMED update. `idempotencyKey` makes a double tap a no-op rather than
 * a duplicate note.
 */
export async function applyConfirmedUpdate(requestId: string, actor: Actor, update: ConfirmedUpdate, idempotencyKey: string) {
  const { tasks } = await load(requestId);
  const t = find(tasks, update.taskId);
  if (!canUpdateTask(t, actor)) throw new TaskError("You can only send updates for a task assigned to you.", 403);

  // Idempotency: the same key already recorded against this task means this is a replay.
  if (t.notes.some((n) => n.text.startsWith(`[${idempotencyKey}]`))) {
    return (await db.getRequest(requestId))!;
  }

  const at = nowIso();
  const nextState = stateForProposal(update.proposedState);
  const noteText = `[${idempotencyKey}] ${update.noteText}`.trim();

  const updated: Task = {
    ...t,
    // The AI can never set Done, and a confirmed update never reopens a finished task.
    state: nextState && t.state !== "done" ? (nextState as TaskState) : t.state,
    lastUpdate: { doneItems: update.doneItems, remainingItems: update.remainingItems, outOfScopeItems: update.outOfScopeItems?.length ? update.outOfScopeItems : undefined, blocker: update.blocker, at, by: actor.name },
    notes: [...t.notes, { at, by: actor.name, text: noteText }],
  };

  const summary = update.doneItems.length ? `Done: ${update.doneItems.join("; ")}` : "Update recorded";
  const left = update.remainingItems.length ? ` · Still left: ${update.remainingItems.join("; ")}` : "";
  const blocked = update.blocker ? ` · Blocker: ${update.blocker}` : "";
  // Logged as a separate need so the history never reads as if this task was responsible for it.
  const extra = update.outOfScopeItems?.length ? ` · Also mentioned (not part of this task): ${update.outOfScopeItems.join("; ")}` : "";
  return save(requestId, put(tasks, updated), actor.name, `${actor.name} on "${t.title}" — ${summary}${left}${blocked}${extra}`, update.taskId);
}

// ---------------------------------------------------------------------------
// Coordinator review — the only route to `done`
// ---------------------------------------------------------------------------

export async function reviewTask(requestId: string, actor: Actor, taskId: string, outcome: "done" | "partly" | "not_done", reason?: string) {
  requireCoordinator(actor, "review tasks");
  const { tasks } = await load(requestId);
  const t = find(tasks, taskId);
  if (outcome !== "done" && !reason?.trim()) throw new TaskError("Give a short reason so the next person knows what is left.");

  const at = nowIso();
  const state: TaskState = outcome === "done" ? "done" : "needs_followup";
  const updated: Task = { ...t, state, review: { outcome, reason: reason?.trim(), by: actor.name, at } };
  const said = outcome === "done" ? "accepted it as done" : outcome === "partly" ? `marked it partly done (${reason?.trim()})` : `marked it not done (${reason?.trim()})`;
  return save(requestId, put(tasks, updated), actor.name, `${actor.name} reviewed "${t.title}" and ${said}`, taskId);
}

export async function addNote(requestId: string, actor: Actor, taskId: string, text: string) {
  const { tasks } = await load(requestId);
  const t = find(tasks, taskId);
  if (!canUpdateTask(t, actor)) throw new TaskError("You can only add notes to a task assigned to you.", 403);
  const notes = [...t.notes, { at: nowIso(), by: actor.name, text }];
  return save(requestId, put(tasks, { ...t, notes }), actor.name, `${actor.name} noted on "${t.title}": ${text}`, taskId);
}
