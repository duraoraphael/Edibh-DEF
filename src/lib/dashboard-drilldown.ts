import type { AppRecord, FormField, RecordStatus } from "@/types";
import { fieldValue, recordDateKey, statusLabels } from "@/lib/forms";
import { compareRecordNumbers } from "@/lib/record-number";
import { formatRecordDataSource } from "@/lib/data-source";
import { recordDistributionNames } from "@/lib/dashboard-distributions";

/** Day label used by the "Evolução de registros" chart (d/m, "N/D" when the flow has no date). */
export function periodLabel(record: AppRecord, fields: FormField[]): string {
  const [, month, day] = recordDateKey(record, fields).split("-");
  return month && day ? `${Number(day)}/${Number(month)}` : "N/D";
}

/** One flow as shown in the detail table: every column already resolved from the real record fields. */
export interface DrillRow {
  record: AppRecord;
  number: string;
  instalacao: string;
  sistema: string;
  sistemaMacro: string;
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
    sistemaMacro: recordDistributionNames(record, "sistemaMacro", fields)[0].replace("N/D", ""),
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

export type DrillSortKey = "number" | "instalacao" | "sistema" | "sistemaMacro" | "equipamento" | "gerencia" | "flowDate" | "status" | "author" | "source" | "updatedAt";

export const DRILL_PAGE_SIZES = [10, 25, 50, 100] as const;

function plain(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Free-text search (accent/case-insensitive) and flow-date range; the other filters work on records. */
export function filterDrillRows(rows: DrillRow[], criteria: { search: string; dateFrom: string; dateTo: string }): DrillRow[] {
  const term = plain(criteria.search.trim());
  const { dateFrom, dateTo } = criteria;
  return rows.filter((row) => {
    if ((dateFrom || dateTo) && (!row.flowDate || (dateFrom && row.flowDate < dateFrom) || (dateTo && row.flowDate > dateTo))) return false;
    if (!term) return true;
    return plain([row.number, row.record.description ?? "", row.equipamento, row.instalacao, row.sistema, row.sistemaMacro, row.gerencia, row.author, row.source].join(" ")).includes(term);
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

/** Flow detail page; `returnTo` is where its "close" button sends the user back to. */
export function recordDetailHref(recordId: string, returnTo = "/dashboard") {
  return `/records?${new URLSearchParams({ record: recordId, returnTo }).toString()}`;
}
