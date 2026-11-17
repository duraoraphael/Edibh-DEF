import { test } from "node:test";
import assert from "node:assert/strict";
// forms.ts imports the Firebase client, which only needs placeholder public config here.
for (const name of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"]) process.env[`NEXT_PUBLIC_FIREBASE_${name}`] ??= "test";
const { buildDistributionData, DISTRIBUTION_KEYS } = await import("../src/lib/dashboard-distributions.ts");
const { filterDrillRows, paginate, periodLabel, recordDetailHref, sortDrillRows, toDrillRow } = await import("../src/lib/dashboard-drilldown.ts");
const nav = await import("../src/lib/dashboard-nav.ts");
const { filterByPeriod, scopeRecords } = await import("../src/lib/dashboard-scope.ts");
import type { AppRecord, FormField } from "../src/types/index.ts";

const sourceField: FormField = { id: "s", key: "fonte_de_dados_1", label: "Fonte de Dados", type: "multipla_escolha", order: 0, options: ["RDO", "SUPERVISORIO-IOT", "Manual"] };
const macroField: FormField = { id: "m", key: "sistema_macro_1", label: "Sistema Macro", type: "selecao", order: 1 };
const dateField: FormField = { id: "d", key: "data_1", label: "Data", type: "data", order: 2 };
const fields = [sourceField, macroField, dateField];

let counter = 0;
const rec = (data: Record<string, unknown>, extra: Partial<AppRecord> = {}): AppRecord => ({
  id: `r${++counter}`, authorId: "u", authorName: "Ana", status: "pendente", recordNumber: `${String(counter).padStart(3, "0")}/2026`, data, ...extra,
});

const records: AppRecord[] = [
  rec({ gerencia: "G1", instalacao: "I1", sistema: "S1", sistema_macro_1: "M1", fonte_de_dados_1: ["SUPERVISÓRIO-IOT", "SUPERVISORIO-IOT"], data_1: "2026-09-01", equipamento: "Bomba A" }),
  rec({ gerencia: "G1", instalacao: "I2", sistema: "S1", sistema_macro_1: "M1", fonte_de_dados_1: ["IOT", "RDO"], data_1: "2026-09-01", equipamento: "Bomba B" }, { authorName: "Bia", status: "aprovado" }),
  rec({ gerencia: "G2", instalacao: "I1", sistema: "S2", fonte_de_dados_1: "RDO", data_1: "2026-09-02" }, { authorName: "Bia" }),
  rec({ instalacao: "I1", data_1: "" }, { createdAt: "" }),
];

test("every bar of every distribution lists exactly as many records as it counts", () => {
  for (const key of DISTRIBUTION_KEYS) {
    for (const bar of buildDistributionData(records, key, fields)) {
      const matching = records.filter((record) => nav.recordMatchesStep(record, { dim: key, value: bar.name }, fields));
      assert.equal(matching.length, bar.total, `${key}/${bar.name}`);
    }
  }
});

test("source steps keep multi-source flows in every column and never match flows without that source", () => {
  const count = (value: string) => records.filter((record) => nav.recordMatchesStep(record, { dim: "fonteDados", value }, fields)).length;
  assert.equal(count("IOT"), 2);
  assert.equal(count("RDO"), 2);
  assert.equal(count("Manual"), 0);
  assert.equal(records.filter((record) => nav.recordMatchesStep(record, { dim: "status", value: "aprovado" }, fields)).length, 1);
});

test("URL round-trips structured steps, global filters, search, dates and day", () => {
  const href = nav.buildDetailHref({
    steps: [{ dim: "fonteDados", value: "IOT" }, { dim: "instalacao", value: "Rio: Norte & Sul" }, { dim: "status", value: "pendente" }],
    globals: { ...nav.DEFAULT_GLOBALS, gerencia: "G1", dateFrom: "2026-01-01" },
    search: "bomba", dateFrom: "2026-02-01", dateTo: "2026-03-01", day: "1/9",
  });
  assert.ok(href.startsWith("/dashboard/detalhamento?"));
  const parsed = nav.parseDetailQuery(new URL(href, "http://x").searchParams);
  assert.deepEqual(parsed.steps, [{ dim: "fonteDados", value: "IOT" }, { dim: "instalacao", value: "Rio: Norte & Sul" }, { dim: "status", value: "pendente" }]);
  assert.equal(parsed.globals.gerencia, "G1");
  assert.equal(parsed.globals.dateFrom, "2026-01-01");
  assert.equal(parsed.globals.instalacao, "todos");
  assert.deepEqual([parsed.search, parsed.dateFrom, parsed.dateTo, parsed.day], ["bomba", "2026-02-01", "2026-03-01", "1/9"]);
});

test("URL input is sanitised: unknown dimensions, empty values, repeats, bad status, dates and day are dropped", () => {
  const params = new URLSearchParams([
    ["f", "fonteDados:IOT"], ["f", "fonteDados:RDO"], ["f", "hack:1"], ["f", "instalacao:"], ["f", "semdoispontos"], ["f", "status:inexistente"], ["f", "gerencia:G1"],
    ["g_dateFrom", "ontem"], ["de", "2026-13-99x"], ["dia", "<script>"],
  ]);
  const parsed = nav.parseDetailQuery(params);
  assert.deepEqual(parsed.steps, [{ dim: "fonteDados", value: "IOT" }, { dim: "gerencia", value: "G1" }]);
  assert.equal(parsed.globals.dateFrom, "");
  assert.equal(parsed.dateFrom, "");
  assert.equal(parsed.day, "");
});

test("steps never repeat a dimension; removing and labels work; status categories map to stable keys", () => {
  let steps = nav.addStep([], { dim: "fonteDados", value: "IOT" });
  steps = nav.addStep(steps, { dim: "instalacao", value: "I1" });
  steps = nav.addStep(steps, { dim: "instalacao", value: "I2" });
  assert.deepEqual(steps, [{ dim: "fonteDados", value: "IOT" }, { dim: "instalacao", value: "I2" }]);
  assert.deepEqual(nav.removeStep(steps, "instalacao"), [{ dim: "fonteDados", value: "IOT" }]);
  assert.deepEqual(nav.stepFromCategory("status", "Em Andamento"), { dim: "status", value: "aprovado" });
  assert.equal(nav.stepLabel({ dim: "status", value: "aprovado" }), "Em Andamento");
  assert.equal(nav.buildDashboardHref({ ...nav.DEFAULT_GLOBALS, instalacao: "I1" }), "/dashboard?g_instalacao=I1");
  assert.equal(nav.buildDashboardHref(nav.DEFAULT_GLOBALS), "/dashboard");
});

test("global scope helpers reproduce the dashboard's filters", () => {
  const g = { ...nav.DEFAULT_GLOBALS };
  assert.equal(scopeRecords(records, { ...g, gerencia: "G1" }).length, 2);
  assert.equal(scopeRecords(records, { ...g, responsavel: "Bia", status: "pendente" }).length, 1);
  assert.equal(filterByPeriod(records, { ...g, dateFrom: "2026-09-02" }, fields).length, 1);
  assert.equal(filterByPeriod(records, { ...g, ano: "2026", mes: "9" }, fields).length, 3);
  assert.deepEqual(nav.describeGlobals({ ...g, gerencia: "G1", dateTo: "2026-09-30" }), ["Gerência: G1", "Até: 30/09/2026"]);
});

test("search ignores accents and case; dates use the flow date; empty dates never match a range", () => {
  const rows = records.map((record) => toDrillRow(record, fields));
  const criteria = (patch: object) => ({ search: "", dateFrom: "", dateTo: "", ...patch });
  assert.equal(filterDrillRows(rows, criteria({ search: "BOMBA" })).length, 2);
  assert.equal(filterDrillRows(rows, criteria({ search: "inexistente" })).length, 0);
  assert.equal(filterDrillRows(rows, criteria({ dateFrom: "2026-09-02" })).length, 1);
  assert.equal(filterDrillRows(rows, criteria({ dateTo: "2026-09-01" })).length, 2);
  assert.equal(periodLabel(records[0], fields), "1/9");
  assert.equal(periodLabel(records[3], fields), "N/D");
});

test("sorting is stable, numeric-aware and sends empty values last in both directions", () => {
  const rows = records.map((record) => toDrillRow(record, fields));
  assert.deepEqual(sortDrillRows(rows, "number", "desc").map((row) => row.number), ["004/2026", "003/2026", "002/2026", "001/2026"].map((n) => n.replace(/^0*(\d+)/, (_, d) => d.padStart(3, "0"))));
  for (const dir of ["asc", "desc"] as const) assert.equal(sortDrillRows(rows, "gerencia", dir).at(-1)?.gerencia, "");
  assert.equal(rows[0].sistemaMacro, "M1");
  assert.equal(rows[2].sistemaMacro, "");
});

test("pagination clamps the page; the flow link carries its return target", () => {
  const items = Array.from({ length: 23 }, (_, index) => index);
  assert.deepEqual(paginate(items, 3, 10), { page: 3, pages: 3, items: [20, 21, 22] });
  assert.equal(paginate(items, 99, 10).page, 3);
  assert.deepEqual(paginate([], 1, 10), { page: 1, pages: 1, items: [] });
  assert.equal(recordDetailHref("abc", "/dashboard/detalhamento?f=status%3Apendente"), "/records?record=abc&returnTo=%2Fdashboard%2Fdetalhamento%3Ff%3Dstatus%253Apendente");
});
