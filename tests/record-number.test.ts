import assert from "node:assert/strict";
import test from "node:test";
import { canUseEditedRecordNumber, compareRecordNumbers } from "../src/lib/record-number.ts";

test("orders flow numbers numerically instead of alphabetically", () => {
  const values = ["100", "10", "206", "1", "99", "204", "11", "9", "205", "3", "2"];
  assert.deepEqual(values.sort(compareRecordNumbers), ["1", "2", "3", "9", "10", "11", "99", "100", "204", "205", "206"]);
});

test("orders year-qualified numbers by year and numeric sequence", () => {
  const values = ["010/2027", "1000/2026", "999/2026", "002/2027"];
  assert.deepEqual(values.sort(compareRecordNumbers), ["999/2026", "1000/2026", "002/2027", "010/2027"]);
});

test("editing blocks an occupied number without explicit duplicate permission", () => {
  assert.equal(canUseEditedRecordNumber({
    current: "003/2026",
    next: "002/2026",
    duplicateExists: true,
    allowDuplicate: false,
  }), false);
});

test("editing permits an occupied number only when explicitly authorized", () => {
  assert.equal(canUseEditedRecordNumber({
    current: "003/2026",
    next: "002/2026",
    duplicateExists: true,
    allowDuplicate: true,
  }), true);
});

test("editing keeps the record's own unchanged number without a false conflict", () => {
  assert.equal(canUseEditedRecordNumber({
    current: "003/2026",
    next: "003/2026",
    duplicateExists: false,
    allowDuplicate: false,
  }), true);
});
