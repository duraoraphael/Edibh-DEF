import { test } from "node:test";
import assert from "node:assert/strict";
// forms.ts (used by the drill-down helpers) imports the Firebase client, which only needs placeholder public config here.
for (const name of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"]) process.env[`NEXT_PUBLIC_FIREBASE_${name}`] ??= "test";
const { buildDistributionData, DISTRIBUTION_KEYS } = await import("../src/lib/dashboard-distributions.ts");
const { DEFAULT_DRILL_STATE, drillOptions, filterDrillRows, paginate, periodLabel, recordsForSelection, sortDrillRows, toDrillRow } = await import("../src/lib/dashboard-drilldown.ts");
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
      const { records: drilled } = recordsForSelection({ chart: key, category: bar.name }, { totalRecords: records, filtered: records }, fields);
      assert.equal(drilled.length, bar.total, `${key}/${bar.name}`);
      assert.equal(new Set(drilled.map((item) => item.id)).size, drilled.length);
    }
  }
});

test("source drill-down counts association once per record and keeps multi-source records in each column", () => {
  const drill = (category: string) => recordsForSelection({ chart: "fonteDados", category }, { totalRecords: records, filtered: records }, fields).records.map((item) => item.id);
  assert.equal(drill("IOT").length, 2);
  assert.equal(drill("RDO").length, 2);
  assert.deepEqual(drill("Manual"), []);
});

test("status and period drill-downs use the same scope as their charts", () => {
  const scope = { totalRecords: records.slice(0, 3), filtered: records };
  assert.equal(recordsForSelection({ chart: "status", category: "Em Andamento" }, scope, fields).records.length, 1);
  assert.equal(recordsForSelection({ chart: "status", category: "Em Análise" }, scope, fields).base.length, 4);
  assert.equal(periodLabel(records[0], fields), "1/9");
  assert.equal(recordsForSelection({ chart: "periodo", category: "1/9" }, scope, fields).records.length, 2);
  assert.equal(recordsForSelection({ chart: "periodo", category: "N/D" }, { totalRecords: records, filtered: records }, fields).records.length, 1);
});

test("panel filters combine, search ignores accents and case, and unknown values never match", () => {
  const rows = records.map((record) => toDrillRow(record, fields));
  const state = (patch: object) => ({ ...DEFAULT_DRILL_STATE, ...patch });
  assert.equal(filterDrillRows(rows, state({ search: "BOMBA" })).length, 2);
  assert.equal(filterDrillRows(rows, state({ search: "bomba", author: "Bia" })).length, 1);
  assert.equal(filterDrillRows(rows, state({ instalacao: "I1", status: "pendente" })).length, 3);
  assert.equal(filterDrillRows(rows, state({ source: "RDO" })).length, 2);
  assert.equal(filterDrillRows(rows, state({ dateFrom: "2026-09-02" })).length, 1);
  assert.equal(filterDrillRows(rows, state({ dateTo: "2026-09-01" })).length, 2);
  assert.equal(filterDrillRows(rows, state({ search: "inexistente" })).length, 0);
});

test("sorting is stable, numeric-aware and sends empty values last in both directions", () => {
  const rows = records.map((record) => toDrillRow(record, fields));
  assert.deepEqual(sortDrillRows(rows, "number", "desc").map((row) => row.number), ["004/2026", "003/2026", "002/2026", "001/2026"].map((n) => n.replace(/^0*(\d+)/, (_, d) => d.padStart(3, "0"))));
  for (const dir of ["asc", "desc"] as const) assert.equal(sortDrillRows(rows, "gerencia", dir).at(-1)?.gerencia, "");
  assert.deepEqual(sortDrillRows(rows, "flowDate", "asc").map((row) => row.flowDate).slice(0, 3), ["2026-09-01", "2026-09-01", "2026-09-02"]);
});

test("pagination clamps the page and options are derived from the drilled rows only", () => {
  const items = Array.from({ length: 23 }, (_, index) => index);
  assert.deepEqual(paginate(items, 3, 10), { page: 3, pages: 3, items: [20, 21, 22] });
  assert.equal(paginate(items, 99, 10).page, 3);
  assert.deepEqual(paginate([], 1, 10), { page: 1, pages: 1, items: [] });
  const options = drillOptions(records.map((record) => toDrillRow(record, fields)));
  assert.deepEqual(options.instalacoes, ["I1", "I2"]);
  assert.deepEqual(options.authors, ["Ana", "Bia"]);
  assert.deepEqual(options.sources, ["IOT", "RDO"]);
});
