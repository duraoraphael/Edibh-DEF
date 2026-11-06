import type { AppRecord } from "@/types";

/**
 * Regra de contabilização de "equipamentos emitidos" (documentada em docs/emitted-equipment.md):
 *
 *  - Cada registro (fluxo) enviado é UM evento de emissão. Conta-se EVENTOS, não equipamentos únicos:
 *    o mesmo equipamento pode ter vários fluxos e cada um é contado uma vez.
 *  - Fora da contagem: rascunhos (nunca emitidos), reprovados (mesma regra do card "Total" existente)
 *    e removidos (deletedAt).
 *  - Data da emissão = campo "data" do formulário (recordDateKey), com createdAt apenas como
 *    fallback legado. É uma data de calendário (AAAA-MM-DD), portanto sem deslocamento de fuso.
 */
export function isEmittedRecord(record: AppRecord): boolean {
  return record.status !== "rascunho" && record.status !== "rejeitado" && !record.deletedAt;
}

export interface EmittedItem {
  record: AppRecord;
  /** AAAA-MM-DD */
  dateKey: string;
  year: number;
  /** 1-12 */
  month: number;
}

/** `resolveDateKey` is `recordDateKey(record, formFields)` from forms.ts (injected to keep this module Firebase-free). */
export function toEmittedItems(records: AppRecord[], resolveDateKey: (record: AppRecord) => string): EmittedItem[] {
  const items: EmittedItem[] = [];
  for (const record of records) {
    if (!isEmittedRecord(record)) continue;
    const dateKey = resolveDateKey(record);
    if (!dateKey) continue;
    items.push({ record, dateKey, year: Number(dateKey.slice(0, 4)), month: Number(dateKey.slice(5, 7)) });
  }
  return items;
}

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
export const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function availableYears(items: EmittedItem[], currentYear: number): number[] {
  const years = new Set(items.map((item) => item.year));
  years.add(currentYear);
  return [...years].sort((a, b) => b - a);
}

export interface MonthlyBucket {
  month: number;
  name: string;
  short: string;
  total: number;
}

/** Always 12 buckets; months without emissions stay in the series with total 0. */
export function buildMonthlyEmissions(items: EmittedItem[], year: number): MonthlyBucket[] {
  const totals = new Array<number>(12).fill(0);
  for (const item of items) if (item.year === year) totals[item.month - 1] += 1;
  return totals.map((total, index) => ({ month: index + 1, name: MONTH_NAMES[index], short: MONTH_SHORT[index], total }));
}

export function countInMonth(items: EmittedItem[], year: number, month: number): number {
  return items.reduce((sum, item) => sum + (item.year === year && item.month === month ? 1 : 0), 0);
}

export interface MonthlyVariation {
  kind: "percent" | "new" | "none";
  /** Present only when kind === "percent". */
  percent?: number;
  current: number;
  previous: number;
}

/** Percent change vs previous month; never divides by zero. */
export function monthlyVariation(current: number, previous: number): MonthlyVariation {
  if (previous === 0) return { kind: current === 0 ? "none" : "new", current, previous };
  return { kind: "percent", percent: Math.round(((current - previous) / previous) * 1000) / 10, current, previous };
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export interface EmittedKpis {
  /** Within selected year + month (month 0 = all months). */
  totalSelected: number;
  distinctEquipment: number;
  /** Real calendar month right now. */
  currentMonth: number;
  /** Whole selected year, regardless of month selection. */
  selectedYear: number;
  variation: MonthlyVariation;
}

export function selectItems(items: EmittedItem[], year: number, month: number): EmittedItem[] {
  return items.filter((item) => item.year === year && (month === 0 || item.month === month));
}

export function buildKpis(items: EmittedItem[], year: number, month: number, now: Date): EmittedKpis {
  const selected = selectItems(items, year, month);
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const prev = previousMonth(nowYear, nowMonth);
  const equipment = new Set(selected.map((item) => equipmentName(item.record).toLocaleLowerCase("pt-BR")).filter(Boolean));
  return {
    totalSelected: selected.length,
    distinctEquipment: equipment.size,
    currentMonth: countInMonth(items, nowYear, nowMonth),
    selectedYear: items.reduce((sum, item) => sum + (item.year === year ? 1 : 0), 0),
    variation: monthlyVariation(countInMonth(items, nowYear, nowMonth), countInMonth(items, prev.year, prev.month)),
  };
}

function textField(record: AppRecord, key: string): string {
  const v = record.data?.[key];
  if (v === undefined || v === null || v === "") return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
}

export const equipmentName = (record: AppRecord) => textField(record, "equipamento");

export type EmittedSortDir = "asc" | "desc";

export interface EmittedTableFilters {
  search: string;
  instalacao: string;
  sistema: string;
  gerencia: string;
  tipo: string;
  status: string;
}

export const EMPTY_TABLE_FILTERS: EmittedTableFilters = { search: "", instalacao: "", sistema: "", gerencia: "", tipo: "", status: "" };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
}

export function filterEmittedTable(items: EmittedItem[], filters: EmittedTableFilters, dir: EmittedSortDir): EmittedItem[] {
  const term = normalize(filters.search.trim());
  const list = items.filter(({ record }) => {
    if (filters.instalacao && textField(record, "instalacao") !== filters.instalacao) return false;
    if (filters.sistema && textField(record, "sistema") !== filters.sistema) return false;
    if (filters.gerencia && textField(record, "gerencia") !== filters.gerencia) return false;
    if (filters.tipo && textField(record, "tipo_equipamento") !== filters.tipo) return false;
    if (filters.status && record.status !== filters.status) return false;
    if (!term) return true;
    return normalize([record.recordNumber, record.id, textField(record, "equipamento"), textField(record, "tipo_equipamento"), record.authorName].filter(Boolean).join(" ")).includes(term);
  });
  const sign = dir === "asc" ? 1 : -1;
  return list.sort((a, b) => sign * (a.dateKey.localeCompare(b.dateKey) || (a.record.recordNumber ?? "").localeCompare(b.record.recordNumber ?? "")));
}

export function distinctValues(items: EmittedItem[], key: string): string[] {
  return [...new Set(items.map(({ record }) => textField(record, key)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export const fieldText = textField;
