// The model may improve the planner's wording. It may not touch safety steps, invent needs,
// leak identifiers, claim outcomes or leave a need without a task.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRefinement, isLockedStep } from "./taskRefineRules.ts";
import type { Need, TaskSuggestionItem } from "./types.ts";

const SAFETY: TaskSuggestionItem = { id: "s1", title: "Coordinator checks safety before any volunteer is sent", description: "Clear the ticket first.", category: "safety" };
const FOOD: TaskSuggestionItem = { id: "f1", title: "Request an emergency food box or pantry visit", description: "Ask a pantry.", category: "food" };
const YOUTH: TaskSuggestionItem = { id: "y1", title: "Arrange youth support", description: "Connect the young person with a youth programme.", category: "youth" };
const CLOSE: TaskSuggestionItem = { id: "c1", title: "Follow up with the resident to confirm what help actually arrived and what is still needed", description: "Call or text.", category: "food" };
const DRAFT = [SAFETY, FOOD, YOUTH, CLOSE];
const NEEDS: Need[] = ["food", "youth"];

let n = 0;
const run = (tasks: unknown[], opts: { draft?: TaskSuggestionItem[]; needs?: Need[]; grounding?: string; max?: number } = {}) =>
  applyRefinement(opts.draft ?? DRAFT, { tasks }, opts.needs ?? NEEDS, opts.grounding ?? "", opts.max ?? 6, () => `new-${n++}`);
const titles = (r: ReturnType<typeof run>) => r!.items.map((i) => i.title);

test("a rewrite keeps the draft's id, category and place; locked steps stay first, follow-up last", () => {
  const r = run([
    { id: "c1", title: "Follow up Friday to confirm the food box reached all four", description: "Text the resident.", category: "food" },
    { id: "f1", title: "Request a food box for a family of four through Friday", description: "Ask about formula.", category: "housing" },
    { id: "y1", title: "Ask whether the children get school meals", description: "Offer the form.", category: "youth" },
  ]);
  assert.deepEqual(r!.items.map((i) => [i.id, i.category]), [["s1", "safety"], ["f1", "food"], ["y1", "youth"], ["c1", "food"]]);
  assert.equal(r!.items[0], SAFETY);
});

test("the model cannot rewrite, repeat or replace a safety or consent step", () => {
  const r = run([
    { id: "s1", title: "Send a volunteer round straight away", description: "Go now.", category: "safety" },
    { id: null, title: "Skip the safety check for this one", description: "Not needed.", category: "food" },
    { id: "f1", title: "Request a food box for four", description: "Ask a pantry.", category: "food" },
  ]);
  assert.equal(r!.items[0], SAFETY);
  assert.equal(r!.items.filter(isLockedStep).length, 1);
  assert.equal(r!.rejected.length, 2);
});

test("a new task is allowed only for a need already on the request", () => {
  const r = run([
    { id: "f1", title: "Request a food box for four", description: "Ask a pantry.", category: "food" },
    { id: null, title: "Refer to rent assistance", description: "They may be behind.", category: "rent" },
    { id: null, title: "Ask about infant formula and diapers", description: "Two under two.", category: "Food" },
  ]);
  // "Food" for "food" is the model's capitalisation, not a different need.
  assert.ok(titles(r).includes("Ask about infant formula and diapers"));
  assert.ok(!titles(r).includes("Refer to rent assistance"));
});

test("identifiers, unknown phone numbers and outcome claims are thrown away", () => {
  const r = run([
    { id: "f1", title: "Request a food box for four", description: "Ask a pantry.", category: "food" },
    { id: null, title: "Drop the box at 2714 N 35th St", description: "Front door.", category: "food" },
    { id: null, title: "Call the pantry for a slot", description: "Ring 414-555-0147 before noon.", category: "food" },
    { id: null, title: "Food box delivered to the family", description: "Done.", category: "food" },
    // Checking whether something happened is a step, not a claim.
    { id: null, title: "Ask whether last week's box was delivered", description: "Call the resident.", category: "food" },
  ]);
  assert.deepEqual(titles(r).filter((t) => /35th|pantry for a slot|Food box delivered/.test(t)), []);
  assert.ok(titles(r).includes("Ask whether last week's box was delivered"));
  assert.equal(r!.rejected.length, 3);
});

test("a phone number is kept when it comes from the playbook the model was shown; 911 is always fine", () => {
  const r = run([
    { id: "f1", title: "Call the housing helpline about a pledge", description: "Ring 414-555-0147 and ask for a pledge.", category: "food" },
    { id: null, title: "Confirm the caller has rung 911", description: "Before anything else.", category: "food" },
  ], { grounding: "Milwaukee Housing Helpline: (414) 555-0147" });
  assert.ok(titles(r).includes("Call the housing helpline about a pledge"));
  assert.ok(titles(r).includes("Confirm the caller has rung 911"));
});

test("a need never loses its only task, and the closing follow-up is restored if dropped", () => {
  const r = run([{ id: "f1", title: "Request a food box for four", description: "Ask a pantry.", category: "food" }]);
  assert.deepEqual(titles(r), [SAFETY.title, "Request a food box for four", YOUTH.title, CLOSE.title]);
});

test("over the cap, extra tasks go before any need's only task or the follow-up", () => {
  const r = run([
    { id: "f1", title: "Request a food box for four", description: "x y z", category: "food" },
    { id: null, title: "Ask about formula and diapers", description: "x y z", category: "food" },
    { id: null, title: "Offer a second pantry for next week", description: "x y z", category: "food" },
    { id: "y1", title: "Ask whether the children get school meals", description: "x y z", category: "youth" },
  ], { max: 5 });
  assert.equal(r!.items.length, 5);
  assert.deepEqual(r!.items.map((i) => i.category), ["safety", "food", "food", "youth", "food"]);
  assert.equal(r!.items.at(-1)!.id, "c1");
});

test("one draft split into two steps keeps both; one over-long task does not sink the rest", () => {
  const r = run([
    { id: "f1", title: "Request a food box for four", description: "Ask a pantry.", category: "food" },
    { id: "f1", title: "Ask about infant formula and diapers", description: "Two under two.", category: "food" },
    { id: "y1", title: "Ask whether the children get school meals", description: "x".repeat(900), category: "youth" },
  ]);
  assert.deepEqual(r!.items.map((i) => i.title), [SAFETY.title, "Request a food box for four", "Ask about infant formula and diapers", YOUTH.title, CLOSE.title]);
  assert.equal(r!.items[1].id, "f1");
  assert.notEqual(r!.items[2].id, "f1");
  assert.equal(r!.rejected.length, 1);
});

test("a closing step the model worded its own way is still the one follow-up, not a second one", () => {
  const r = run([
    { id: "f1", title: "Request a food box for four", description: "Ask a pantry.", category: "food" },
    { id: "y1", title: "Ask whether the children get school meals", description: "Offer the form.", category: "youth" },
    { id: null, title: "Confirm the food box arrived and remaining needs", description: "Follow up with the resident after the pantry visit.", category: "food" },
  ]);
  assert.deepEqual(titles(r), [SAFETY.title, "Request a food box for four", "Ask whether the children get school meals", "Confirm the food box arrived and remaining needs"]);
});

test("unusable model output leaves the planner's draft standing", () => {
  assert.equal(applyRefinement(DRAFT, { tasks: "nope" }, NEEDS, "", 6, () => "x"), null);
  assert.equal(applyRefinement(DRAFT, null, NEEDS, "", 6, () => "x"), null);
  assert.equal(run([{ id: null, title: "Refer to rent assistance", description: "x y z", category: "rent" }]), null);
});
