"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { logsCol } from "@/lib/firestore-helpers";
import { recordNumberSortValue, roleLabels, statusLabels } from "@/lib/forms";
import type { LogEntry, UserRole } from "@/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterSelect } from "@/components/ui/filter-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL = "todos";
const PAGE_SIZE = 15;

function paginationItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", total];
  if (current >= total - 3) return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

function statusText(value?: string): string {
  if (!value) return "—";
  return statusLabels[value as keyof typeof statusLabels] || value;
}

function roleText(value?: string): string {
  if (!value) return "—";
  return roleLabels[value as UserRole] || value;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState(ALL);
  const [actionFilter, setActionFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [recordNumberFilter, setRecordNumberFilter] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const unsub = onSnapshot(
      query(logsCol(), orderBy("createdAt", "desc")),
      (snap) => {
        setLogs(snap.docs.map((d) => d.data()));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const actors = useMemo(
    () => Array.from(new Set(logs.map((l) => l.actorName).filter(Boolean))).sort() as string[],
    [logs]
  );
  const actions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action).filter(Boolean))).sort() as string[],
    [logs]
  );
  const recordNumbers = useMemo(
    () =>
      (Array.from(new Set(logs.map((l) => l.recordNumber).filter(Boolean))) as string[]).sort((a, b) =>
        recordNumberSortValue(a).localeCompare(recordNumberSortValue(b))
      ),
    [logs]
  );
  const statuses = useMemo(
    () =>
      Array.from(
        new Set(
          logs.flatMap((l) => [l.statusBefore, l.statusAfter]).filter((s) => !!s && s !== "")
        )
      ).sort() as string[],
    [logs]
  );

  const filtered = useMemo(() => {
    let list = logs;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((l) =>
        [
          l.actorName,
          roleText(l.actorRole),
          l.action,
          l.recordNumber,
          l.recordId,
          statusText(l.statusBefore),
          statusText(l.statusAfter),
          l.detail,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s))
      );
    }
    if (actorFilter !== ALL) list = list.filter((l) => l.actorName === actorFilter);
    if (actionFilter !== ALL) list = list.filter((l) => l.action === actionFilter);
    if (recordNumberFilter !== ALL) list = list.filter((l) => l.recordNumber === recordNumberFilter);
    if (statusFilter !== ALL)
      list = list.filter((l) => l.statusBefore === statusFilter || l.statusAfter === statusFilter);
    if (dateFrom) list = list.filter((l) => l.createdAt && l.createdAt >= dateFrom);
    if (dateTo) list = list.filter((l) => l.createdAt && l.createdAt <= dateTo + "T23:59:59");
    return list;
  }, [logs, search, actorFilter, actionFilter, recordNumberFilter, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const firstVisibleItem = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastVisibleItem = Math.min(page * PAGE_SIZE, filtered.length);

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function clearFilters() {
    setSearch("");
    setActorFilter(ALL);
    setActionFilter(ALL);
    setStatusFilter(ALL);
    setRecordNumberFilter(ALL);
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const hasActiveFilters = Boolean(
    search || actorFilter !== ALL || actionFilter !== ALL || statusFilter !== ALL ||
    recordNumberFilter !== ALL || dateFrom || dateTo
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Log de Auditoria</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Histórico completo e imutável de todas as ações realizadas no sistema
        </p>
      </header>

      <Card className="overflow-hidden bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:bg-card">
        <div className="flex flex-col gap-4 border-b border-border px-4 py-5 sm:px-5 lg:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 bg-background pl-10"
              placeholder="Pesquisar por usuário, ação, número do fluxo, documento, status ou observação..."
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_auto]">
            <FilterSelect label="Usuário" value={actorFilter} onChange={resetPage(setActorFilter)}>
              {actors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </FilterSelect>
            <FilterSelect label="Tipo de ação" value={actionFilter} onChange={resetPage(setActionFilter)}>
              {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </FilterSelect>
            <FilterSelect label="Nº do fluxo" value={recordNumberFilter} onChange={resetPage(setRecordNumberFilter)}>
              {recordNumbers.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </FilterSelect>
            <FilterSelect label="Status" value={statusFilter} onChange={resetPage(setStatusFilter)}>
              {statuses.map((s) => <SelectItem key={s} value={s}>{statusText(s)}</SelectItem>)}
            </FilterSelect>
            <Input type="date" value={dateFrom} onChange={(e) => resetPage(setDateFrom)(e.target.value)} title="Data inicial" aria-label="Data inicial" />
            <Input type="date" value={dateTo} onChange={(e) => resetPage(setDateTo)(e.target.value)} title="Data final" aria-label="Data final" />
            <Button variant="ghost" className="px-3 text-muted-foreground" onClick={clearFilters} disabled={!hasActiveFilters}>
              <X className="h-4 w-4" />
              Limpar filtros
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum registro de auditoria encontrado</p>
          </div>
        ) : (
          <Table className="min-w-[1320px]">
            <TableHeader className="bg-muted/35">
              <TableRow>
                <TableHead>Data e hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Nº do fluxo</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Status anterior</TableHead>
                <TableHead>Status novo</TableHead>
                <TableHead>Observações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((l) => (
                <TableRow key={l.id} className="hover:bg-muted/30">
                  <TableCell className="whitespace-nowrap py-4 text-muted-foreground tabular-nums">
                    {l.createdAt ? new Date(l.createdAt).toLocaleString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate py-4 font-medium" title={l.actorName || ""}>{l.actorName || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{roleText(l.actorRole)}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate py-4" title={l.action || ""}>{l.action || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap py-4 font-medium tabular-nums">{l.recordNumber || "—"}</TableCell>
                  <TableCell className="max-w-[140px] truncate" title={l.recordId || ""}>
                    {l.recordId || "—"}
                  </TableCell>
                  <TableCell>{l.statusBefore ? <StatusBadge status={l.statusBefore} /> : "—"}</TableCell>
                  <TableCell>{l.statusAfter ? <StatusBadge status={l.statusAfter} /> : "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={l.detail || ""}>
                    {l.detail || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:px-6">
          <p className="text-sm text-muted-foreground">
            Mostrando <span className="font-medium text-foreground tabular-nums">{firstVisibleItem}</span> a{" "}
            <span className="font-medium text-foreground tabular-nums">{lastVisibleItem}</span> de{" "}
            <span className="font-medium text-foreground tabular-nums">{filtered.length.toLocaleString("pt-BR")}</span> registros
          </p>
          {totalPages > 1 && (
            <nav className="flex items-center gap-1" aria-label="Paginação dos logs de auditoria">
              <Button variant="ghost" size="icon" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Página anterior">
                <ChevronLeft />
              </Button>
              {paginationItems(page, totalPages).map((item, index) => item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="flex h-9 w-8 items-center justify-center text-sm text-muted-foreground">…</span>
              ) : (
                <button key={item} onClick={() => setPage(item)} aria-current={page === item ? "page" : undefined} className={page === item ? "flex h-9 min-w-9 items-center justify-center rounded-md bg-primary px-2 text-sm font-medium text-white" : "flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"}>
                  {item}
                </button>
              ))}
              <Button variant="ghost" size="icon" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} aria-label="Próxima página">
                <ChevronRight />
              </Button>
            </nav>
          )}
        </footer>
      </Card>
    </div>
  );
}
