import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NeedClassifier, type NeedModel } from "./needs.ts";
import { RelayPlanner, checkPlan } from "./plan.ts";

const here = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(readFileSync(join(here, "model/need-model.json"), "utf8")) as NeedModel;
const fixture = JSON.parse(readFileSync(join(here, "model/parity-fixture.json"), "utf8")) as { text: string; probs: Record<string, number> }[];
const planner = new RelayPlanner(model, []);
const OVERPROMISE = /\b(secured|restored|guaranteed?|in place|completed|delivered|accepted|approved)\b/i;

test("TypeScript classifier matches scikit-learn probabilities", () => {
  const clf = new NeedClassifier(model);
  let maxDiff = 0;
  for (const f of fixture) {
    const p = clf.probabilities(f.text);
    for (const [need, expected] of Object.entries(f.probs)) {
      maxDiff = Math.max(maxDiff, Math.abs((p as Record<string, number>)[need] - expected));
    }
  }
  // Exported weights are pruned (|w| < 0.15 dropped) and rounded, so allow a small tolerance.
  assert.ok(maxDiff < 0.08, `max probability difference ${maxDiff}`);
});

test("multi-need request gets one or more tasks per need and a final follow-up", () => {
  const p = planner.plan("I'm almost out of food and I got a disconnect notice for my electric bill. I have two kids.");
  const needs = p.needs.map((n) => n.need);
  assert.ok(needs.includes("food"), JSON.stringify(needs));
  assert.ok(needs.includes("utilities"), JSON.stringify(needs));
  for (const n of p.needs) assert.ok(p.tasks.some((t) => t.category === n.need), `no task for ${n.need}`);
  assert.equal(p.tasks.at(-1)?.category, "follow_up");
  assert.equal(p.check.passed, true, p.check.issues.join("; "));
});

test("flooded basement starts with a coordinator safety check, never a volunteer", () => {
  const p = planner.plan("Our basement flooded last night and there is water everywhere. The power is still on down there.");
  assert.equal(p.tasks[0].helperType, "coordinator_only");
  assert.match(p.tasks[0].title, /safety check/i);
  assert.equal(p.priority, "safety_review"); // floodwater with power on is critical
  assert.equal(p.check.passed, true, p.check.issues.join("; "));
});

test("crisis signal: coordinator first, everything else held, safety_review", () => {
  const p = planner.plan("I need some food but honestly I don't see the point of going on anymore.");
  assert.equal(p.signals.crisis, true);
  assert.equal(p.tasks[0].helperType, "coordinator_only");
  assert.equal(p.priority, "safety_review");
  for (const t of p.tasks.slice(1)) assert.ok(t.helperType === "coordinator_only" || t.heldUntilCoordinatorClears, t.title);
  assert.equal(p.check.passed, true, p.check.issues.join("; "));
});

test("calling for someone else adds a consent step", () => {
  const p = planner.plan("My mom needs groceries and a ride to her doctor appointment next week.");
  assert.equal(p.signals.thirdPartyCaller, true);
  assert.ok(p.tasks.some((t) => /consent/i.test(t.title)));
  assert.equal(p.check.passed, true, p.check.issues.join("; "));
});

test("vague request asks a clarifying question instead of inventing needs", () => {
  const p = planner.plan("I just need some help, things have been really hard lately.");
  assert.equal(p.needs.length, 0, JSON.stringify(p.needs));
  assert.equal(p.tasks.length, 1);
  assert.match(p.tasks[0].title, /call back/i);
});

test("no task title ever claims an outcome", () => {
  const samples = [
    "Evicted next week, court date Monday, I need a lawyer and somewhere to stay.",
    "Our furnace stopped working and it is freezing, I have a newborn.",
    "My neighbor hasn't come out in days and her house has no heat.",
    "Necesito ayuda, I only speak Spanish, we need food and diapers.",
  ];
  for (const s of samples) {
    const p = planner.plan(s);
    for (const t of p.tasks) assert.ok(!OVERPROMISE.test(t.title), t.title);
    assert.equal(p.check.passed, true, `${s} -> ${p.check.issues.join("; ")}`);
  }
});

test("an ordinary flood without danger gets a safety check but not the red flag", () => {
  const p = planner.plan("Our basement got flooded last month and our clothes and furniture are ruined.");
  assert.equal(p.tasks[0].helperType, "coordinator_only");
  assert.notEqual(p.priority, "safety_review");
});

test("medical equipment without power is treated as critical", () => {
  const p = planner.plan("My mom is home alone, the power just went out, and she uses a breathing machine.");
  assert.equal(p.priority, "safety_review");
  assert.equal(p.tasks[0].helperType, "coordinator_only");
  assert.ok(p.tasks.some((t) => /consent/i.test(t.title)));
});

test("with knownNeeds, tasks only cover those needs and extras are listed separately", () => {
  const p = planner.plan("I'm out of food and my landlord says I have to leave by Friday.", { knownNeeds: ["food"] });
  assert.ok(p.tasks.every((t) => ["food", "intake", "follow_up", "safety", "language_access"].includes(t.category)), JSON.stringify(p.tasks.map((t) => t.category)));
  assert.ok(p.possibleExtraNeeds.some((n) => n.need === "housing"));
});

test("an empty knownNeeds list means 'no list given', not 'no needs'", () => {
  const text = "I'm out of food and my landlord says I have to leave by Friday.";
  const open = planner.plan(text);
  const empty = planner.plan(text, { knownNeeds: [] });
  // Must behave like no list at all, not collapse to a single call-back task.
  assert.deepEqual(empty.needs.map((n) => n.need), open.needs.map((n) => n.need));
  assert.ok(empty.needs.length > 0, "empty knownNeeds wiped out the detected needs");
  assert.ok(!empty.tasks.some((t) => /ask what kind of help/i.test(t.title)), "fell back to the call-back task");
  assert.equal(empty.check.passed, true, empty.check.issues.join("; "));
});

test("no heat plus a vulnerable person is critical; no heat alone is time sensitive", () => {
  assert.equal(planner.plan("My mom is 80 and lives alone and her furnace stopped working. It's freezing.").priority, "safety_review");
  assert.equal(planner.plan("Our furnace stopped working this week.").priority !== "safety_review", true);
});

test("checker catches a bad plan", () => {
  const p = planner.plan("We need food.");
  p.tasks[0].title = "Food box delivered";
  assert.equal(checkPlan(p).passed, false);
});

test("empty input does not crash", () => {
  const p = planner.plan("");
  assert.equal(p.needs.length, 0);
});
