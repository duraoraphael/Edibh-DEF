import { test, expect } from "@playwright/test";

const success = "Se existir uma conta com este e-mail, você receberá as instruções para redefinir sua senha.";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/abuse-check", route => route.fulfill({ json: { ok: true } }));
});

test("existing login link, normalization, duplicate submissions and neutral success", async ({ page }) => {
  let sends = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/accounts:sendOobCode?*", async route => {
    sends++;
    expect(route.request().postDataJSON()).toMatchObject({ email: "registered@example.com", requestType: "PASSWORD_RESET" });
    await pending;
    await route.fulfill({ json: {} });
  });
  await page.goto("/login");
  await page.locator('a[href="/forgot-password"]').click();
  await page.waitForURL("**/forgot-password");
  await page.getByLabel("E-mail", { exact: true }).fill("  REGISTERED@EXAMPLE.COM  ");
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue("registered@example.com");
  await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await expect(page.getByRole("button", { name: "Enviando..." })).toBeDisabled();
  await page.locator("form").evaluate(form => {
    for (let i = 0; i < 5; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => sends).toBe(1);
  release();
  await expect(page.getByText(success, { exact: true })).toBeVisible();
  await expect(page.getByText(/Ele não altera sua senha do Google/)).toBeVisible();
  expect(sends).toBe(1);
});

for (const email of ["", "invalid", "a b@example.com"]) {
  test(`blocks invalid email: ${JSON.stringify(email)}`, async ({ page }) => {
    let requests = 0;
    await page.route("**/api/auth/abuse-check", route => { requests++; return route.fulfill({ json: {} }); });
    await page.goto("/forgot-password");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
    expect(await page.locator("form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
    expect(requests).toBe(0);
  });
}

for (const [code, message] of [
  ["INVALID_EMAIL", "Informe um e-mail válido."],
  ["TOO_MANY_ATTEMPTS_TRY_LATER", "Muitas solicitações. Aguarde alguns minutos e tente novamente."],
  ["OPERATION_NOT_ALLOWED", "A redefinição de senha está indisponível. Contate o administrador."],
  ["UNEXPECTED_INTERNAL_ERROR", "Não foi possível enviar as instruções. Tente novamente mais tarde."],
] as const) {
  test(`handles ${code} without exposing provider details`, async ({ page }) => {
    if (code === "UNEXPECTED_INTERNAL_ERROR") {
      // Firebase retries this provider response indefinitely in WebKit. Model
      // the same public server-failure path at the app gate instead.
      await page.route("**/api/auth/abuse-check", route => route.fulfill({ status: 503, json: { code: "auth/service-unavailable" } }));
    } else {
      await page.route("**/accounts:sendOobCode?*", route => route.fulfill({ status: 400, json: { error: { message: code } } }));
    }
    await page.goto("/forgot-password");
    await page.getByLabel("E-mail", { exact: true }).fill("test@example.com");
    await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar link de redefinição" })).toBeEnabled();
  });
}

test("network failure restores button and allows retry", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("E-mail", { exact: true }).fill("test@example.com");
  await page.route("**/api/auth/abuse-check", route => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await expect(page.getByText("Falha de conexão. Verifique sua internet e tente novamente.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar link de redefinição" })).toBeEnabled();
});
