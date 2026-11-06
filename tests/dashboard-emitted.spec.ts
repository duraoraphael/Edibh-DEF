import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

const harnessRequire = createRequire(path.join(process.cwd(), "tests", "dashboard-emitted.spec.ts"));
let harness: { script: string; css: string };

const now = new Date();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const prev = now.getMonth() === 0 ? { y: now.getFullYear() - 1, m: 12 } : { y: now.getFullYear(), m: now.getMonth() };
const cur = { y: now.getFullYear(), m: now.getMonth() + 1 };
// 2024 is never the current year when this suite runs (clock is >= 2026).
const rows: Array<[string, string, string, Record<string, unknown>?]> = [
  [iso(2024, 1, 5), "A1", "pendente"], [iso(2024, 1, 20), "A2", "aprovado"], [iso(2024, 1, 31), "A3", "concluido"],
  [iso(2024, 3, 2), "Bomba Principal", "pendente", { instalacao: "I1" }], [iso(2024, 3, 28), "Válvula 7", "reajuste", { instalacao: "I2" }],
  [iso(2024, 3, 9), "Descartado", "rejeitado"], [iso(2024, 3, 10), "Rascunho", "rascunho"],
  [iso(cur.y, cur.m, 1), "C1", "pendente"], [iso(cur.y, cur.m, 2), "C2", "pendente"],
  [iso(prev.y, prev.m, 15), "P1", "pendente"],
];
const records = rows.map(([date, equipamento, status, extra], i) => ({
  id: `r${i}`, recordNumber: `${i + 1}/2024`, authorId: "u", authorName: "Ana", status, createdAt: "2030-01-01T12:00:00Z",
  data: { equipamento, data: date, instalacao: "I0", ...extra },
}));

test.beforeAll(async () => {
  test.setTimeout(60_000);
  harness = await harnessRequire("./support/dashboard-browser-harness.cjs")();
});

test.beforeEach(async ({ page }) => {
  await page.route("http://dashboard.test/", route => route.fulfill({ contentType: "text/html", body: '<html lang="pt-BR"><body><main style="padding:16px;max-width:1400px;margin:auto"><div id="root"></div></main></body></html>' }));
  await page.goto("http://dashboard.test/");
  await page.addStyleTag({ content: harness.css });
  await page.evaluate(fixture => { Object.assign(window, { dashboardFixture: fixture }); }, {
    records,
    fields: [{ id: "d", key: "data", label: "Data", type: "data", order: 1 }],
  });
  await page.addScriptTag({ content: harness.script });
});

const section = (page: import("@playwright/test").Page) => page.getByRole("region", { name: /Equipamentos emitidos/ });

test("série anual, zeros, clique no mês, tabela e limpar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const s = section(page);
  await s.getByRole("combobox", { name: "Emitidos: ano" }).click();
  await page.getByRole("option", { name: "2024", exact: true }).click();

  await expect(s.locator(".recharts-xAxis .recharts-cartesian-axis-tick")).toHaveCount(12); // 12 meses no eixo
  await expect(s.locator(".recharts-bar-rectangle")).toHaveCount(2); // só jan e mar têm altura
  await expect(s.locator("tspan").filter({ hasText: /^0$/ }).first()).toBeVisible(); // meses sem emissão aparecem com 0
  // 3 em janeiro, 2 em março (rascunho e reprovado ficam fora) => 5 no ano
  await expect(s.getByText("5 registro(s) encontrado(s)")).toBeVisible();
  await expect(s.getByText("Acumulado de 2024")).toBeVisible();

  await s.locator(".recharts-bar-rectangle path").nth(1).click(); // março (2ª coluna com valor)
  await expect(s.getByText("2 registro(s) encontrado(s)")).toBeVisible();
  await expect(s.getByRole("cell", { name: "Bomba Principal" })).toBeVisible();
  await expect(s.getByRole("cell", { name: "Descartado" })).toHaveCount(0);
  await expect(s.getByRole("cell", { name: "Rascunho", exact: true })).toHaveCount(0);

  await s.getByLabel("Buscar equipamento").fill("valvula");
  await expect(s.getByText("1 registro(s) encontrado(s)")).toBeVisible();

  await s.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(s.getByText("5 registro(s) encontrado(s)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mês atual e variação concordam com os dados", async ({ page }) => {
  const s = section(page);
  await expect(s.getByText("Emitidos no mês atual")).toBeVisible();
  // 2 no mês atual vs 1 no anterior => +100%
  await expect(s.getByText("+100%")).toBeVisible();
});

test("ano sem emissões mostra estado vazio", async ({ page }) => {
  const s = section(page);
  await s.getByRole("combobox", { name: "Emitidos: mês" }).click();
  await page.getByRole("option", { name: "Fevereiro", exact: true }).click();
  await s.getByRole("combobox", { name: "Emitidos: ano" }).click();
  await page.getByRole("option", { name: "2024", exact: true }).click();
  await expect(s.getByText(/Nenhum equipamento emitido em/)).toBeVisible();
});

test("layout em celular sem rolagem horizontal da página", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(section(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
