"use client";

import { useMemo } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Filter, Maximize2, Minimize2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterSelect } from "@/components/ui/filter-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { statusLabels, formatCalendarDate } from "@/lib/forms";
import { formatDistributionPercentage } from "@/lib/dashboard-distributions";
import {
  DEFAULT_DRILL_STATE, DRILL_PAGE_SIZES, drillOptions, filterDrillRows, hasDrillFilters, paginate, recordDetailHref, sortDrillRows, toDrillRow,
  type DrillPanelState, type DrillSortKey,
} from "@/lib/dashboard-drilldown";
import type { AppRecord, FormField } from "@/types";
import { cn } from "@/lib/utils";

const COLUMNS: { key: DrillSortKey; label: string; className?: string }[] = [
  { key: "number", label: "Fluxo" },
  { key: "instalacao", label: "Instalação" },
  { key: "sistema", label: "Sistema" },
  { key: "equipamento", label: "Equipamento / descrição", className: "min-w-56" },
  { key: "gerencia", label: "Gerência" },
  { key: "source", label: "Fonte de dados" },
  { key: "author", label: "Responsável" },
  { key: "flowDate", label: "Data do fluxo" },
  { key: "updatedAt", label: "Atualizado em" },
  { key: "status", label: "Status" },
];

function formatUpdated(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? formatCalendarDate(value) : date.toLocaleDateString("pt-BR");
}

export interface DrillDownPanelProps {
  open: boolean;
  chartTitle: string;
  category: string;
  /** Records behind the clicked category, already limited by every dashboard filter. */
  records: AppRecord[];
  /** Denominator used by the chart for the percentage (records in the chart's scope). */
  baseCount: number;
  fields: FormField[];
  /** Human-readable dashboard filters currently narrowing the data. */
  contextFilters: string[];
  /** Extra explanation, e.g. when one flow can belong to several categories. */
  note?: string;
  loading?: boolean;
  error?: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  state: DrillPanelState;
  onStateChange: (state: DrillPanelState) => void;
  /** Called right before navigating to a flow, so the caller can remember where the user was. */
  onOpenRecord: () => void;
  onClose: () => void;
}

