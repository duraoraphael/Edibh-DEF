import { test, expect, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import type { AppRecord } from "../src/types";

const harnessRequire = createRequire(path.join(process.cwd(), "tests", "dashboard-drilldown.spec.ts"));
let harness: { script: string; css: string };

// 40 IOT-only, 12 RDO-only, 3 with both sources (gerência G2), 5 without source (G2),
// plus 900 reprovado (RDO), 901 rascunho (RDO) and 902 em andamento (RDO, G3).
const make = (id: string, over: Partial<AppRecord> & { source?: string[]; ger?: string } = {}): AppRecord => ({
  id, recordNumber: `${id.padStart(3, "0")}/2026`, authorId: "u", authorName: over.authorName ?? (Number(id) % 2 ? "Ana" : "Bia"),
  status: over.status ?? "pendente", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-10T12:00:00Z",
  data: {
    gerencia: over.ger ?? "G1", instalacao: Number(id) % 3 ? "Inst A" : "Inst B", sistema: Number(id) % 5 ? "Sis 1" : "Sis 2", equipamento: `Equip ${id}`,
    sistema_macro_1: Number(id) % 2 ? "Macro 1" : "Macro 2", data_1: `2026-09-0${1 + (Number(id) % 3)}`,
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
const live = records.filter(record => !["rascunho", "rejeitado"].includes(record.status));
const fixture = {
  records,
  fields: [
    { key: "sistema_macro_1", label: "Sistema Macro", type: "selecao", order: 1 },
    { key: "fonte_de_dados_1", label: "Fonte de Dados", type: "multipla_escolha", order: 2, options: ["RDO", "SUPERVISORIO-IOT", "Manual"] },
    { key: "data_1", label: "Data", type: "data", order: 3 },
  ],
};
const iot = live.filter(record => (record.data!.fonte_de_dados_1 as string[] | undefined)?.some(value => /IOT/.test(value)));
const distinct = (list: AppRecord[], key: string) => new Set(list.map(record => record.data![key])).size;

test.beforeAll(async () => {
  test.setTimeout(60_000);
  harness = await harnessRequire("./support/dashboard-browser-harness.cjs")();
});

async function inject(page: Page) {
  await page.addStyleTag({ content: harness.css });
  await page.evaluate(data => { Object.assign(window, { dashboardFixture: data }); }, fixture);
  await page.addScriptTag({ content: harness.script });
}
async function boot(page: Page, url = "/") {
  await page.goto(`http://dashboard.test${url}`);
  await inject(page);
}
async function reload(page: Page) {
  await page.reload();
  await inject(page);
}

test.beforeEach(async ({ page }) => {
  await page.route("http://dashboard.test/**", route => route.fulfill({ contentType: "text/html", body: '<html lang="pt-BR"><body><main style="padding:16px;max-width:1400px;margin:auto"><div id="root"></div></main></body></html>' }));
});

const search = (page: Page) => new URL(page.url()).searchParams;
const steps = (page: Page) => search(page).getAll("f");
const count = (page: Page) => page.getByTestId("detail-count");
const kpi = (page: Page, label: string) => page.getByTestId(`kpi-${label}`);
const chart = (page: Page, dim: string) => page.getByTestId(`chart-${dim}`);
const bar = (page: Page, dim: string, name: string) => chart(page, dim).locator(".recharts-xAxis-tick-labels").getByRole("button", { name: `Ver fluxos: ${name}`, exact: true });
async function pressTick(locator: Locator) { await locator.focus(); await locator.press("Enter"); }
async function chartTotals(page: Page, dim: string) { return (await chart(page, dim).locator('tspan[font-weight="600"]').allTextContents()).filter(text => /^\d+$/.test(text)).map(Number); }
async function openSourceIot(page: Page) {
  await boot(page);
  await page.getByRole("tab", { name: "Fonte de Dados", exact: true }).click();
  await page.getByRole("tabpanel").locator(".recharts-bar-rectangle path").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dashboard de Fluxos — IOT");
}

test("clicking IOT opens its own page with the selection applied and every figure recalculated", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSourceIot(page);
  expect(new URL(page.url()).pathname).toBe("/dashboard/detalhamento");
  expect(steps(page)).toEqual(["fonteDados:IOT"]);
  await expect(page.getByText("Análise consolidada dos fluxos vinculados a fonte de dados IOT.")).toBeVisible();
  await expect(count(page)).toContainText("43 fluxos encontrados");

  // indicators come from the real flows
  await expect(kpi(page, "Fluxos totais")).toHaveText("43");
  await expect(kpi(page, "Sistemas")).toHaveText(String(distinct(iot, "sistema")));
  await expect(kpi(page, "Sistemas Macro")).toHaveText(String(distinct(iot, "sistema_macro_1")));
  await expect(kpi(page, "Instalações")).toHaveText(String(distinct(iot, "instalacao")));
  await expect(kpi(page, "Gerências")).toHaveText(String(distinct(iot, "gerencia")));
  await expect(kpi(page, "Responsáveis")).toHaveText("2");

  // all seven charts are there and agree with each other
  for (const dim of ["fonteDados", "instalacao", "gerencia", "sistema", "sistemaMacro", "status", "responsavel"]) await expect(chart(page, dim)).toBeVisible();
  expect(await chartTotals(page, "fonteDados")).toEqual([43, 3]); // IOT 43; the 3 flows that also have RDO stay associated
  for (const dim of ["instalacao", "gerencia", "sistema", "sistemaMacro", "status", "responsavel"]) expect((await chartTotals(page, dim)).reduce((a, b) => a + b, 0)).toBe(43);

  // the originating filter is visible, fixed and survives "Limpar Filtros"
  const source = page.getByRole("combobox", { name: "Fonte de Dados", exact: true });
  await expect(source).toContainText("IOT");
  await expect(source).toBeDisabled();
  await expect(page.getByTestId("flow-summary")).toContainText("1–10 de 43 fluxos");
  await expect(page.getByTestId("flow-row")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Limpar Filtros" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("every category of every distribution leads to a page whose figures match the bar", async ({ page }) => {
  await boot(page);
  for (const [label, dim] of [["Gerência", "gerencia"], ["Instalação", "instalacao"], ["Sistema", "sistema"], ["Sistema Macro", "sistemaMacro"], ["Responsável", "responsavel"], ["Fonte de Dados", "fonteDados"]] as const) {
    await page.getByRole("tab", { name: label, exact: true }).click();
    const panel = page.getByRole("tabpanel");
    const names = await panel.locator(".recharts-xAxis-tick-labels title").allTextContents();
    const totals = (await panel.locator('tspan[font-weight="600"]').allTextContents()).map(Number);
    for (const name of names) {
      await pressTick(panel.locator(".recharts-xAxis-tick-labels").getByRole("button", { name: `Ver fluxos: ${name}`, exact: true }));
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`— ${name}`);
      expect(steps(page)).toEqual([`${dim}:${name}`]);
      const shown = Number((await count(page).locator("strong").textContent())!.replace(/\./g, ""));
      if (shown === 0) expect(name).toBe("Manual"); // configured source with no flows: no column label, empty page
      else expect(totals).toContain(shown);
      await expect(kpi(page, "Fluxos totais")).toHaveText(String(shown));
      await expect(page.getByTestId("flow-summary")).toContainText(shown === 0 ? "0 fluxos" : `de ${shown} fluxos`);
      await page.goBack();
      await page.getByRole("tab", { name: label, exact: true }).click();
    }
  }
});

test("dashboard-wide filters travel to the detail page and come back with the dashboard", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByRole("combobox", { name: "Gerência", exact: true }).click();
  await page.getByRole("option", { name: "G2", exact: true }).click();
  await page.getByRole("tab", { name: "Fonte de Dados", exact: true }).click();
  await pressTick(page.getByRole("tabpanel").getByRole("button", { name: "Ver fluxos: RDO", exact: true }));
  expect(search(page).get("g_gerencia")).toBe("G2");
  await expect(count(page)).toContainText("3 fluxos encontrados");
  await expect(page.getByLabel("Filtros ativos")).toContainText("Gerência: G2");
  const back = page.getByRole("link", { name: "Voltar ao Dashboard" });
  await expect(back).toHaveAttribute("href", "/dashboard?g_gerencia=G2");
  await back.click();
  await expect(page.getByRole("button", { name: "Filtros (1)" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Gerência", exact: true })).toContainText("G2");
});

test("second level, breadcrumbs, removing steps and browser back/forward", async ({ page }) => {
  await openSourceIot(page);
  const instB = iot.filter(record => record.data!.instalacao === "Inst B");
  await pressTick(bar(page, "instalacao", "Inst B"));
  expect(steps(page)).toEqual(["fonteDados:IOT", "instalacao:Inst B"]);
  await expect(count(page)).toContainText(`${instB.length} fluxos encontrados`);
  await expect(kpi(page, "Instalações")).toHaveText("1");
  await expect(kpi(page, "Fluxos totais")).toHaveText(String(instB.length));
  const crumbs = page.getByRole("navigation", { name: "Navegação da análise" });
  await expect(crumbs).toContainText("Fonte de Dados: IOT");
  await expect(crumbs.locator("[aria-current=page]")).toHaveText("Instalação: Inst B");
  // no chart shows flows outside IOT ∩ Inst B
  expect((await chartTotals(page, "instalacao")).reduce((a, b) => a + b, 0)).toBe(instB.length);
  expect(Math.max(...await chartTotals(page, "fonteDados"))).toBe(instB.length);
  await expect(page.getByRole("combobox", { name: "Instalação", exact: true })).toContainText("Inst B");
  await expect(page.getByRole("combobox", { name: "Instalação", exact: true })).toBeEnabled();

  // third level through a different dimension (status chart)
  await pressTick(bar(page, "status", "Em Análise"));
  expect(steps(page)).toEqual(["fonteDados:IOT", "instalacao:Inst B", "status:pendente"]);

  // remove the middle step only
  await page.getByRole("button", { name: "Remover filtro Instalação: Inst B" }).click();
  expect(steps(page)).toEqual(["fonteDados:IOT", "status:pendente"]);
  await expect(page.getByRole("button", { name: "Remover filtro Fonte de Dados: IOT" })).toHaveCount(0);

  // clicking an earlier breadcrumb truncates
  await crumbs.getByRole("link", { name: "Fonte de Dados: IOT" }).click();
  expect(steps(page)).toEqual(["fonteDados:IOT"]);
  await expect(count(page)).toContainText("43 fluxos encontrados");

  // browser history walks the same path
  await page.goBack();
  expect(steps(page)).toEqual(["fonteDados:IOT", "status:pendente"]);
  await page.goBack();
  expect(steps(page)).toEqual(["fonteDados:IOT", "instalacao:Inst B", "status:pendente"]);
  await page.goForward();
  expect(steps(page)).toEqual(["fonteDados:IOT", "status:pendente"]);
});

test("reloading keeps the whole context (steps, search, dates, global filters)", async ({ page }) => {
  await boot(page, "/dashboard/detalhamento?f=fonteDados%3AIOT&f=instalacao%3AInst%20B&g_gerencia=G1&q=equip%201&de=2026-09-01");
  const expected = iot.filter(record => record.data!.instalacao === "Inst B" && record.data!.gerencia === "G1" && /equip 1/i.test(String(record.data!.equipamento)));
  await expect(kpi(page, "Fluxos totais")).toHaveText(String(expected.length));
  await reload(page);
  await expect(page.getByLabel("Buscar fluxos")).toHaveValue("equip 1");
  await expect(page.getByLabel("Data inicial do período")).toHaveValue("2026-09-01");
  await expect(page.getByRole("combobox", { name: "Instalação", exact: true })).toContainText("Inst B");
  await expect(page.getByLabel("Filtros ativos")).toContainText("Gerência: G1");
  await expect(kpi(page, "Fluxos totais")).toHaveText(String(expected.length));
  expect(steps(page)).toEqual(["fonteDados:IOT", "instalacao:Inst B"]);
});

test("internal filters combine, update the figures, never leave the selection, and Limpar Filtros keeps the origin", async ({ page }) => {
  await openSourceIot(page);
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Em Análise", exact: true }).click();
  expect(steps(page)).toEqual(["fonteDados:IOT", "status:pendente"]);
  await page.getByLabel("Buscar fluxos").fill("equip 2");
  const searched = iot.filter(record => /equip 2/i.test(String(record.data!.equipamento)));
  await expect(kpi(page, "Fluxos totais")).toHaveText(String(searched.length));
  await expect.poll(() => search(page).get("q")).toBe("equip 2");
  await page.getByLabel("Data inicial do período").fill("2026-09-03");
  await expect.poll(() => search(page).get("de")).toBe("2026-09-03");
  const rows = page.getByTestId("flow-row");
  const withDate = searched.filter(record => String(record.data!.data_1) >= "2026-09-03");
  await expect(kpi(page, "Fluxos totais")).toHaveText(String(withDate.length));
  await expect(rows.filter({ hasText: "02/09/2026" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "01/09/2026" })).toHaveCount(0);

  await page.getByRole("button", { name: "Limpar Filtros" }).click();
  expect(steps(page)).toEqual(["fonteDados:IOT"]);
  expect(search(page).get("q")).toBeNull();
  expect(search(page).get("de")).toBeNull();
  await expect(page.getByLabel("Buscar fluxos")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Fonte de Dados", exact: true })).toContainText("IOT");
  await expect(count(page)).toContainText("43 fluxos encontrados");

  await page.getByLabel("Buscar fluxos").fill("zzz-sem-resultado");
  await expect(page.getByText("Nenhum fluxo encontrado para os filtros aplicados.")).toBeVisible();
  await expect(kpi(page, "Fluxos totais")).toHaveText("0");
});

test("table: sorting, pagination, page size and flow link round trip", async ({ page }) => {
  await openSourceIot(page);
  const rows = page.getByTestId("flow-row");
  const summary = page.getByTestId("flow-summary");
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(summary).toContainText("11–20 de 43");
  await page.getByRole("button", { name: "Fluxo", exact: true }).click(); // descending
  await expect(summary).toContainText("1–10 de 43");
  await expect(rows.first()).toContainText("055/2026");
  await page.getByRole("combobox", { name: "Itens por página" }).click();
  await page.getByRole("option", { name: "50 por página" }).click();
  await expect(rows).toHaveCount(43);

  // open a flow; the "close" target is exactly this analysis
  const detailUrl = new URL(page.url());
  await rows.first().getByRole("link").click();
  await expect(page.getByTestId("records-stub")).toContainText("Ficha 55");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(`${detailUrl.pathname}${detailUrl.search}`);
  await page.getByRole("button", { name: "Fechar ficha" }).click();
  expect(steps(page)).toEqual(["fonteDados:IOT"]);
  await expect(count(page)).toContainText("43 fluxos encontrados");
});

test("main dashboard: status list, period chart (keyboard) and the other entry points", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: /Ver fluxos: Em Andamento/ }).click();
  expect(steps(page)).toEqual(["status:aprovado"]);
  await expect(count(page)).toContainText("1 fluxo encontrado");
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toContainText("Em Andamento");
  await expect(page.getByLabel("Filtros ativos")).not.toContainText("Exclui fluxos reprovados");
  await page.goBack();

  // reprovados are in the status chart but not in the totals: they appear when analysing status
  await page.getByRole("button", { name: /Ver fluxos: Reprovado/ }).click();
  await expect(count(page)).toContainText("1 fluxo encontrado");
  await page.goBack();

  const period = page.getByLabel(/Evolução de registros por dia/);
  await period.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  expect(new URL(page.url()).pathname).toBe("/dashboard/detalhamento");
  const day = search(page).get("dia")!;
  expect(day).toMatch(/^\d+\/\d+$/);
  await expect(page.getByLabel("Filtros ativos")).toContainText(`Dia: ${day}`);
  const expected = live.filter(record => { const [, m, d] = String(record.data!.data_1).split("-"); return `${Number(d)}/${Number(m)}` === day; });
  await expect(kpi(page, "Fluxos totais")).toHaveText(String(expected.length));
});

test("export uses exactly the flows on screen; unsafe or unknown URL input is ignored; unknown selection is an empty state", async ({ page }) => {
  await boot(page, "/dashboard/detalhamento?f=hack%3A1&f=fonteDados%3AIOT&f=fonteDados%3ARDO&dia=%3Cscript%3E&g_dateFrom=ontem");
  await expect(count(page)).toContainText("43 fluxos encontrados");
  await page.getByRole("button", { name: "Exportar Excel" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __exported?: { records: unknown[] } }).__exported?.records.length)).toBe(43);

  await boot(page, "/dashboard/detalhamento?f=instalacao%3AInexistente");
  await expect(page.getByText("Nenhum fluxo encontrado para esta seleção.")).toBeVisible();
  await expect(kpi(page, "Fluxos totais")).toHaveText("0");
  await expect(page.getByRole("button", { name: "Exportar Excel" })).toBeDisabled();
});

test("responsive: no horizontal page scroll and the filter bar stays usable", async ({ page }) => {
  await openSourceIot(page);
  for (const [width, height] of [[1440, 900], [768, 1000], [375, 800]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `overflow at ${width}px` }).toBe(true);
    for (const label of ["Fonte de Dados", "Instalação", "Gerência", "Sistema", "Sistema Macro", "Status", "Responsável"]) await expect(page.getByRole("combobox", { name: label, exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Buscar por número, descrição...")).toBeVisible();
  }
});
