// Relay Missions — rollups, AI-output validation and the safety floor.
// Type-only relative imports so `node --test` type-stripping can run these directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boardTaskLine, filterTasks, hasUnfinishedTasks, isAssignedTo, isQuiet, lastActivityAt,
  needsAction, primaryAction, rollup, stateLabel,
} from "./missions.ts";
import { validateProposals, stateForProposal, scopeComplete, fallbackSuggestions, type TaskForPrompt } from "./taskRules.ts";
import { detectSafety } from "./safety.ts";
import type { Task, TaskState } from "./types";

const AT = "2026-11-21T10:00:00.000Z";
const task = (id: string, state: TaskState, extra: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, description: "", category: "other", state, notes: [], createdAt: AT, updatedAt: AT, ...extra,
});

// --- rollups ---------------------------------------------------------------

test("rollup counts done, in review and follow-up without storing counters", () => {
  const tasks = [task("a", "done"), task("b", "in_review"), task("c", "needs_assignment"), task("d", "needs_followup")];
  const r = rollup({ tasks });
  assert.equal(r.total, 4);
  assert.equal(r.done, 1);
  assert.equal(r.inReview, 1);
  assert.equal(r.needsFollowUp, 1);
  assert.equal(r.outstanding, 3);
  assert.equal(r.pct, 25);
});

test("a legacy ticket with no tasks shows no board line and no unfinished work", () => {
  assert.equal(boardTaskLine(undefined), null);
  assert.equal(boardTaskLine({}), null);
  assert.equal(hasUnfinishedTasks({}), false);
  assert.equal(rollup({}).total, 0);
});

test("the board line reads suggestions before approval and progress after", () => {
  assert.equal(boardTaskLine({ taskSuggestions: { status: "draft", items: [1, 2, 3] } }), "3 suggested tasks");
  // Approved suggestions are no longer advertised as drafts.
  assert.equal(boardTaskLine({ taskSuggestions: { status: "approved", items: [] } }), null);
  assert.equal(boardTaskLine({ tasks: [task("a", "done"), task("b", "in_progress"), task("c", "in_review")] }), "1/3 tasks done · 1 in review");
});

test("one done task never implies the whole ticket is finished", () => {
  const tasks = [task("a", "done"), task("b", "needs_assignment"), task("c", "in_progress")];
  const r = rollup({ tasks });
  assert.equal(r.done, 1);
  assert.ok(r.outstanding > 0, "other tasks are still outstanding");
  assert.equal(hasUnfinishedTasks({ tasks }), true);
  assert.notEqual(r.pct, 100);
});

test("a partner assignment reads as waiting on that partner, not accepted", () => {
  const t = task("a", "awaiting_partner", { assignee: { kind: "partner", id: "p-pantry", name: "Northside Community Pantry" } });
  assert.equal(stateLabel(t), "Waiting on Northside Community Pantry");
  assert.equal(primaryAction(t.state), "partner_answer");
});

test("each state offers exactly one primary action, and a done task offers none", () => {
  assert.equal(primaryAction("needs_assignment"), "assign");
  assert.equal(primaryAction("in_progress"), "send_update");
  assert.equal(primaryAction("in_review"), "review");
  assert.equal(primaryAction("needs_followup"), "assign_again");
  assert.equal(primaryAction("done"), "none");
});

test("assignment check matches a person by name and a partner by id", () => {
  const person = task("a", "in_progress", { assignee: { kind: "person", id: "Rosa M.", name: "Rosa M." } });
  const partner = task("b", "awaiting_partner", { assignee: { kind: "partner", id: "p-pantry", name: "Pantry" } });
  assert.equal(isAssignedTo(person, { name: "Rosa M." }), true);
  assert.equal(isAssignedTo(person, { name: "Someone Else" }), false);
  assert.equal(isAssignedTo(partner, { name: "X", partnerId: "p-pantry" }), true);
  assert.equal(isAssignedTo(partner, { name: "X", partnerId: "p-other" }), false);
  assert.equal(isAssignedTo(task("c", "needs_assignment"), { name: "Rosa M." }), false);
});

