import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkLoginLock, fixedWindowLimit, recordLoginFailure } from "../src/lib/rate-limit.ts";

test("login blocks on the fifth invalid password for 15 minutes", async () => {
  const email = `security-${crypto.randomUUID()}@example.invalid`;
  const ip = "203.0.113.10";
  for (let attempt = 1; attempt < 5; attempt += 1) {
    assert.equal((await recordLoginFailure(ip, email)).success, true);
  }
  const fifth = await recordLoginFailure(ip, email);
  assert.equal(fifth.success, false);
  assert.ok(fifth.retryAfterSeconds >= 899 && fifth.retryAfterSeconds <= 900);
  assert.equal((await checkLoginLock("198.51.100.20", email)).success, false, "account lock must survive an IP change");
});

test("generic limits return Retry-After data after the configured quota", async () => {
  const id = crypto.randomUUID();
  assert.equal((await fixedWindowLimit("test", id, 2, "60 s")).success, true);
  assert.equal((await fixedWindowLimit("test", id, 2, "60 s")).success, true);
  const blocked = await fixedWindowLimit("test", id, 2, "60 s");
  assert.equal(blocked.success, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("Firebase rules retain deny-by-default and protected role/attachment checks", async () => {
  const [firestore, storage] = await Promise.all([
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../storage.rules", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(firestore, /allow\s+(read|write)\s*:\s*if\s+true/);
  assert.match(firestore, /request\.resource\.data\.role == 'visualizador'/);
  assert.match(firestore, /allow update: if isAdminOrGerente\(\)/);
  assert.match(firestore, /resource\.data\.status == 'rascunho'/);
  assert.match(firestore, /request\.resource\.data\.status == 'pendente'/);
  assert.match(firestore, /request\.resource\.data\.recordNumber\.matches/);
  assert.match(firestore, /affectedKeys\(\)\.hasOnly\(\['isCase', 'updatedAt'\]\)/);
  assert.match(firestore, /request\.resource\.data\.isCase is bool/);
  assert.match(firestore, /'concluido', 'concluido_direto'/);
  assert.doesNotMatch(
    firestore,
    /allow update: if isAdminOrGerente\(\)\s*&& request\.resource\.data\.authorId == resource\.data\.authorId/
  );
  assert.match(storage, /request\.auth\.uid == userId \|\| isPrivileged\(\)/);
});
