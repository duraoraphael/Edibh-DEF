import type { AppRecord, FormField, RecordStatus } from "@/types";
import { fieldValue, recordDateKey, statusLabels } from "@/lib/forms";
import { compareRecordNumbers } from "@/lib/record-number";
import { formatRecordDataSource } from "@/lib/data-source";
import { recordsForDistribution, type DistributionKey } from "@/lib/dashboard-distributions";

/** Charts that support drill-down: the two fixed charts plus every distribution dimension. */
export type DrillChartId = "periodo" | "status" | DistributionKey;

export interface DrillSelection {
  chart: DrillChartId;
  category: string;
}

/** Day label used by the "Evolução de registros" chart (d/m, "N/D" when the flow has no date). */
export function periodLabel(record: AppRecord, fields: FormField[]): string {
  const [, month, day] = recordDateKey(record, fields).split("-");
  return month && day ? `${Number(day)}/${Number(month)}` : "N/D";
}

/**
 * Records behind one chart category. The caller passes the same lists the charts aggregate
 * (`totalRecords` for period and distributions, `filtered` for status), so counts always match.
 */
export function recordsForSelection(
  selection: DrillSelection,
  scope: { totalRecords: AppRecord[]; filtered: AppRecord[] },
  fields: FormField[],
): { records: AppRecord[]; base: AppRecord[] } {
  if (selection.chart === "status") {
    return { base: scope.filtered, records: scope.filtered.filter((record) => (statusLabels[record.status] ?? record.status) === selection.category) };
  }
  if (selection.chart === "periodo") {
    return { base: scope.totalRecords, records: scope.totalRecords.filter((record) => periodLabel(record, fields) === selection.category) };
  }
  return { base: scope.totalRecords, records: recordsForDistribution(scope.totalRecords, selection.chart, selection.category, fields) };
}

export interface DrillRow {
  record: AppRecord;
  number: string;
  instalacao: string;
  sistema: string;
  equipamento: string;
  gerencia: string;
  flowDate: string;
  source: string;
  status: RecordStatus;
  statusLabel: string;
  author: string;
  updatedAt: string;
}

export function toDrillRow(record: AppRecord, fields: FormField[]): DrillRow {
  return {
    record,
    number: record.recordNumber || "",
    instalacao: fieldValue(record, "instalacao"),
    sistema: fieldValue(record, "sistema"),
    equipamento: fieldValue(record, "equipamento") || record.description || "",
    gerencia: fieldValue(record, "gerencia"),
    flowDate: recordDateKey(record, fields),
    source: formatRecordDataSource(record, fields),
    status: record.status,
    statusLabel: statusLabels[record.status] ?? record.status,
    author: record.authorName || "",
    updatedAt: record.updatedAt || record.createdAt || "",
  };
}

export type DrillSortKey = "number" | "instalacao" | "sistema" | "equipamento" | "gerencia" | "flowDate" | "status" | "author" | "source" | "updatedAt";

export interface DrillPanelState {
  search: string;
  source: string;
  instalacao: string;
  status: string;
  author: string;
  dateFrom: string;
  dateTo: string;
  sortKey: DrillSortKey;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export const DRILL_ALL = "todos";
export const DRILL_PAGE_SIZES = [10, 25, 50, 100] as const;

export const DEFAULT_DRILL_STATE: DrillPanelState = {
  search: "", source: DRILL_ALL, instalacao: DRILL_ALL, status: DRILL_ALL, author: DRILL_ALL,
  dateFrom: "", dateTo: "", sortKey: "number", sortDir: "asc", page: 1, pageSize: 10,
};

function plain(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** True when any panel-level filter (not sorting/paging) differs from its default. */
export function hasDrillFilters(state: DrillPanelState): boolean {
  return !!state.search.trim() || !!state.dateFrom || !!state.dateTo
    || [state.source, state.instalacao, state.status, state.author].some((value) => value !== DRILL_ALL);
}

export function filterDrillRows(rows: DrillRow[], state: DrillPanelState): DrillRow[] {
  const term = plain(state.search.trim());
  return rows.filter((row) => {
    if (state.status !== DRILL_ALL && row.status !== state.status) return false;
    if (state.instalacao !== DRILL_ALL && row.instalacao !== state.instalacao) return false;
    if (state.author !== DRILL_ALL && row.author !== state.author) return false;
    if (state.source !== DRILL_ALL && !row.source.split(", ").includes(state.source)) return false;
    if ((state.dateFrom || state.dateTo) && (!row.flowDate || (state.dateFrom && row.flowDate < state.dateFrom) || (state.dateTo && row.flowDate > state.dateTo))) return false;
    if (!term) return true;
    return plain([row.number, row.record.description ?? "", row.equipamento, row.instalacao, row.sistema, row.gerencia, row.author, row.source].join(" ")).includes(term);
  });
}

export function sortDrillRows(rows: DrillRow[], key: DrillSortKey, dir: "asc" | "desc"): DrillRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    // Empty values always sink to the bottom regardless of direction.
    const left = key === "status" ? a.statusLabel : a[key];
    const right = key === "status" ? b.statusLabel : b[key];
    if (!left !== !right) return left ? -1 : 1;
    const result = key === "number" ? compareRecordNumbers(a.number, b.number) : left.localeCompare(right, "pt-BR", { numeric: true });
    return sign * result || compareRecordNumbers(a.number, b.number) || a.record.id.localeCompare(b.record.id);
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return { page: current, pages, items: items.slice((current - 1) * pageSize, current * pageSize) };
}

/** Distinct, sorted option lists for the panel's selects, derived only from the drilled rows. */
export function drillOptions(rows: DrillRow[]) {
  const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return {
    instalacoes: unique(rows.map((row) => row.instalacao)),
    authors: unique(rows.map((row) => row.author)),
    sources: unique(rows.flatMap((row) => row.source.split(", ")).filter((name) => name !== "Não informado")),
    statuses: unique(rows.map((row) => row.status)) as RecordStatus[],
  };
}

export const DRILL_RETURN_KEY = "dashboard-drilldown-return";

/** Where the record detail page sends the user back to. */
export function recordDetailHref(recordId: string) {
  return `/records?${new URLSearchParams({ record: recordId, returnTo: "/dashboard" }).toString()}`;
}
