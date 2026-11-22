// Intake with the local planner: the safety rule runs in BOTH directions, and drafting stays
// idempotent. Uses the in-memory store and no model key, so nothing leaves the process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("../testing/ts-resolve.mjs", import.meta.url);

delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
process.env.RELAY_PLANNER = "local";

const { intake, ensureTaskSuggestions } = await import("../actions.ts");
const { detectSafety } = await import("../safety.ts");
const { db } = await import("../db/index.ts");

test("a crisis only the PLANNER sees still flags the ticket", async () => {
  const text = "I need somewhere safe to stay tonight.";
  // Relay's keyword screen does not match this text; the planner's signals do.
  assert.equal(detectSafety(text), undefined, "the keyword screen now matches; pick another text");

  const { request } = await intake({ text, channel: "web" });
  assert.equal(request.safety?.level, "crisis", "the planner's crisis never reached the ticket");
  assert.ok(request.needs.includes("safety"));
  assert.equal(request.urgency, "critical");
  assert.equal(request.taskSuggestions?.plannerSafety, "crisis");
  assert.equal(request.taskSuggestions?.priority, "safety_review");
});

test("a medical emergency is flagged with the planner disabled, on the keyword screen alone", async () => {
  const text = "My husband is unconscious and not breathing.";
  // No planner, no model: `RELAY_PLANNER=claude` with no API key falls back to app templates.
  process.env.RELAY_PLANNER = "claude";
  try {
    assert.equal(detectSafety(text), "crisis", "the keyword screen does not treat this as a crisis");
    const { request } = await intake({ text, channel: "web" });
    assert.equal(request.safety?.level, "crisis");
    assert.equal(request.urgency, "critical");
    assert.ok(request.needs.includes("safety"));
    // 911 leads, and the domestic-violence reading never replaces the ambulance.
    assert.equal(request.safety?.resourcesShared[0], "911", JSON.stringify(request.safety?.resourcesShared));
    // Confirm the planner really was out of the loop.
    assert.equal(request.taskSuggestions?.engine, undefined, "the local planner ran after all");
  } finally {
    process.env.RELAY_PLANNER = "local";
  }
});

test("a crisis only RELAY sees still reaches the drafts, with a coordinator first", async () => {
  const text = "My 9 year old son did not come home from school today and I cannot find him.";
  const { request } = await intake({ text, channel: "web" });
  assert.equal(request.safety?.level, "crisis");
  assert.equal(request.safety?.kind, "missing_person");
  const s = request.taskSuggestions;
  assert.ok(s, "no drafts were prepared");
  assert.equal(s.priority, "safety_review");
  assert.equal(s.heldForCoordinator, true);
  // Flagging runs BEFORE drafting, so the planner sees the safety need the flag added.
  assert.equal(s.items[0].category, "safety", `leads with ${s.items[0].title}`);
});

test("the planner's broad 'concern' signal does not flag a ticket on its own", async () => {
  // Flagging is not inert: it raises urgency and adds crisis resources to the resident's SMS.
  const text = "My neighbour keeps shouting at me and I feel scared when I come home.";
  assert.equal(detectSafety(text), undefined, "Relay's own screen matches; this no longer isolates the planner");
  const { request } = await intake({ text, channel: "web" });
  assert.equal(request.safety, undefined, "a planner concern flagged the ticket");
  // It is still visible to a coordinator in the drafts.
  assert.equal(request.taskSuggestions?.priority, "safety_review");
});

test("drafting is idempotent per request", async () => {
  const { request } = await intake({ text: "We are almost out of food and have three kids.", channel: "web" });
  const first = request.taskSuggestions;
  assert.ok(first);
  await ensureTaskSuggestions(request.id);
  await ensureTaskSuggestions(request.id);
  const after = await db.getRequest(request.id);
  assert.equal(after?.taskSuggestions?.generatedAt, first.generatedAt, "drafts were regenerated");
  assert.deepEqual(after?.taskSuggestions?.items.map((i) => i.title), first.items.map((i) => i.title));
});

test("drafting never assigns anyone or moves the ticket", async () => {
  const { request } = await intake({ text: "I need a ride to my dialysis appointment on Friday.", channel: "web" });
  assert.equal(request.status, "new");
  assert.equal(request.tasks ?? undefined, undefined, "drafting created real tasks");
  assert.equal(request.taskSuggestions?.status, "draft");
  assert.equal(request.partnerId, undefined);
  assert.equal(request.dispatch, undefined);
});
