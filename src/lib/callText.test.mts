// The tracking code goes where the caller asked, and never to a line they did not agree to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { textDestination } from "./callText.ts";

test("'this one' texts the line the call is on, whether the phone or the carrier reported it", () => {
  assert.deepEqual(textDestination({ callback_ok: true, caller_line: "+1 (414) 555-0188" }), { to: "+14145550188", line: "+14145550188" });
  assert.equal(textDestination({ callback_ok: "true", caller_id: "414-555-0188" }).to, "+14145550188");
});

test("a number the caller dictated wins over the line they are calling from", () => {
  assert.deepEqual(textDestination({ callback_ok: true, callback_number: "414 555 0199", caller_line: "+14145550188" }), { to: "+14145550199", line: "+14145550188" });
});

test("no agreement and no number means no text, even when the line is known", () => {
  assert.deepEqual(textDestination({ caller_line: "+14145550188" }), { to: undefined, line: "+14145550188" });
  // Digits that are not a phone number are not guessed at.
  assert.equal(textDestination({ callback_number: "555 01" }).to, undefined);
});
