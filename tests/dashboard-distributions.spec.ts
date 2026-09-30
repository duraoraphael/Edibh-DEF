import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import type { AppRecord } from "../src/types";

const harnessRequire = createRequire(path.join(process.cwd(), "tests", "dashboard-distributions.spec.ts"));
let harness: { script: string; css: string };
const counts = [59, 56, 53, 48, 39, 26, 18, 12, 10, 8, 6, 4, 2];
const records: AppRecord[] = counts.flatMap((count, category) => Array.from({ length: count }, (_, index) => ({
  id: `${category}-${index}`, authorId: "test", authorName: `Responsável ${category}`,
  status: "pendente", createdAt: "2026-09-01T12:00:00Z",
  data: {
    gerencia: `Gerência ${category}`, instalacao: `Instalação com nome muito longo ${category}`,
    sistema: `Sistema ${category}`, sistema_macro_123: `Macro ${category % 2}`,
    fonte_de_dados_123: category % 2 ? "RDO" : index % 2 ? "SUPERVISORIO-IOT" : "SUPERVISÓRIO-IOT",
  },
})));

test.beforeAll(async () => {
  test.setTimeout(60_000);
  harness = await harnessRequire("./support/dashboard-browser-harness.cjs")();
});

test.beforeEach(async ({ page }) => {
  await page.route("http://dashboard.test/", route => route.fulfill({ contentType: "text/html", body: '<html lang="pt-BR"><body><main style="padding:16px;max-width:1400px;margin:auto"><div id="root"></div></main></body></html>' }));
  await page.goto("http://dashboard.test/");
  await page.addStyleTag({ content: harness.css });
  await page.evaluate(fixture => { Object.assign(window, { dashboardFixture: fixture }); }, {
    records: [...records, { ...records[0], id: "draft", status: "rascunho" }],
    fields: [
      { key: "sistema_macro_123", label: "Sistema Macro" },
      { key: "fonte_de_dados_123", label: "Fonte de Dados", options: ["RDO", "SUPERVISORIO-IOT", "SUPERVISÓRIO-IOT", "Manual"] },
    ],
  });
  await page.addScriptTag({ content: harness.script });
});

test("six tabs, real columns, labels, sources, tooltip and keyboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const panel = page.getByRole("tabpanel");
  await expect(panel.locator(".recharts-bar-rectangle")).toHaveCount(13);
  await expect(panel.getByText("341 registros filtrados")).toBeVisible();
  await expect(panel.locator("tspan").filter({ hasText: /^59$/ })).toBeVisible();
  await expect(panel.locator("tspan").filter({ hasText: /^17,3%$/ })).toBeVisible();
  const bar = panel.locator(".recharts-bar-rectangle path").first();
  const box = await bar.boundingBox();
  expect(box!.height).toBeGreaterThan(box!.width);
  await bar.hover();
  await expect(panel.getByRole("tooltip")).toContainText("Gerência 0");
  await expect(panel.getByRole("tooltip")).toContainText("59 registros");
  await expect(panel.getByRole("tooltip")).toContainText("17,3% do total");
  for (const [label, bars] of [["Instalação", 13], ["Sistema", 13], ["Sistema Macro", 2], ["Responsável", 13], ["Fonte de Dados", 2], ["Gerência", 13]] as const) {
    await page.getByRole("tab", { name: label, exact: true }).click();
    await expect(panel.getByRole("heading", { name: `Distribuição por ${label}`, exact: true })).toBeVisible();
    await expect(panel.locator(".recharts-bar-rectangle")).toHaveCount(bars);
    await expect(panel.locator(".recharts-wrapper")).toHaveCount(1);
  }
  await page.getByRole("tab", { name: "Fonte de Dados", exact: true }).click();
  await expect(panel.locator(".recharts-xAxis-tick-labels")).toContainText("IOT");
  await expect(panel.locator(".recharts-xAxis-tick-labels")).toContainText("RDO-INSTALAÇÃO");
  await expect(panel.locator(".recharts-xAxis-tick-labels")).not.toContainText("SUPERVIS");
  await page.getByRole("tab", { name: "Fonte de Dados", exact: true }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Gerência", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("dashboard filters recompute the chart and empty state", async ({ page }) => {
  const panel = page.getByRole("tabpanel");
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByRole("combobox", { name: "Gerência", exact: true }).click();
  await page.getByRole("option", { name: "Gerência 0", exact: true }).click();
  await expect(panel.locator(".recharts-bar-rectangle")).toHaveCount(1);
  await expect(panel.getByText("59 registros filtrados")).toBeVisible();
  await expect(panel.locator("tspan").filter({ hasText: /^100,0%$/ })).toBeVisible();
  await page.getByRole("tab", { name: "Fonte de Dados", exact: true }).click();
  await expect(panel.locator("tspan").filter({ hasText: /^59$/ })).toBeVisible();
  await expect(panel.locator(".recharts-yAxis-tick-labels")).toContainText("80");
  await page.getByRole("combobox", { name: "Gerência", exact: true }).click();
  await page.getByRole("option", { name: "Gerência 12", exact: true }).click();
  await expect(panel.getByText("2 registros filtrados")).toBeVisible();
  await expect(panel.locator(".recharts-yAxis-tick-labels")).not.toContainText("80");
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Reprovado", exact: true }).click();
  await expect(panel.getByText("Nenhum dado disponível")).toBeVisible();
});

test("responsive height, internal scrolling and nonoverlapping long names", async ({ page }, testInfo) => {
  const panel = page.getByRole("tabpanel");
  await page.getByRole("tab", { name: "Instalação", exact: true }).click();
  for (const [width, height] of [[1440, 480], [1024, 480], [768, 400], [375, 350]]) {
    await page.setViewportSize({ width, height: 1000 });
    const scroll = panel.getByRole("region");
    await expect.poll(async () => Math.round((await panel.locator(".recharts-wrapper").boundingBox())!.height)).toBe(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await scroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await scroll.evaluate(element => { element.scrollLeft = 300; });
    expect(await scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    const labels = await panel.locator(".recharts-xAxis-tick-labels text").evaluateAll(elements => elements.map(element => {
      const { left, right } = element.getBoundingClientRect(); return { left, right };
    }));
    expect(labels.length).toBe(13);
    for (let index = 1; index < labels.length; index++) expect(labels[index].left).toBeGreaterThan(labels[index - 1].right);
    await expect(panel.locator(".recharts-xAxis-tick-labels title").first()).toHaveText("Instalação com nome muito longo 0");
    await scroll.evaluate(element => { element.scrollLeft = 0; });
    await panel.screenshot({ path: testInfo.outputPath(`distribution-${width}.png`) });
  }
});
