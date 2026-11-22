// A missing person must point to 911 (and the missing-child hotline for minors), not to the suicide lifeline,
// and everyday uses of the word "missing" must not raise a crisis.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSafety, isMedicalEmergency, isMissingPerson, mayBeMinor, resourcesFor, resourcesSms } from "./safety.ts";

test("a missing child is a crisis and points to 911, then the missing-child hotline", () => {
  const t = "My 9 year old son did not come home from school today and I cannot find him.";
  assert.equal(detectSafety(t), "crisis");
  assert.deepEqual(resourcesFor("crisis", t), ["911", "ncmec"]);
});

test("a missing adult points to 911 only", () => {
  const t = "My father is 71 and has dementia. He went for a walk this morning and never came home.";
  assert.equal(isMissingPerson(t), true);
  assert.equal(mayBeMinor(t), false);
  assert.deepEqual(resourcesFor("crisis", t), ["911"]);
});

test("the ways people actually say it are recognised", () => {
  for (const t of [
    "My daughter is 11 and she never came home from school. Nobody has seen her since this afternoon.",
    "my teenage son ran away last night",
    "My sister has been missing since Tuesday",
    "I want to report a missing person",
    "Mi hija no ha llegado a casa",
  ]) assert.equal(isMissingPerson(t), true, t);
});

test('everyday "missing" is not a missing person', () => {
  for (const t of [
    "My son keeps missing school and I am behind on rent",
    "I can't find my ID and I need it for the food pantry",
    "We are missing a payment on the light bill",
    "My husband is missing work because the car broke down",
  ]) {
    assert.equal(isMissingPerson(t), false, t);
    assert.equal(detectSafety(t), undefined, t);
  }
});

test("a missing person who talked about self-harm also gets 988", () => {
  const t = "My brother said he felt hopeless and now he is missing";
  assert.deepEqual(resourcesFor("crisis", t), ["911", "988"]);
});

test("existing crisis routing is unchanged", () => {
  assert.deepEqual(resourcesFor("crisis", "I don't want to be here anymore"), ["988", "county", "211"]);
  assert.deepEqual(resourcesFor("concern", "my boyfriend hits me and I'm scared to go home"), ["sojourner", "211"]);
});

test("the text sent back for a missing person leads with 911 and no waiting period", () => {
  const sms = resourcesSms(["911", "National Center for Missing & Exploited Children"], "missing_person");
  assert.match(sms, /^Call 911 now to report a missing person\. You do not have to wait 24 hours\./);
  assert.match(sms, /Missing-child hotline: 1-800-843-5678/);
  assert.doesNotMatch(sms, /988/);
});

test("the text for other crises is unchanged", () => {
  assert.equal(resourcesSms(["988 Suicide & Crisis Lifeline", "IMPACT 2-1-1"]), "If you're in danger right now, call 911. 988: call or text 988 · IMPACT 2-1-1: dial 211.");
});

// --- medical emergencies ---------------------------------------------------
// A medical emergency needs an ambulance. DV wording in the same sentence (a partner, a spouse)
// must never replace 911 with a domestic-violence referral.

test("'unconscious and not breathing' always leads with 911", () => {
  const t = "My husband is unconscious and not breathing.";
  assert.equal(isMedicalEmergency(t), true);
  const keys = resourcesFor("crisis", t);
  assert.equal(keys[0], "911", `got ${JSON.stringify(keys)}`);
  assert.ok(keys.includes("211"));
  // A crisis line is not an ambulance, and nothing here points to self-harm.
  assert.ok(!keys.includes("988"), JSON.stringify(keys));
});

test("a domestic-violence case that is also a medical emergency gets both 911 and Sojourner", () => {
  const t = "My boyfriend hit me and now I can't breathe and my chest pain is getting worse.";
  assert.equal(isMedicalEmergency(t), true);
  const keys = resourcesFor("crisis", t);
  assert.equal(keys[0], "911", `911 must lead, got ${JSON.stringify(keys)}`);
  assert.ok(keys.includes("sojourner"), "lost the domestic-violence referral");
  assert.ok(keys.includes("211"));
});

test("an overdose is a medical emergency AND a self-harm crisis", () => {
  const keys = resourcesFor("crisis", "I think my daughter took an overdose of her pills");
  assert.equal(keys[0], "911");
  assert.ok(keys.includes("988"), "an overdose still needs the crisis line");
});

test("ordinary wording is not read as a medical emergency", () => {
  for (const t of ["We passed out flyers for the block party", "I need a ride to a doctor's appointment", "My son has a cold"]) {
    assert.equal(isMedicalEmergency(t), false, t);
  }
});

test("a long-term condition or a housing complaint is not an ambulance call", () => {
  for (const t of [
    "My son has a seizure disorder and we ran out of his medication",
    "I can't breathe well in this apartment because of the mold, the landlord won't fix it",
    "She can't breathe right when the furnace is on",
    "The small toys are a choking hazard for the baby",
  ]) {
    assert.equal(isMedicalEmergency(t), false, t);
    assert.equal(detectSafety(t), undefined, t);
  }
});

test("the same words in an emergency still are", () => {
  for (const t of ["My son is having a seizure right now", "He can't breathe", "She cannot breathe and her lips are blue", "The baby is choking"]) {
    assert.equal(isMedicalEmergency(t), true, t);
    assert.equal(resourcesFor("crisis", t)[0], "911", t);
  }
});
