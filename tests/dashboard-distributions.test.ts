import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDistributionData, distributionScale, formatDistributionPercentage, normalizeDistributionSource } from "../src/lib/dashboard-distributions.ts";
import type { AppRecord, FormField } from "../src/types/index.ts";

const record = (data: Record<string, unknown>, authorName = "Ana"): AppRecord => ({ id: "test", authorId: "test", authorName, status: "pendente", data });
const sourceField: FormField = { id: "source", key: "fonte_de_dados_123", label: "Fonte de Dados", type: "multipla_escolha", required: false, order: 0, options: ["RDO", "SUPERVISORIO-IOT", "SUPERVISÓRIO-IOT", "Manual"] };

test("keeps every category, sorts descending and uses the full filtered count", () => {
  const records = Array.from({ length: 12 }, (_, index) => record({ gerencia: `G${index}` }));
  records.push(record({ gerencia: "G1" }));
  const data = buildDistributionData(records, "gerencia");
  assert.equal(data.length, 12);
  assert.deepEqual(data[0], { name: "G1", total: 2, percentage: 2 / 13 * 100 });
  assert.equal(data.reduce((sum, item) => sum + item.total, 0), records.length);
});

test("reads the six dimensions, including a custom macro field key", () => {
  const records = [record({ gerencia: "G", instalacao: "I", sistema: "S", custom_macro: "M", fonte_de_dados_123: "RDO" })];
  const fields: FormField[] = [sourceField, { ...sourceField, id: "macro", key: "custom_macro", label: "Sistema Macro" }];
  for (const [key, expected] of [["gerencia", "G"], ["instalacao", "I"], ["sistema", "S"], ["sistemaMacro", "M"], ["responsavel", "Ana"], ["fonteDados", "RDO-INSTALAÇÃO"]] as const) {
    assert.deepEqual(buildDistributionData(records, key, fields)[0], { name: expected, total: 1, percentage: 100 });
  }
});

test("source aliases merge before counting and cannot double count one record", () => {
  const records = [record({ fonte_de_dados_123: ["SUPERVISORIO-IOT", "SUPERVISÓRIO-IOT", "RDO"] }), record({ fonte_de_dados_123: " supervisório - iot " }), record({})];
  const data = buildDistributionData(records, "fonteDados", [sourceField]);
  assert.deepEqual(data.map(({ name, total }) => ({ name, total })), [{ name: "IOT", total: 2 }, { name: "RDO-INSTALAÇÃO", total: 1 }, { name: "Manual", total: 0 }]);
  assert.equal(data[0].percentage, 2 / 3 * 100);
  assert.equal(normalizeDistributionSource("rdo instalação"), "RDO-INSTALAÇÃO");
});

test("multi-selection percentages use record count, not the sum of selections", () => {
  const data = buildDistributionData([record({ fonteDados: ["IOT", "RDO"] }), record({ fonteDados: "RDO" })], "fonteDados");
  assert.equal(data[0].percentage, 100);
  assert.equal(data[1].percentage, 50);
});

test("filtering recalculates categories, totals, percentages and scale", () => {
  const records = Array.from({ length: 151 }, (_, index) => record({ gerencia: index ? "A" : "B", sistema_macro: "Macro" }));
  const all = buildDistributionData(records, "gerencia");
  const filtered = buildDistributionData(records.filter((item) => item.data?.gerencia === "B"), "gerencia");
  assert.deepEqual(filtered, [{ name: "B", total: 1, percentage: 100 }]);
  assert.ok(distributionScale(all).ceiling > 150);
  assert.ok(distributionScale(filtered).ceiling < distributionScale(all).ceiling);
  assert.equal(buildDistributionData(records, "sistemaMacro")[0].name, "Macro");
});

test("empty, missing and zero-count data remain safe", () => {
  assert.deepEqual(buildDistributionData([], "fonteDados", [sourceField]), []);
  assert.equal(buildDistributionData([record({})], "sistemaMacro")[0].name, "N/D");
  assert.deepEqual(distributionScale([]), { ceiling: 1, ticks: [0, 1] });
  assert.equal(formatDistributionPercentage(0), "0,0%");
  assert.equal(formatDistributionPercentage(59 / 341 * 100), "17,3%");
  for (const total of [1, 2, 59, 150, 10000]) {
    const scale = distributionScale([{ name: "A", total, percentage: 100 }]);
    assert.ok(scale.ceiling > total);
    assert.ok(scale.ticks.every(Number.isInteger));
  }
});
