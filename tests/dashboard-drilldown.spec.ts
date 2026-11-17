import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import type { AppRecord } from "../src/types";

const harnessRequire = createRequire(path.join(process.cwd(), "tests", "dashboard-drilldown.spec.ts"));
let harness: { script: string; css: string };

// 40 IOT-only, 12 RDO-only, 3 with both sources, 5 without any source → source bars: IOT 43, RDO 16 (902 adds one RDO; 900 reprovado and 901 rascunho are out).
const make = (id: string, over: Partial<AppRecord> & { source?: string[]; ger?: string; inst?: string; day?: number } = {}): AppRecord => ({
  id, recordNumber: `${id.padStart(3, "0")}/2026`, authorId: "u", authorName: over.authorName ?? (Number(id) % 2 ? "Ana" : "Bia"),
  status: over.status ?? "pendente", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-10T12:00:00Z",
  data: {
    gerencia: over.ger ?? "G1", instalacao: over.inst ?? (Number(id) % 3 ? "Inst A" : "Inst B"), sistema: "Sis", equipamento: `Equip ${id}`,
    sistema_macro_1: "Macro", data_1: `2026-09-${String(over.day ?? 1 + (Number(id) % 3)).padStart(2, "0")}`,
    ...(over.source ? { fonte_de_dados_1: over.source } : {}),
  },
});
let n = 0;
const records: AppRecord[] = [
  ...Array.from({ length: 40 }, () => make(String(++n), { source: ["SUPERVISÓRIO-IOT"] })),
  ...Array.from({ length: 12 }, () => make(String(++n), { source: ["RDO"] })),
  ...Array.from({ length: 3 }, () => make(String(++n), { source: ["IOT", "RDO"], ger: "G2" })),
  ...Array.from({ length: 5 }, () => make(String(++n), { ger: "G2" })),
  make("900", { status: "rejeitado", source: ["RDO"] }),
  make("901", { status: "rascunho", source: ["RDO"] }),
  make("902", { status: "aprovado", source: ["RDO"], ger: "G3" }),
];

test.beforeAll(async () => {
  test.setTimeout(60_000);
  harness = await harnessRequire("./support/dashboard-browser-harness.cjs")();
});

async function load(page: Page) {
  await page.route("http://dashboard.test/", route => route.fulfill({ contentType: "text/html", body: '<html lang="pt-BR"><body><main style="padding:16px;max-width:1400px;margin:auto"><div id="root"></div></main></body></html>' }));
  await page.goto("http://dashboard.test/");
  await page.addStyleTag({ content: harness.css });
  await page.evaluate(fixture => { Object.assign(window, { dashboardFixture: fixture }); }, {
    records,
    fields: [
      { key: "sistema_macro_1", label: "Sistema Macro", type: "selecao", order: 1 },
      { key: "fonte_de_dados_1", label: "Fonte de Dados", type: "multipla_escolha", order: 2, options: ["RDO", "SUPERVISORIO-IOT", "Manual"] },
      { key: "data_1", label: "Data", type: "data", order: 3 },
    ],
  });
  await page.addScriptTag({ content: harness.script });
}

const panel = (page: Page) => page.getByTestId("drilldown-panel");

test.beforeEach(async ({ page }) => { await load(page); });

test("source bar opens the panel with exactly the counted flows, then closes without losing the chart", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("tab", { name: "Fonte de Dados", exact: true }).click();
  const chart = page.getByRole("tabpanel");
  await expect(chart.locator("tspan").filter({ hasText: /^43$/ })).toBeVisible();
  await expect(chart.locator("tspan").filter({ hasText: /^16$/ })).toBeVisible();

  await chart.locator(".recharts-bar-rectangle path").first().click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("heading", { name: "IOT" })).toBeVisible();
  await expect(panel(page)).toContainText("43 registros");
  await expect(panel(page)).toContainText("de 61 filtrados");
  await expect(panel(page)).toContainText("um fluxo com mais de uma fonte aparece em mais de uma coluna");
  await expect(page.getByTestId("drilldown-summary")).toContainText("1–10 de 43 fluxos");
  await expect(page.getByTestId("drilldown-row")).toHaveCount(10);
  // dashboard filter "rejeitado excluded" is made explicit
  await expect(panel(page)).toContainText("Exclui fluxos reprovados");

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(chart.locator(".recharts-bar-rectangle")).toHaveCount(2); // Manual has zero registros: no visible column
});

