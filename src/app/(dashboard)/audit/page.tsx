"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { Search } from "lucide-react";
import { logsCol } from "@/lib/firestore-helpers";
import { roleLabels, statusLabels } from "@/lib/forms";
import type { LogEntry, UserRole } from "@/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL = "todos";
const PAGE_SIZE = 15;

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
    () => Array.from(new Set(logs.map((l) => l.recordNumber).filter(Boolean))).sort() as string[],
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

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Log de Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Histórico completo e imutável de todas as ações realizadas no sistema
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Pesquisa rápida por usuário, ação, número do fluxo, documento, status ou observação..."
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <FilterSelect label="Usuário" value={actorFilter} onChange={resetPage(setActorFilter)}>
            {actors.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Tipo de ação" value={actionFilter} onChange={resetPage(setActionFilter)}>
            {actions.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Nº do fluxo" value={recordNumberFilter} onChange={resetPage(setRecordNumberFilter)}>
            {recordNumbers.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Status" value={statusFilter} onChange={resetPage(setStatusFilter)}>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {statusText(s)}
              </SelectItem>
            ))}
          </FilterSelect>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => resetPage(setDateFrom)(e.target.value)}
            title="Período de"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => resetPage(setDateTo)(e.target.value)}
            title="Período até"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum registro de auditoria encontrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
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
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap">
                    {l.createdAt ? new Date(l.createdAt).toLocaleString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell className="font-medium">{l.actorName || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{roleText(l.actorRole)}</Badge>
                  </TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell>{l.recordNumber || "—"}</TableCell>
                  <TableCell className="max-w-[140px] truncate" title={l.recordId || ""}>
                    {l.recordId || "—"}
                  </TableCell>
                  <TableCell>{statusText(l.statusBefore)}</TableCell>
                  <TableCell>{statusText(l.statusAfter)}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={l.detail || ""}>
                    {l.detail || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={
                page === i + 1
                  ? "flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-white"
                  : "flex h-8 w-8 items-center justify-center rounded-lg text-sm hover:bg-muted"
              }
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: Todos</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}