// --- quiet (stalled) work and filters --------------------------------------

test("open work with no recent activity is flagged quiet; finished work never is", () => {
  const now = Date.parse("2026-11-21T10:00:00.000Z");
  const twoDaysAgo = "2026-11-19T10:00:00.000Z";
  const anHourAgo = "2026-11-21T09:00:00.000Z";

  assert.equal(isQuiet({ state: "in_progress", updatedAt: twoDaysAgo }, now), true);
  assert.equal(isQuiet({ state: "in_review", updatedAt: twoDaysAgo }, now), true, "waiting on a coordinator still counts");
  assert.equal(isQuiet({ state: "in_progress", updatedAt: anHourAgo }, now), false);
  // A completed task is never nagged about.
  assert.equal(isQuiet({ state: "done", updatedAt: twoDaysAgo }, now), false);
});

test("quiet uses the last volunteer update, not just the record's updatedAt", () => {
  const now = Date.parse("2026-11-21T10:00:00.000Z");
  const task = { state: "in_progress" as const, updatedAt: "2026-11-19T10:00:00.000Z", lastUpdate: { doneItems: [], remainingItems: [], at: "2026-11-21T09:30:00.000Z", by: "Rosa M." } };
  assert.equal(lastActivityAt(task), "2026-11-21T09:30:00.000Z");
  assert.equal(isQuiet(task, now), false, "a recent update means the task is not stalled");
});

test("filters split the list the way the chips claim", () => {
  const tasks = [
    task("a", "done"),
    task("b", "needs_assignment"),
    task("c", "in_review"),
    task("d", "in_progress", { assignee: { kind: "person", id: "Rosa M.", name: "Rosa M." } }),
    task("e", "needs_followup"),
  ];
  const me = { name: "Rosa M." };
  assert.equal(filterTasks(tasks, "all", me).length, 5);
  assert.deepEqual(filterTasks(tasks, "needs_action", me).map((t) => t.id), ["b", "c", "e"]);
  assert.deepEqual(filterTasks(tasks, "mine", me).map((t) => t.id), ["d"]);
  assert.deepEqual(filterTasks(tasks, "done", me).map((t) => t.id), ["a"]);
  // An in-progress task someone else owns is not "needs action" — it is already moving.
  assert.equal(needsAction(tasks[3]), false);
});

// --- AI output validation --------------------------------------------------

const MY_TASKS: TaskForPrompt[] = [
  { id: "t1", title: "Coordinate food supplies", description: "", state: "in_progress" },
  { id: "t2", title: "Arrange cleanup", description: "", state: "needs_assignment" },
];

test("a proposal naming an unknown taskId is rejected outright", () => {
  const r = validateProposals({ proposals: [{ taskId: "NOT-MINE", proposedState: "finished_work", evidence: "done" }] }, MY_TASKS, "all done");
  assert.deepEqual(r.proposals, []);
  assert.equal(r.needsManualPick, true);
});

test("'finished work' moves a task to review, never straight to Done", () => {
  const r = validateProposals({ proposals: [{ taskId: "t1", proposedState: "finished_work", doneItems: ["dropped off food"], evidence: "dropped off the food" }] }, MY_TASKS, "dropped off the food");
  assert.equal(r.proposals.length, 1);
  assert.equal(r.proposals[0].proposedState, "finished_work");
  assert.equal(stateForProposal("finished_work"), "in_review");
  // There is no proposal that can reach "done".
  for (const s of ["no_change", "started", "mostly_done", "finished_work", "cannot_finish"] as const) {
    assert.notEqual(stateForProposal(s), "done");
  }
});

