import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableYears,
  buildKpis,
  buildMonthlyEmissions,
  filterEmittedTable,
  EMPTY_TABLE_FILTERS,
  monthlyVariation,
  selectItems,
  toEmittedItems,
} from "../src/lib/emitted-equipment.ts";
import type { AppRecord } from "../src/types/index.ts";

let n = 0;
const rec = (date: string, extra: Partial<AppRecord> = {}, data: Record<string, unknown> = {}): AppRecord => ({
  id: `r${++n}`, authorId: "u", authorName: "Ana", status: "pendente", recordNumber: `${n}/2025`, data: { equipamento: `EQ${n}`, ...data }, ...extra, createdAt: date,
});
const dateOf = (r: AppRecord) => r.createdAt ?? "";
const NOW = new Date(2025, 4, 15); // maio/2025

test("exclui rascunhos, reprovados e removidos; mantém demais status", () => {
  const records = [
    rec("2025-01-10"), rec("2025-01-11", { status: "rascunho" }), rec("2025-01-12", { status: "rejeitado" }),
    rec("2025-01-13", { deletedAt: "2025-02-01" }), rec("2025-01-14", { status: "concluido" }), rec("2025-01-15", { status: "reajuste" }),
  ];
  assert.equal(toEmittedItems(records, dateOf).length, 3);
});

test("ignora registros sem data resolvível", () => {
  assert.equal(toEmittedItems([rec("")], dateOf).length, 0);
});

test("série mensal tem sempre 12 meses, com zeros e sem misturar anos", () => {
  const items = toEmittedItems([rec("2025-01-31"), rec("2025-01-01"), rec("2025-03-05"), rec("2024-03-05")], dateOf);
  const monthly = buildMonthlyEmissions(items, 2025);
  assert.equal(monthly.length, 12);
  assert.deepEqual(monthly.map((m) => m.total), [2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(monthly.reduce((s, m) => s + m.total, 0), selectItems(items, 2025, 0).length);
  assert.equal(buildMonthlyEmissions(items, 2023).every((m) => m.total === 0), true);
});

test("anos disponíveis incluem o atual mesmo sem registros, em ordem decrescente", () => {
  const items = toEmittedItems([rec("2023-05-05"), rec("2024-05-05")], dateOf);
  assert.deepEqual(availableYears(items, 2025), [2025, 2024, 2023]);
});

test("variação: percentual, divisão por zero e virada de ano", () => {
  assert.deepEqual(monthlyVariation(25, 20), { kind: "percent", percent: 25, current: 25, previous: 20 });
  assert.equal(monthlyVariation(10, 20).percent, -50);
  assert.equal(monthlyVariation(5, 0).kind, "new");
  assert.equal(monthlyVariation(0, 0).kind, "none");
  const items = toEmittedItems([rec("2024-12-20"), rec("2024-12-21"), rec("2025-01-02")], dateOf);
  assert.equal(buildKpis(items, 2025, 0, new Date(2025, 0, 10)).variation.percent, -50);
});

test("KPIs concordam com gráfico e tabela para o mesmo período", () => {
  const items = toEmittedItems([rec("2025-05-01"), rec("2025-05-20"), rec("2025-04-02"), rec("2024-05-02")], dateOf);
  const k = buildKpis(items, 2025, 5, NOW);
  assert.equal(k.totalSelected, 2);
  assert.equal(k.currentMonth, 2);
  assert.equal(k.selectedYear, 3);
  assert.equal(k.totalSelected, buildMonthlyEmissions(items, 2025)[4].total);
  assert.equal(filterEmittedTable(selectItems(items, 2025, 5), EMPTY_TABLE_FILTERS, "desc").length, k.totalSelected);
  assert.equal(buildKpis(items, 2025, 0, NOW).totalSelected, k.selectedYear);
});

test("mesmo equipamento em dois fluxos conta 2 eventos e 1 equipamento distinto", () => {
  const items = toEmittedItems([rec("2025-05-01", {}, { equipamento: "Bomba 1" }), rec("2025-05-09", {}, { equipamento: "bomba 1" })], dateOf);
  const k = buildKpis(items, 2025, 5, NOW);
  assert.equal(k.totalSelected, 2);
  assert.equal(k.distinctEquipment, 1);
});

test("tabela: busca sem acento/caixa, filtros e ordenação por data", () => {
  const items = toEmittedItems([
    rec("2025-05-01", {}, { equipamento: "Válvula A", instalacao: "I1" }),
    rec("2025-05-09", {}, { equipamento: "Bomba B", instalacao: "I2" }),
  ], dateOf);
  assert.equal(filterEmittedTable(items, { ...EMPTY_TABLE_FILTERS, search: "valvula" }, "desc").length, 1);
  assert.equal(filterEmittedTable(items, { ...EMPTY_TABLE_FILTERS, instalacao: "I2" }, "desc").length, 1);
  assert.equal(filterEmittedTable(items, EMPTY_TABLE_FILTERS, "desc")[0].dateKey, "2025-05-09");
  assert.equal(filterEmittedTable(items, EMPTY_TABLE_FILTERS, "asc")[0].dateKey, "2025-05-01");
});