test("every category of every distribution tab matches its count", async ({ page }) => {
  const chart = page.getByRole("tabpanel");
  for (const label of ["Gerência", "Instalação", "Sistema", "Sistema Macro", "Responsável", "Fonte de Dados"]) {
    await page.getByRole("tab", { name: label, exact: true }).click();
    const names = await chart.locator(".recharts-xAxis-tick-labels title").allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const tick = chart.locator(".recharts-xAxis-tick-labels").getByRole("button", { name: `Ver fluxos: ${name}`, exact: true });
      await tick.focus();
      await page.keyboard.press("Enter");
      await expect(panel(page)).toBeVisible();
      await expect(panel(page).getByRole("heading", { name })).toBeVisible();
      const heading = await panel(page).getByText(/^\d[\d.]* registros?$|^\d[\d.]*\s+registros? ·/).first().textContent();
      const shown = Number((heading ?? "").match(/^[\d.]+/)?.[0].replace(/\./g, ""));
      // the bar label above the column shows the same number
      await page.keyboard.press("Escape");
      const barTotals = await chart.locator("tspan").allTextContents();
      expect(barTotals).toContain(String(shown));
    }
  }
});

test("status list, keyboard period chart and flow links open the right panel", async ({ page }) => {
  await page.getByRole("button", { name: /Ver fluxos: Em Andamento/ }).click();
  await expect(panel(page)).toContainText("1 registro ·");
  await expect(page.getByTestId("drilldown-row")).toHaveCount(1);
  await expect(panel(page).getByRole("link", { name: "Abrir fluxo 902/2026" })).toHaveAttribute("href", /\/records\?record=902&returnTo=%2Fdashboard/);
  await page.keyboard.press("Escape");

  // Reprovados are part of the status chart (not of the total): 1 flow
  await page.getByRole("button", { name: /Ver fluxos: Reprovado/ }).click();
  await expect(page.getByTestId("drilldown-row")).toHaveCount(1);
  await expect(panel(page)).not.toContainText("Exclui fluxos reprovados");
  await page.keyboard.press("Escape");

  const period = page.getByLabel(/Evolução de registros por dia/);
  await period.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText("sem considerar o ano");
});

test("filters, search, sorting and pagination work together and can be cleared", async ({ page }) => {
  await page.getByRole("tab", { name: "Fonte de Dados", exact: true }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: "Ver fluxos: IOT", exact: true }).focus();
  await page.keyboard.press("Enter");
  const rows = page.getByTestId("drilldown-row");
  const summary = page.getByTestId("drilldown-summary");

  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(summary).toContainText("11–20 de 43");
  await page.getByRole("button", { name: "Fluxo", exact: true }).click(); // number sort flips to descending
  await expect(summary).toContainText("1–10 de 43");
  await expect(rows.first()).toContainText("055/2026");

  await panel(page).getByRole("combobox", { name: "Itens por página" }).click();
  await page.getByRole("option", { name: "50 por página" }).click();
  await expect(rows).toHaveCount(43);

  await page.getByLabel("Buscar fluxos").fill("equip 7");
  await expect(summary).toContainText("de 43)");
  await expect(rows).toHaveCount(await rows.count());
  expect(await rows.count()).toBeLessThan(43);

  await page.getByLabel("Buscar fluxos").fill("");
  await panel(page).getByRole("combobox", { name: "Responsável" }).click();
  await page.getByRole("option", { name: "Ana", exact: true }).click();
  const withAna = await rows.count();
  expect(withAna).toBeGreaterThan(0);
  expect(withAna).toBeLessThan(43);
  await expect(rows.filter({ hasText: "Bia" })).toHaveCount(0);

  await page.getByLabel("Buscar fluxos").fill("zzzz-nao-existe");
  await expect(panel(page)).toContainText("Nenhum fluxo corresponde aos filtros do detalhamento");
  await panel(page).getByRole("button", { name: "Limpar filtros" }).first().click();
  await expect(rows).toHaveCount(43);
});

