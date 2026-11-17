"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/forms";
import { DRILL_PAGE_SIZES, paginate, recordDetailHref, sortDrillRows, type DrillRow, type DrillSortKey } from "@/lib/dashboard-drilldown";

const COLUMNS: { key: DrillSortKey; label: string; className?: string }[] = [
  { key: "number", label: "Fluxo" },
  { key: "instalacao", label: "Instalação" },
  { key: "gerencia", label: "Gerência" },
  { key: "sistema", label: "Sistema" },
  { key: "sistemaMacro", label: "Sistema Macro" },
  { key: "equipamento", label: "Equipamento / descrição", className: "min-w-56" },
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

/** Sortable, paginated flow list. Each flow number links to the existing flow detail page. */
export function FlowTable({ rows, returnTo }: { rows: DrillRow[]; returnTo: string }) {
  const [sort, setSort] = useState<{ key: DrillSortKey; dir: "asc" | "desc" }>({ key: "number", dir: "asc" });
  const [paging, setPaging] = useState({ page: 1, size: 10 });
  const [lastRows, setLastRows] = useState(rows);
  if (rows !== lastRows) {
    setLastRows(rows);
    setPaging((p) => ({ ...p, page: 1 }));
  }

  const sorted = sortDrillRows(rows, sort.key, sort.dir);
  const pageData = paginate(sorted, paging.page, paging.size);
  const first = sorted.length ? (pageData.page - 1) * paging.size + 1 : 0;

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto" role="region" aria-label="Lista de fluxos" tabIndex={0}>
        {sorted.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Nenhum fluxo encontrado para os filtros aplicados.</p>
        ) : (
          <Table>
            <TableHeader className="bg-muted/35 text-xs">
              <TableRow>
                {COLUMNS.map((column) => {
                  const active = sort.key === column.key;
                  return (
                    <TableHead key={column.key} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={column.className}>
                      <button
                        type="button"
                        onClick={() => {
                          setSort({ key: column.key, dir: active && sort.dir === "asc" ? "desc" : "asc" });
                          setPaging((p) => ({ ...p, page: 1 }));
                        }}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {column.label}
                        {active ? (sort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.items.map((row) => (
                <TableRow key={row.record.id} data-testid="flow-row" className="cursor-pointer hover:bg-muted/35" onClick={(event) => (event.currentTarget.querySelector("a") as HTMLAnchorElement | null)?.click()}>
                  <TableCell className="font-semibold tabular-nums">
                    <Link href={recordDetailHref(row.record.id, returnTo)} onClick={(event) => event.stopPropagation()} className="text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Abrir fluxo ${row.number || row.record.id}`}>
                      {row.number || "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{row.instalacao || "—"}</TableCell>
                  <TableCell>{row.gerencia || "—"}</TableCell>
                  <TableCell>{row.sistema || "—"}</TableCell>
                  <TableCell>{row.sistemaMacro || "—"}</TableCell>
                  <TableCell className="min-w-56 whitespace-normal leading-relaxed">{row.equipamento || "—"}</TableCell>
                  <TableCell className="max-w-48 whitespace-normal break-words">{row.source}</TableCell>
                  <TableCell>{row.author || "—"}</TableCell>
                  <TableCell className="tabular-nums">{formatCalendarDate(row.flowDate)}</TableCell>
                  <TableCell className="tabular-nums">{formatUpdated(row.updatedAt)}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite" data-testid="flow-summary">
          {sorted.length === 0 ? "0 fluxos" : `${first}–${first + pageData.items.length - 1} de ${sorted.length.toLocaleString("pt-BR")} fluxos`}
        </p>
        <div className="flex items-center gap-2">
          <FilterSelect
            label="Itens por página"
            value={String(paging.size)}
            onChange={(size) => setPaging({ page: 1, size: Number(size) })}
            options={DRILL_PAGE_SIZES.map(String)}
            labels={Object.fromEntries(DRILL_PAGE_SIZES.map((size) => [String(size), `${size} por página`]))}
            hideAll
            className="w-40"
          />
          <Button variant="outline" size="icon" onClick={() => setPaging((p) => ({ ...p, page: pageData.page - 1 }))} disabled={pageData.page <= 1} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm tabular-nums" aria-label="Página atual">{pageData.page} / {pageData.pages}</span>
          <Button variant="outline" size="icon" onClick={() => setPaging((p) => ({ ...p, page: pageData.page + 1 }))} disabled={pageData.page >= pageData.pages} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
