import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeAuthorNames, normalizePersonName, samePerson, uniquePersonNames } from "../src/lib/person-name.ts";

test("ignores case, accents and extra whitespace when comparing names", () => {
  assert.equal(normalizePersonName("  João   Silva "), "joao silva");
  assert.ok(samePerson("João Silva", "joao  silva "));
  assert.ok(!samePerson("João Silva", "João Souza"));
  assert.ok(!samePerson("", ""));
});

test("groups name variants under the most frequent label", () => {
  const names = ["João Silva", "joao silva", "João Silva", "João Silva ", "Maria Souza"];
  assert.deepEqual(uniquePersonNames(names), ["João Silva", "Maria Souza"]);
});

test("breaks ties in favour of the accented, capitalised variant", () => {
  assert.deepEqual(uniquePersonNames(["joao silva", "João Silva"]), ["João Silva"]);
});

test("canonicalizes record author names without touching other records", () => {
  const records = [
    { id: "1", authorName: "joao silva" },
    { id: "2", authorName: "João Silva" },
    { id: "3", authorName: "João Silva" },
    { id: "4", authorName: "Maria Souza" },
    { id: "5", authorName: undefined },
  ];
  const result = canonicalizeAuthorNames(records);
  assert.deepEqual(result.map((r) => r.authorName), ["João Silva", "João Silva", "João Silva", "Maria Souza", undefined]);
  assert.equal(result[3], records[3]);
  assert.equal(records[0].authorName, "joao silva");
});