test("dashboard filters are respected and shown, empty category behaves, and panel is responsive", async ({ page }) => {
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByRole("combobox", { name: "Gerência", exact: true }).click();
  await page.getByRole("option", { name: "G2", exact: true }).click();
  await page.getByRole("tab", { name: "Fonte de Dados", exact: true }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: "Ver fluxos: RDO", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toContainText("3 registros");
  await expect(panel(page)).toContainText("Gerência: G2");
  await expect(page.getByTestId("drilldown-row")).toHaveCount(3);
  await page.keyboard.press("Escape");

  // "Manual" is a configured option with zero selections: still listed, opens an empty state
  await page.getByRole("tabpanel").getByRole("button", { name: "Ver fluxos: Manual", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toContainText("0 registros");
  await expect(panel(page)).toContainText("Nenhum fluxo encontrado para esta categoria");
  await page.keyboard.press("Escape");

  await page.getByRole("tabpanel").getByRole("button", { name: "Ver fluxos: IOT", exact: true }).focus();
  await page.keyboard.press("Enter");
  for (const [width, height] of [[1440, 900], [768, 1000], [375, 800]]) {
    await page.setViewportSize({ width, height });
    const box = await panel(page).boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width + 0.5);
    expect(box!.height).toBe(height);
    await expect.poll(async () => (await page.evaluate(() => document.documentElement.scrollWidth)) <= width, { message: `scrollWidth overflows at ${width}px` }).toBe(true);
  }
  await expect(panel(page).getByRole("button", { name: "Voltar ao dashboard" })).toBeVisible();
  await panel(page).getByRole("button", { name: "Voltar ao dashboard" }).click();
  await expect(panel(page)).toHaveCount(0);
  // filters survive closing
  await expect(page.getByRole("button", { name: "Filtros (1)" })).toBeVisible();
});

test("opening a flow stores the dashboard state, which is restored on return", async ({ page }) => {
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByRole("combobox", { name: "Gerência", exact: true }).click();
  await page.getByRole("option", { name: "G1", exact: true }).click();
  await page.getByRole("tab", { name: "Instalação", exact: true }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: "Ver fluxos: Inst A", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Buscar fluxos").fill("equip 1");
  const link = panel(page).getByRole("link").first();
  await link.evaluate(element => element.addEventListener("click", event => event.preventDefault()));
  await link.click();
  const saved = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem("dashboard-drilldown-return")!));
  expect(saved.filters.gerencia).toBe("G1");
  expect(saved.distributionKey).toBe("instalacao");
  expect(saved.drill).toEqual({ chart: "instalacao", category: "Inst A" });
  expect(saved.panel.search).toBe("equip 1");

  // simulate the return navigation: a fresh dashboard mount reads the snapshot
  await page.evaluate(snapshot => window.sessionStorage.setItem("dashboard-drilldown-return", JSON.stringify(snapshot)), saved);
  await page.reload();
  await page.addStyleTag({ content: harness.css });
  await page.evaluate(fixture => { Object.assign(window, { dashboardFixture: fixture }); }, { records, fields: [{ key: "data_1", label: "Data", type: "data", order: 3 }] });
  await page.addScriptTag({ content: harness.script });
  await expect(panel(page).getByRole("heading", { name: "Inst A" })).toBeVisible();
  await expect(page.getByLabel("Buscar fluxos")).toHaveValue("equip 1");
  await expect(panel(page)).toContainText("Gerência: G1");
  await expect(page.locator("#distribution-tab-instalacao")).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => window.sessionStorage.getItem("dashboard-drilldown-return"))).toBeNull();
});
