import assert from "node:assert/strict";
import test from "node:test";
import { authErrorMessage, checkAuthResponse, classifyProviderError, normalizeEmail, providerErrorCode } from "../src/lib/auth-errors.ts";
import { canSubmitRecord, isApprovedProfile } from "../src/lib/access-policy.ts";

test("email normalization removes edge whitespace and invisible format characters", () => {
  assert.equal(normalizeEmail(" \u200BUSER@Example.COM\uFEFF "), "user@example.com");
});
test("invalid, absent and disabled accounts have identical public errors", () => {
  for (const code of ["INVALID_PASSWORD", "EMAIL_NOT_FOUND", "USER_DISABLED", "INVALID_LOGIN_CREDENTIALS"]) {
    assert.deepEqual(classifyProviderError(code, 400), { code: "auth/invalid-credential", status: 401, credentialFailure: true });
  }
  assert.equal(authErrorMessage("auth/user-disabled"), authErrorMessage("auth/user-not-found"));
});
test("configuration and provider outages do not count as bad passwords", () => {
  for (const code of ["OPERATION_NOT_ALLOWED", "API_KEY_INVALID", "PROJECT_NOT_FOUND"]) {
    assert.equal(classifyProviderError(code, 400).credentialFailure, false);
    assert.equal(classifyProviderError(code, 400).code, "auth/configuration-error");
  }
  assert.equal(classifyProviderError("UNKNOWN", 500).code, "auth/service-unavailable");
  assert.equal(classifyProviderError("TOO_MANY_ATTEMPTS_TRY_LATER", 400).status, 429);
});
test("diagnostics never include provider message suffix or submitted email", () => {
  assert.equal(providerErrorCode({ error: { message: "INVALID_PASSWORD : private@example.com" } }), "INVALID_PASSWORD");
  assert.equal(providerErrorCode({ error: { message: "private@example.com" } }), "UNKNOWN");
});
test("HTTP failures retain service/credential distinction, including non-JSON errors", async () => {
  await checkAuthResponse(new Response("{}", { status: 200 }));
  for (const [status, code] of [[401, "auth/invalid-credential"], [429, "auth/too-many-requests"], [503, "auth/service-unavailable"], [403, "auth/service-unavailable"]] as const) {
    await assert.rejects(checkAuthResponse(new Response("upstream unavailable", { status })), { code });
  }
});
test("approval policy rejects missing/invalid profiles and preserves legacy access", () => {
  assert.equal(isApprovedProfile(null), false);
  for (const role of ["admin", "gerente", "tecnico"] as const) {
    assert.equal(canSubmitRecord({ role }), true);
    assert.equal(canSubmitRecord({ role, status: "ativo" }), true);
    for (const status of ["pendente", "inativo", "rejeitado"] as const) assert.equal(canSubmitRecord({ role, status }), false);
  }
  assert.equal(canSubmitRecord({ role: "visualizador", status: "ativo" }), false);
});
