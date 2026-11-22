// The local planner wired into Relay's task suggestions.
//
// Covers the integration, not the planner's own logic (that is planner.test.mts): the need
// vocabulary maps both ways, the Missions rule holds, Relay's safety screen wins when the
// planner misses danger, the 5-task cap never drops safety, and `local` touches no network.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Need } from "../types";

register("../testing/ts-resolve.mjs", import.meta.url);

// In-memory store, and no key that could enable a hosted-model call.
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const fetched: string[] = [];
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (input: string | URL | Request) => {
    fetched.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    throw new Error("the local planner must not make network calls");
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

const { planSuggestions, capTasks, taskCap, plannerNeedsFor, unmappedNeeds, coordinatorSafetyTask } = await import("./adapter.ts");
const { buildSuggestions } = await import("../ai/taskSuggest.ts");
const { NEEDS } = await import("../types.ts");
const { SUGGESTION_MAX } = await import("../taskRules.ts");
// NOTE: lib/tasks.ts cannot be imported here — it uses a TypeScript parameter property, which
// Node's strip-only mode rejects. `approveSuggestions` is what turns these drafts into tasks; it
// is shared with the Claude path and unchanged by this work, so the assertions below cover the
// adapter's side of that contract: a draft must carry nothing that could pre-assign a task.

const isNeed = (c: string) => (NEEDS as readonly string[]).includes(c);

// --- vocabulary ------------------------------------------------------------

test("app needs map to at most one planner need, and the planner's gaps keep app templates", () => {
  assert.deepEqual(plannerNeedsFor(["food"]), ["food"]);
  // rent -> housing, whose template is "Refer to rent assistance, mediation, or shelter options".
  assert.deepEqual(plannerNeedsFor(["rent"]), ["housing"]);
  // rent + housing collapse onto one planner need, so one task set, not two.
  assert.deepEqual(plannerNeedsFor(["rent", "housing"]), ["housing"]);
  assert.deepEqual(unmappedNeeds(["mediation", "youth", "other", "food"]), ["mediation", "youth", "other"]);
});

test("every produced task carries a valid app Need category", async () => {
  for (const needs of [["food"], ["rent"], ["utilities", "health"], ["mediation"], ["youth", "food"], []] as Need[][]) {
    const s = await planSuggestions("My power is out and I have two kids at home.", needs);
    assert.ok(s.items.length > 0, `no drafts for ${JSON.stringify(needs)}`);
    for (const i of s.items) assert.ok(isNeed(i.category), `invalid category ${i.category} for ${JSON.stringify(needs)}`);
    // SUGGESTION_MAX ordinary drafts, plus one slot a safety step may occupy.
    assert.ok(s.items.length <= SUGGESTION_MAX + 1, `${s.items.length} drafts exceeds the cap`);
  }
});

test("a rent request gets its tasks back under rent, not housing", async () => {
  const s = await planSuggestions("My landlord gave me a 5-day notice and I have to be out by Friday.", ["rent"]);
  assert.ok(s.items.some((i) => i.category === "rent"), JSON.stringify(s.items.map((i) => i.category)));
  assert.ok(!s.items.some((i) => i.category === "housing"), "leaked the planner's own vocabulary onto the ticket");
});

test("a draft carries nothing that could assign a task or move a ticket", async () => {
  const s = await planSuggestions("My basement flooded and I have no heat. I'm almost out of food.", ["housing", "utilities", "food"]);
  assert.ok(s.items.length > 0);
  for (const i of s.items) {
    // approveSuggestions sets state "needs_assignment" and no assignee; a draft must not be able
    // to override either, nor smuggle a status change onto the ticket.
    assert.deepEqual(Object.keys(i).sort(), ["category", "description", "id", "title"], `unexpected fields on ${i.title}`);
    assert.ok(isNeed(i.category));
    assert.ok(i.title.trim().length > 0 && i.description.trim().length > 0);
  }
  assert.equal(s.status, "draft");
});

// --- the Missions rule -----------------------------------------------------

test("a food request that also mentions eviction drafts only food, and reports housing as a possible extra", async () => {
  const s = await planSuggestions("I'm out of food and my landlord says I have to leave by Friday.", ["food"]);
  const categories = [...new Set(s.items.map((i) => i.category))];
  assert.deepEqual(categories, ["food"], JSON.stringify(categories));
  assert.ok(
    s.possibleExtraNeeds?.some((n) => /housing/.test(n.label)),
    `housing missing from possible extras: ${JSON.stringify(s.possibleExtraNeeds)}`,
  );
  // A possible extra need is a hint for a coordinator, never a task.
  assert.ok(!s.items.some((i) => i.category === "housing"));
});

// --- safety ----------------------------------------------------------------

test("crisis text is flagged and starts with a coordinator-only task", async () => {
  const s = await planSuggestions("I don't want to live anymore and there is no food in the house.", ["food"]);
  assert.equal(s.priority, "safety_review");
  assert.equal(s.appSafety, "crisis");
  assert.match(s.items[0].title, /coordinator/i);
  assert.equal(s.heldForCoordinator, true);
});

test("a missing child: Relay's safety screen fires where the planner's does not, and a coordinator still goes first", async () => {
  const text = "My 9 year old son did not come home from school today and I cannot find him.";
  const s = await planSuggestions(text, ["safety", "youth"]);
  // The planner alone reads this as time_sensitive with no needs; Relay's screen calls it a crisis.
  assert.equal(s.appSafety, "crisis");
  assert.equal(s.priority, "safety_review");
  assert.match(s.items[0].title, /coordinator checks safety/i);
  assert.equal(s.items[0].category, "safety");
  assert.equal(s.heldForCoordinator, true);
  for (const i of s.items) assert.ok(isNeed(i.category));
});

test("a crisis Relay saw is not answered by a hazard the planner saw", async () => {
  // The planner reads this as a broken furnace (time_sensitive); Relay reads a missing child.
  // Comparing "planner noticed something" against "Relay saw a crisis" would downgrade it.
  const text = "My 9 year old son did not come home from school today and I cannot find him. Our furnace stopped working.";
  const s = await planSuggestions(text, ["youth"]);
  assert.equal(s.appSafety, "crisis");
  assert.equal(s.priority, "safety_review", "a crisis was filed as merely time-sensitive");
  assert.equal(s.heldForCoordinator, true);
  assert.equal(s.items[0].title.toLowerCase().includes("coordinator"), true);
});

test("intake's own safety level reaches the planner even when the keyword screen misses it", async () => {
  // structureIntake's model can raise a level the regexes do not match. That level is passed in.
  const text = "He said he would make me regret it if I told anyone.";
  const plain = await planSuggestions(text, ["mediation"]);
  const told = await planSuggestions(text, ["mediation"], "crisis");
  assert.equal(told.priority, "safety_review");
  assert.equal(told.heldForCoordinator, true);
  assert.match(told.items[0].title, /coordinator/i);
  assert.notEqual(told.items[0].title, plain.items[0].title, "the passed-in level changed nothing");
});

test("a crisis only the planner sees is reported back so the ticket can be flagged", async () => {
  const s = await planSuggestions("I need somewhere safe to stay tonight.", ["housing"]);
  // Relay's keyword screen does not match this; the planner's signals do.
  assert.equal(s.appSafety, undefined, "the keyword screen now matches; pick another text");
  assert.equal(s.plannerSafety, "crisis", "intake has no way to learn the planner saw a crisis");
  assert.equal(s.priority, "safety_review");
  assert.equal(s.items[0].category, "safety", "a safety task was filed under another need");
});

test("a coordinator-led ordinary template is not mistaken for the safety step", async () => {
  // housing and medical templates START with a coordinator_only task that is about deadlines or
  // clinics, not safety. A flagged ticket must still get a real safety task in front of them.
  const missingChild = "My 9 year old son did not come home from school today and I cannot find him.";
  for (const needs of [["rent"], ["health"], ["housing"]] as Need[][]) {
    const s = await planSuggestions(missingChild, needs);
    assert.equal(s.priority, "safety_review", JSON.stringify(needs));
    assert.equal(s.injectedSafetyTask, true, `${JSON.stringify(needs)} got no safety task`);
    assert.equal(s.items[0].category, "safety", `${JSON.stringify(needs)} leads with ${s.items[0].title}`);
    assert.match(s.items[0].title, /coordinator checks safety/i);
  }
});

test("needs the planner detected but the request does not have are reported, not silently dropped", async () => {
  // "mediation" has no planner equivalent, so the planner runs unrestricted and its findings
  // would otherwise be filtered away without a trace.
  const s = await planSuggestions("I need help talking to my neighbour, and I am out of food.", ["mediation"]);
  assert.ok(s.items.some((i) => i.category === "mediation"), "lost the app-template need");
  assert.ok(!s.items.some((i) => i.category === "food"), "drafted a need the request does not have");
  assert.ok(s.possibleExtraNeeds?.some((n) => /food/.test(n.label)), `food not reported: ${JSON.stringify(s.possibleExtraNeeds)}`);
});

test("the planner's reasoning is kept for the record", async () => {
  const s = await planSuggestions("I'm calling for my mom. Her basement flooded and she is 80 and lives alone.", ["housing"]);
  assert.ok(s.signalNotes?.length, "signal notes were dropped");
  assert.ok(s.signalNotes.some((n) => /calling for someone else/i.test(n)), JSON.stringify(s.signalNotes));
});

test("the injected safety task names the level it was given", () => {
  assert.match(coordinatorSafetyTask("crisis").description, /crisis protocol/i);
  assert.match(coordinatorSafetyTask("concern").description, /confirm everyone is safe/i);
  assert.equal(coordinatorSafetyTask("crisis").helperType, "coordinator_only");
});

// --- the cap ---------------------------------------------------------------

test("a 3-need flood with a third-party caller caps to 6, keeps the follow-up, and still passes the planner's own check", async () => {
  const { getPlanner, checkPlan } = await import("./index.ts");
  const { join } = await import("node:path");
  const planner = getPlanner(join(process.cwd(), "lib/planner/model"));
  const text =
    "I'm calling for my mom. Her basement flooded last night, she has no heat, her power is out, " +
    "and she is almost out of food. She is 80 and lives alone.";
  const plan = planner.plan(text, { knownNeeds: ["food", "housing", "utilities"] });
  assert.ok(plan.tasks.length > SUGGESTION_MAX, `nothing to cap: ${plan.tasks.length} tasks`);

  // A safety step does not spend one of the five ordinary slots, so this ticket may keep 6.
  const cap = taskCap(plan.tasks);
  assert.equal(cap, SUGGESTION_MAX + 1, "the safety step is not being given its own slot");
  const kept = capTasks(plan.tasks, cap);
  assert.equal(kept.length, cap);
  // (a) the coordinator safety task survives and still leads.
  assert.equal(kept[0].helperType, "coordinator_only");
  // (b) the consent step survives, because the caller is asking for someone else.
  assert.ok(kept.some((t) => /consent/i.test(t.title)), "dropped the consent step");
  // (c) every known need keeps at least one task.
  for (const n of ["food", "housing", "utilities"]) {
    assert.ok(kept.some((t) => t.category === n), `need ${n} lost all of its tasks`);
  }
  // (d) the closing follow-up survives, which is the point of giving safety its own slot:
  // safety + consent + one task per need would otherwise fill all five on its own.
  assert.ok(kept.some((t) => t.category === "follow_up"), "the closing follow-up was squeezed out");
  // A need's SECOND task is still what gives way: the plan had 8 tasks and keeps 6.
  assert.equal(plan.tasks.length, 8);
  assert.equal(kept.filter((t) => t.category === "food").length, 1, "both food tasks survived; nothing was traded");

  const check = checkPlan({ ...plan, tasks: kept });
  assert.equal(check.passed, true, check.issues.join("; "));
});

test("capping leaves a short plan untouched", async () => {
  const s = await planSuggestions("We need groceries this week.", ["food"]);
  assert.ok(s.items.length <= SUGGESTION_MAX);
  assert.equal(s.check?.passed, true, s.check?.issues.join("; "));
});

// --- the setting -----------------------------------------------------------

test("RELAY_PLANNER=local drafts tasks without a single network call", async () => {
  const before = fetched.length;
  process.env.RELAY_PLANNER = "local";
  const s = await buildSuggestions("My basement flooded and I have no heat.", ["housing", "utilities"]);
  assert.equal(fetched.length, before, `local path called out to ${fetched.slice(before).join(", ")}`);
  assert.equal(s.engine, "relay-local-planner/1");
  assert.ok(s.items.length > 0);
});

test("RELAY_PLANNER=claude keeps the original hosted path, key and all", async () => {
  process.env.RELAY_PLANNER = "claude";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  const before = fetched.length;
  try {
    const s = await buildSuggestions("My basement flooded and I have no heat.", ["housing", "utilities"]);
    // With a key configured the hosted path must actually try to call out — that is the proof it
    // is the old path and not the local planner wearing its name.
    assert.ok(fetched.length > before, "the claude setting never attempted a hosted call");
    assert.equal(s.engine, undefined, "the claude setting went through the local planner");
    // The stubbed fetch throws, so it falls back to the app's deterministic templates.
    assert.equal(s.aiGenerated, false);
    assert.deepEqual(s.items.map((i) => i.category), ["housing", "utilities"]);
  } finally {
    process.env.RELAY_PLANNER = "local";
    delete process.env.ANTHROPIC_API_KEY;
  }
});
