// Opt-in only: runs with scripts/auth-live.config.mjs against the expected project.
import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const project = "cim-normatel-ac5b7";
const localRequire = createRequire(path.resolve("package.json"));
let token: string;
async function api(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Admin API HTTP ${response.status}`);
  return response.json();
}
const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${project}`;
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
test.beforeAll(async () => {
  const session = JSON.parse(await fs.readFile(path.join(os.homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
  token = (await localRequire("firebase-tools/lib/auth").getAccessToken(session.tokens?.refresh_token, [])).access_token;
});

test("production signup, pending session, duplicate, recovery, approved login and logout", async ({ page, baseURL }) => {
  if (new URL(baseURL!).hostname !== "fluxocriticos.vercel.app") throw new Error("Unexpected live target");
  const email = `codex-disposable-${crypto.randomUUID()}@example.invalid`;
  const password = `${crypto.randomUUID()}!Aa1`;
  let uid: string | undefined;
  let signups = 0;
  let logins = 0;
  const unexpected: string[] = [];
  page.on("pageerror", error => unexpected.push(error.name));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.hostname === "identitytoolkit.googleapis.com" && url.pathname.endsWith(":signUp")) signups++;
    if (url.hostname === "identitytoolkit.googleapis.com" && url.pathname.endsWith(":signInWithPassword")) logins++;
  });
  async function lookup() {
    const result = await api(`${authBase}/accounts:lookup`, { method: "POST", body: JSON.stringify({ email: [email] }) });
    const user = result.users?.[0];
    if (user && user.email !== email) throw new Error("Test identity mismatch");
    return user;
  }
  async function login(pass = password) {
    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(pass);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
  }
  try {
    await page.goto("/signup");
    await page.getByLabel("Nome completo", { exact: true }).fill("Codex disposable production test");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByLabel("Confirmar senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Aguardando aprovação" })).toBeVisible({ timeout: 35000 });
    const account = await lookup(); uid = account?.localId;
    expect(uid).toBeTruthy(); expect(signups).toBe(1);
    await fs.mkdir("recovery/auth-probes", { recursive: true });
    await fs.writeFile(`recovery/auth-probes/${uid}.json`, JSON.stringify({ uid, email, project, disposable: true }));
    const profile = await api(`${base}/users/${uid}`);
    expect(profile.fields.uid.stringValue).toBe(uid);
    expect(profile.fields.role.stringValue).toBe("visualizador");
    expect(profile.fields.status.stringValue).toBe("pendente");
    expect(profile.fields.approved.booleanValue).toBe(false);
    expect(profile.fields.createdAt.timestampValue).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Aguardando aprovação" })).toBeVisible();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await login("Incorrect-disposable-password!");
    await expect(page.getByText(/Credenciais inválidas/)).toBeVisible({ timeout: 20000 });
    await login();
    await expect(page.getByRole("heading", { name: "Aguardando aprovação" })).toBeVisible({ timeout: 20000 });
    expect(logins).toBe(2); // One Firebase authentication per user attempt.
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    if (process.env.AUTH_TEST_SKIP_DUPLICATE !== "1") {
    await page.goto("/signup");
    await page.getByLabel("Nome completo", { exact: true }).fill("Codex disposable duplicate");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByLabel("Confirmar senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await expect(page.getByText(/Se você já possui uma conta/)).toBeVisible({ timeout: 20000 });
    }
    await page.goto("/forgot-password");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: /Enviar/ }).click();
    await expect(page.getByRole("heading", { name: "Verifique seu e-mail" })).toBeVisible({ timeout: 20000 });
    // Verify orphan repair against published rules, deleting only this test's profile.
    await api(`${base}/users/${uid}`, { method: "DELETE" });
    await login();
    await expect(page.getByRole("heading", { name: "Aguardando aprovação" })).toBeVisible({ timeout: 20000 });
    const repaired = await api(`${base}/users/${uid}`);
    expect(repaired.fields.approved.booleanValue).toBe(false);
    // Approve only our disposable UID, using authenticated admin API.
    await api(`${base}/users/${uid}?updateMask.fieldPaths=status&updateMask.fieldPaths=approved`, { method: "PATCH", body: JSON.stringify({ fields: { status: { stringValue: "ativo" }, approved: { booleanValue: true } } }) });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /Dashboard/ })).toBeVisible({ timeout: 20000 });
    await page.reload();
    await expect(page.getByRole("heading", { name: /Dashboard/ })).toBeVisible({ timeout: 20000 });
    expect(unexpected).toEqual([]);
    console.log(JSON.stringify({ result: "passed", uid, signups, logins, browser: process.env.AUTH_TEST_BROWSER || "chrome", duplicateTested: process.env.AUTH_TEST_SKIP_DUPLICATE !== "1", target: baseURL }));
  } finally {
    // Even assertion failures may follow successful account creation. Resolve exact email first.
    const account = await lookup();
    if (account) {
      if (uid && uid !== account.localId) throw new Error("Cleanup UID mismatch");
      uid = account.localId;
      await api(`${base}/users/${uid}`, { method: "DELETE" });
      await api(`${authBase}/accounts:delete`, { method: "POST", body: JSON.stringify({ localId: uid }) });
      const logs = await api(`${base}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "logs" }], where: { fieldFilter: { field: { fieldPath: "actorId" }, op: "EQUAL", value: { stringValue: uid } } } } }) });
      for (const row of logs) if (row.document?.fields?.actorId?.stringValue === uid) await api(`https://firestore.googleapis.com/v1/${row.document.name}`, { method: "DELETE" });
      console.log(JSON.stringify({ cleanup: "confirmed-disposable-uid", uid }));
    }
  }
});