test("work outside a task's scope never counts as that task's remaining work", () => {
  // The reported bug: a food task left looking half-done because clothing came up.
  const foodTask: TaskForPrompt[] = [{ id: "t-food", title: "Bring food to the people", description: "Deliver groceries to the household.", state: "in_progress" }];
  const r = validateProposals({
    proposals: [{
      taskId: "t-food",
      proposedState: "finished_work",
      doneItems: ["Delivered the food"],
      remainingItems: [],
      outOfScopeItems: ["They still need clothing delivered"],
      evidence: "delivered food but still needs to deliver clothing",
    }],
  }, foodTask, "delivered food but still needs to deliver clothing");

  const p = r.proposals[0];
  assert.deepEqual(p.remainingItems, [], "clothing must NOT hold the food task open");
  assert.deepEqual(p.outOfScopeItems, ["They still need clothing delivered"]);
  assert.equal(p.proposedState, "finished_work", "the food task's own work is finished");
  assert.equal(scopeComplete(p), true, "flagged so the UI can say the task itself is done");
});

test("a task with real remaining work of its own is not scope-complete", () => {
  const r = validateProposals({
    proposals: [{ taskId: "t1", proposedState: "mostly_done", doneItems: ["Dropped off half"], remainingItems: ["Second delivery still owed"], outOfScopeItems: ["They also need clothing"], evidence: "dropped off half" }],
  }, MY_TASKS, "dropped off half, second load still owed, they also need clothing");
  const p = r.proposals[0];
  assert.deepEqual(p.remainingItems, ["Second delivery still owed"]);
  assert.deepEqual(p.outOfScopeItems, ["They also need clothing"]);
  assert.equal(scopeComplete(p), false);
});

test("out-of-scope defaults to empty when the model omits it", () => {
  const r = validateProposals({ proposals: [{ taskId: "t1", proposedState: "started", evidence: "started" }] }, MY_TASKS, "started the food run");
  assert.deepEqual(r.proposals[0].outOfScopeItems, []);
});

test("ambiguous text yields no proposals and asks the volunteer to pick", () => {
  const r = validateProposals({ proposals: [{ taskId: "t1", proposedState: "no_change", evidence: "" }] }, MY_TASKS, "hi");
  assert.deepEqual(r.proposals, []);
  assert.equal(r.needsManualPick, true);
});

test("malformed model output is rejected rather than trusted", () => {
  assert.equal(validateProposals({ nonsense: true }, MY_TASKS, "x").needsManualPick, true);
  assert.equal(validateProposals(null, MY_TASKS, "x").proposals.length, 0);
});

test("a duplicate taskId in one response is collapsed to a single proposal", () => {
  const r = validateProposals({
    proposals: [
      { taskId: "t1", proposedState: "started", evidence: "started" },
      { taskId: "t1", proposedState: "finished_work", evidence: "started" },
    ],
  }, MY_TASKS, "started the food run");
  assert.equal(r.proposals.length, 1);
});

test("invented evidence falls back to the volunteer's own words", () => {
  const r = validateProposals({ proposals: [{ taskId: "t1", proposedState: "started", evidence: "a sentence that never appeared" }] }, MY_TASKS, "I began the food run today");
  assert.equal(r.proposals[0].evidence, "I began the food run today");
});

// --- suggestions and safety ------------------------------------------------

test("the no-LLM fallback makes exactly one suggestion per existing need", () => {
  const items = fallbackSuggestions(["food", "housing"]);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => i.category), ["food", "housing"]);
  // Never invents a need that was not on the request.
  assert.equal(fallbackSuggestions([]).length, 1);
  assert.equal(fallbackSuggestions([])[0].category, "other");
});

test("duplicate needs do not produce duplicate suggestions", () => {
  assert.equal(fallbackSuggestions(["food", "food", "food"]).length, 1);
});

test("a danger keyword in a volunteer update is detected so the ticket can be flagged", () => {
  assert.equal(detectSafety("he has a gun and is threatening her"), "crisis");
  assert.equal(detectSafety("she told me she is unsafe at home"), "concern");
  assert.equal(detectSafety("dropped off the food, all good"), undefined);
});