export function DrillDownPanel({
  open, chartTitle, category, records, baseCount, fields, contextFilters, note, loading, error,
  expanded, onExpandedChange, state, onStateChange, onOpenRecord, onClose,
}: DrillDownPanelProps) {
  const rows = useMemo(() => records.map((record) => toDrillRow(record, fields)), [records, fields]);
  const options = useMemo(() => drillOptions(rows), [rows]);
  const visible = useMemo(() => sortDrillRows(filterDrillRows(rows, state), state.sortKey, state.sortDir), [rows, state]);
  const pageData = paginate(visible, state.page, state.pageSize);
  const filtersActive = hasDrillFilters(state);
  const set = (patch: Partial<DrillPanelState>) => onStateChange({ ...state, page: 1, ...patch });
  const first = visible.length ? (pageData.page - 1) * state.pageSize + 1 : 0;
  const percentage = baseCount ? rows.length / baseCount * 100 : 0;

  function sortBy(key: DrillSortKey) {
    onStateChange({ ...state, page: 1, sortKey: key, sortDir: state.sortKey === key && state.sortDir === "asc" ? "desc" : "asc" });
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drill-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          data-testid="drilldown-panel"
          className={cn(
            "drill-panel fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-lg focus:outline-none",
            expanded ? "max-w-full" : "sm:max-w-[min(100%,72rem)]",
          )}
        >
          <header className="flex flex-col gap-3 border-b border-border p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={onClose} className="-ml-2 gap-1.5">
                <ArrowLeft className="h-4 w-4" />Voltar ao dashboard
              </Button>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => onExpandedChange(!expanded)} aria-label={expanded ? "Reduzir painel" : "Expandir painel"} aria-pressed={expanded} className="hidden sm:inline-flex">
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Fechar detalhamento"><X className="h-4 w-4" /></Button>
                </DialogPrimitive.Close>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{chartTitle}</p>
              <DialogPrimitive.Title className="mt-1 break-words text-xl font-semibold tracking-tight">{category}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground tabular-nums">
                {loading ? "Carregando fluxos…" : (
                  <><strong className="font-semibold text-foreground">{rows.length.toLocaleString("pt-BR")}</strong> {rows.length === 1 ? "registro" : "registros"} · {formatDistributionPercentage(percentage)} de {baseCount.toLocaleString("pt-BR")} filtrados</>
                )}
              </DialogPrimitive.Description>
            </div>
            {contextFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros do dashboard aplicados">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {contextFilters.map((item) => (
                  <span key={item} className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{item}</span>
                ))}
              </div>
            )}
            {note && <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{note}</p>}
          </header>

          <div className="flex flex-col gap-3 border-b border-border p-4 sm:px-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <div className="relative col-span-2 lg:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={state.search} onChange={(event) => set({ search: event.target.value })} placeholder="Buscar por número, descrição…" aria-label="Buscar fluxos" className="pl-9" />
              </div>
              <FilterSelect label="Fonte de dados" value={state.source} onChange={(source) => set({ source })} options={options.sources} />
              <FilterSelect label="Instalação" value={state.instalacao} onChange={(instalacao) => set({ instalacao })} options={options.instalacoes} />
              <FilterSelect label="Status" value={state.status} onChange={(status) => set({ status })} options={options.statuses} labels={statusLabels} />
              <FilterSelect label="Responsável" value={state.author} onChange={(author) => set({ author })} options={options.authors} />
              <Input type="date" value={state.dateFrom} onChange={(event) => set({ dateFrom: event.target.value })} aria-label="Data do fluxo de" title="Data do fluxo de" />
              <Input type="date" value={state.dateTo} onChange={(event) => set({ dateTo: event.target.value })} aria-label="Data do fluxo até" title="Data do fluxo até" />
              {filtersActive && (
                <Button variant="outline" onClick={() => onStateChange({ ...DEFAULT_DRILL_STATE, sortKey: state.sortKey, sortDir: state.sortDir, pageSize: state.pageSize })} className="col-span-2 lg:col-span-1">
                  <X className="h-4 w-4" />Limpar filtros
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label="Lista de fluxos" tabIndex={0}>
            {error ? (
              <div role="alert" className="flex flex-col items-center gap-2 p-10 text-center">
                <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
                <p className="text-sm font-medium">Não foi possível carregar os fluxos.</p>
                <p className="text-sm text-muted-foreground">Verifique sua conexão ou permissões e tente novamente.</p>
              </div>
            ) : loading ? (
              <div className="flex flex-col gap-2 p-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <p className="text-sm font-medium">{rows.length === 0 ? "Nenhum fluxo encontrado para esta categoria." : "Nenhum fluxo corresponde aos filtros do detalhamento."}</p>
                {filtersActive && <Button variant="outline" size="sm" onClick={() => onStateChange({ ...DEFAULT_DRILL_STATE, sortKey: state.sortKey, sortDir: state.sortDir, pageSize: state.pageSize })}>Limpar filtros</Button>}
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    {COLUMNS.map((column) => {
                      const active = state.sortKey === column.key;
                      return (
                        <TableHead key={column.key} aria-sort={active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"} className={column.className}>
                          <button type="button" onClick={() => sortBy(column.key)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                            {column.label}
                            {active ? (state.sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                          </button>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageData.items.map((row) => {
                    const href = recordDetailHref(row.record.id);
                    return (
                      <TableRow
                        key={row.record.id}
                        data-testid="drilldown-row"
                        className="cursor-pointer hover:bg-muted/35"
                        onClick={(event) => (event.currentTarget.querySelector("a") as HTMLAnchorElement | null)?.click()}
                      >
                        <TableCell className="font-semibold tabular-nums">
                          <Link href={href} onClick={(event) => { event.stopPropagation(); onOpenRecord(); }} className="text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Abrir fluxo ${row.number || row.record.id}`}>
                            {row.number || "—"}
                          </Link>
                        </TableCell>
                        <TableCell>{row.instalacao || "—"}</TableCell>
                        <TableCell>{row.sistema || "—"}</TableCell>
                        <TableCell className="min-w-56 whitespace-normal leading-relaxed">{row.equipamento || "—"}</TableCell>
                        <TableCell>{row.gerencia || "—"}</TableCell>
                        <TableCell className="max-w-48 whitespace-normal break-words">{row.source}</TableCell>
                        <TableCell>{row.author || "—"}</TableCell>
                        <TableCell className="tabular-nums">{formatCalendarDate(row.flowDate)}</TableCell>
                        <TableCell className="tabular-nums">{formatUpdated(row.updatedAt)}</TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <footer className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite" data-testid="drilldown-summary">
              {visible.length === 0 ? "0 fluxos" : `${first}–${first + pageData.items.length - 1} de ${visible.length.toLocaleString("pt-BR")} fluxos`}
              {filtersActive && visible.length !== rows.length && ` (filtrado de ${rows.length.toLocaleString("pt-BR")})`}
            </p>
            <div className="flex items-center gap-2">
              <FilterSelect label="Itens por página" value={String(state.pageSize)} onChange={(size) => onStateChange({ ...state, page: 1, pageSize: Number(size) })} options={DRILL_PAGE_SIZES.map(String)} labels={Object.fromEntries(DRILL_PAGE_SIZES.map((size) => [String(size), `${size} por página`]))} hideAll className="w-40" />
              <Button variant="outline" size="icon" onClick={() => onStateChange({ ...state, page: pageData.page - 1 })} disabled={pageData.page <= 1} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm tabular-nums" aria-label="Página atual">{pageData.page} / {pageData.pages}</span>
              <Button variant="outline" size="icon" onClick={() => onStateChange({ ...state, page: pageData.page + 1 })} disabled={pageData.page >= pageData.pages} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
