"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { HISTORY_FILTER_SELECT_CLASS, HistoryDateRange, HistoryFilterField, HistorySearchInput } from "@/components/records/history-filter-parts";
import { type DetailDimension } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

export interface DetailFilterField {
  dim: DetailDimension;
  label: string;
  /** ALL ("todos") when the dimension is not filtered. */
  value: string;
  options: string[];
  labels?: Record<string, string>;
  /** Fixed by the selection that originated the analysis; can only change by going back to the dashboard. */
  locked: boolean;
}

/** Same search box, selects and "Período" block as the flows table page, shared through history-filter-parts. */
export function DetailFilterBar({
  search, onSearch, fields, onSelect, dateFrom, dateTo, onDates, onClear, canClear,
}: {
  search: string;
  onSearch: (value: string) => void;
  fields: DetailFilterField[];
  onSelect: (dim: DetailDimension, value: string) => void;
  dateFrom: string;
  dateTo: string;
  onDates: (from: string, to: string) => void;
  onClear: () => void;
  canClear: boolean;
}) {
  return (
    <section aria-label="Filtros da análise" className="flex flex-col gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-5">
      <HistorySearchInput value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar por número, descrição..." aria-label="Buscar fluxos" className="flex-none" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-x-4 gap-y-4">
        {fields.map((field) => (
          <HistoryFilterField key={field.dim} label={field.label}>
            <FilterSelect
              label={field.label}
              includeLabelInAllOption={false}
              className={cn(HISTORY_FILTER_SELECT_CLASS, field.locked && "bg-muted/50")}
              value={field.value}
              onChange={(value) => onSelect(field.dim, value)}
              options={field.options}
              labels={field.labels}
              disabled={field.locked}
              hideAll={field.locked}
              title={field.locked ? "Fixado pela seleção que originou esta análise. Volte ao dashboard para escolher outra." : undefined}
            />
          </HistoryFilterField>
        ))}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <HistoryDateRange idPrefix="detail" from={dateFrom} to={dateTo} onFromChange={(value) => onDates(value, dateTo)} onToChange={(value) => onDates(dateFrom, value)} />
        <Button type="button" variant="outline" onClick={onClear} disabled={!canClear} className="h-11 w-full rounded-xl border-[#E2E8F0] bg-white px-4 text-[#243247] shadow-none hover:bg-[#F6F8FA] lg:w-auto">
          <RotateCcw className="h-4 w-4 text-[#64748B]" />
          Limpar Filtros
        </Button>
      </div>
    </section>
  );
}


