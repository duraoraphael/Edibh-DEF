import { test, expect } from "@playwright/test";

test("unauthenticated visitor is redirected to /login", async ({ page }) => {
  await page.goto("/");
  // Firebase Auth's cold-start check (no cached session yet) can take a few
  // seconds on a fresh browser profile, longer than most assertions need.
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Fluxo de Equipamentos" })).toBeVisible();
});

test("login form renders with required fields", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("security headers are present on every response", async ({ page }) => {
  const response = await page.goto("/login");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["access-control-allow-origin"]).not.toBe("*");
});
