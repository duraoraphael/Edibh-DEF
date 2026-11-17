import type { AppRecord, FormField } from "@/types";
import { fieldValue, recordDateKey } from "@/lib/forms";
import { ALL, type GlobalFilters } from "@/lib/dashboard-nav";

/** Non-time dashboard filters. The emitted-equipment section shares this scope but owns its own period selectors. */
export function scopeRecords(submitted: AppRecord[], g: GlobalFilters): AppRecord[] {
  let list = submitted;
  if (g.gerencia !== ALL) list = list.filter((r) => fieldValue(r, "gerencia") === g.gerencia);
  if (g.instalacao !== ALL) list = list.filter((r) => fieldValue(r, "instalacao") === g.instalacao);
  if (g.sistema !== ALL) list = list.filter((r) => fieldValue(r, "sistema") === g.sistema);
  if (g.equipamento !== ALL) list = list.filter((r) => fieldValue(r, "equipamento") === g.equipamento);
  if (g.responsavel !== ALL) list = list.filter((r) => r.authorName === g.responsavel);
  if (g.status !== ALL) list = list.filter((r) => r.status === g.status);
  return list;
}

/** Year / month / date-range filters applied on top of {@link scopeRecords}. */
export function filterByPeriod(scoped: AppRecord[], g: GlobalFilters, fields: FormField[]): AppRecord[] {
  let list = scoped;
  if (g.ano !== ALL) list = list.filter((r) => recordDateKey(r, fields).slice(0, 4) === g.ano);
  if (g.mes !== ALL) list = list.filter((r) => recordDateKey(r, fields).slice(5, 7) === g.mes.padStart(2, "0"));
  if (g.dateFrom || g.dateTo) {
    list = list.filter((r) => {
      const date = recordDateKey(r, fields);
      return !!date && (!g.dateFrom || date >= g.dateFrom) && (!g.dateTo || date <= g.dateTo);
    });
  }
  return list;
}
