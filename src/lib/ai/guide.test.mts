// "Ask the Guide" must cite only the playbook a question is about, and show plain text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { plainText, rankPlaybooks } from "./guide.ts";

const BOOKS = [
  { id: "eviction", title: "5-day eviction notice", tags: ["rent", "legal"], body: "1. A 5-day notice is not an eviction. The tenant has 5 days to pay.\n2. Get the notice date." },
  { id: "mediation", title: "De-escalating a neighbor dispute", tags: ["mediation", "safety"], body: "1. Go in pairs.\n2. Call ahead; ask what would make this okay.\n3. Never inside either home the first time." },
  { id: "fire", title: "Fire displacement, first 24 hours", tags: ["housing", "food"], body: "1. Confirm the family is safe.\n2. Find a place to sleep tonight." },
];
const ids = (q: string) => rankPlaybooks(q, BOOKS).map((p) => p.id);

test("a question is matched to its playbook, not to one that shares only filler words", () => {
  // "what" and "first" also appear in the mediation playbook; they must not earn it a citation.
  assert.deepEqual(ids("A tenant got a 5-day notice, what's the first step?"), ["eviction"]);
  assert.deepEqual(ids("Family displaced by fire tonight, who do I call first?"), ["fire"]);
});

test("a second playbook is cited only when it is genuinely relevant too", () => {
  assert.deepEqual(ids("The neighbor dispute is about an eviction notice from the same landlord").sort(), ["eviction", "mediation"]);
});

test("a question no playbook covers cites nothing", () => {
  assert.deepEqual(ids("How do I get a ride to the clinic?"), []);
});

test("Markdown is removed and the wording kept", () => {
  assert.equal(
    plainText("# First steps\n\n1. **Get the details**: write down the date.\n2. __Refer__ the same day.\n\n\n- Bring the notice"),
    "First steps\n\n1. Get the details: write down the date.\n2. Refer the same day.\n\n• Bring the notice",
  );
});

test("plain answers pass through unchanged", () => {
  const a = "1. Go in pairs.\n2. Call ahead, 414-555-0100.";
  assert.equal(plainText(a), a);
});
