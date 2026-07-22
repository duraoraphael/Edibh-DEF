"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  ListOrdered,
  MoreVertical,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { exportRecordsToExcel } from "@/lib/excel-export";
import { db } from "@/lib/firebase";
import { logsCol, recordsCol, writeAuditLog } from "@/lib/firestore-helpers";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_FORM_ID, fieldValue, statusLabels } from "@/lib/forms";
import { ExcelImportDialog } from "@/components/records/excel-import-dialog";
import { RecordRow } from "@/components/records/record-row";
import { generateRecordPdf, generateRecordsTablePdf } from "@/lib/pdf";
import type { AppRecord, FormDefinition, FormField, LogEntry } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect } from "@/components/ui/filter-select";
import { SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type SortKey =
  | "recordNumber"
  | "authorName"
  | "status"
  | "createdAt"
  | "instalacao"
  | "sistema"
  | "equipamento"
  | "gerencia";

const PAGE_SIZE = 8;
const ALL = "todos";

interface FlowUpdateEntry {
  id: string;
  text: string;
  authorName: string;
  createdAt: Timestamp | null;
}

export default function RecordsHistoryPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [responsavelFilter, setResponsavelFilter] = useState<string>(ALL);
  const [gerenciaFilter, setGerenciaFilter] = useState<string>(ALL);
  const [instalacaoFilter, setInstalacaoFilter] = useState<string>(ALL);
  const [sistemaFilter, setSistemaFilter] = useState<string>(ALL);
  const [equipamentoFilter, setEquipamentoFilter] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AppRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppRecord | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<AppRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [view, setView] = useState<"ativos" | "removidos">("ativos");
  const [dense, setDense] = useState(false);
  const [renumberOpen, setRenumberOpen] = useState(false);
  const [renumbering, setRenumbering] = useState(false);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoadedForId, setLogsLoadedForId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [flowUpdates, setFlowUpdates] = useState<FlowUpdateEntry[]>([]);
  const [newFlowUpdateText, setNewFlowUpdateText] = useState("");
  const [savingFlowUpdate, setSavingFlowUpdate] = useState(false);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "formFields", DEFAULT_FORM_ID), (snap) => {
      setFormFields(snap.exists() ? ((snap.data() as FormDefinition).fields || []) : []);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(recordsCol(), orderBy("createdAt", "desc")),
      (snap) => {
        setRecords(snap.docs.map((d) => d.data()));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    // The audit log panel is only rendered while `selected` is set (see the
    // dialog below), so stale log data left in state while the dialog is
    // closed is harmless — avoids a synchronous setState on every close.
    if (!selected) return;
    const unsub = onSnapshot(
      query(logsCol(), where("recordId", "==", selected.id), orderBy("createdAt", "desc")),
      (snap) => {
        setLogs(snap.docs.map((d) => d.data()));
        setLogsLoadedForId(selected.id);
      },
      () => setLogsLoadedForId(selected.id)
    );
    return () => unsub();
  }, [selected]);

  const logsLoading = !!selected && logsLoadedForId !== selected.id;

  useEffect(() => {
    if (!selected) return;
    const unsub = onSnapshot(
      query(collection(db, "records", selected.id, "updates"), orderBy("createdAt", "desc")),
      (snap) => {
        setFlowUpdates(
          snap.docs.map((d) => ({
            id: d.id,
            text: d.data().text as string,
            authorName: d.data().authorName as string,
            createdAt: (d.data().createdAt as Timestamp) || null,
          }))
        );
      }
    );
    return () => unsub();
  }, [selected]);

  async function addFlowUpdate() {
    if (!selected || !isAdmin) return;
    const text = newFlowUpdateText.trim();
    if (!text) {
      toast.error("Digite o texto da atualização");
      return;
    }
    setSavingFlowUpdate(true);
    try {
      await addDoc(collection(db, "records", selected.id, "updates"), {
        text,
        authorName: profile?.name || user?.email || "Usuário",
        createdAt: serverTimestamp(),
      });
      await writeAuditLog(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: "Atualização do fluxo adicionada",
          recordId: selected.id,
          recordNumber: selected.recordNumber,
          statusBefore: selected.status,
          statusAfter: selected.status,
          detail: text,
        }
      );
      setNewFlowUpdateText("");
      toast.success("Atualização adicionada");
    } catch {
      toast.error("Erro ao salvar atualização");
    } finally {
      setSavingFlowUpdate(false);
    }
  }

  const submitted = useMemo(() => {
    if (view === "removidos") return records.filter((r) => !!r.deletedAt);
    return records.filter((r) => r.status !== "rascunho" && !r.deletedAt);
  }, [records, view]);

  function switchView(v: "ativos" | "removidos") {
    setView(v);
    setSelectedIds(new Set());
    setPage(1);
  }

  const distinct = useCallback(
    (key: string) => Array.from(new Set(submitted.map((r) => fieldValue(r, key)).filter(Boolean))).sort(),
    [submitted]
  );

  const responsaveis = useMemo(
    () => Array.from(new Set(submitted.map((r) => r.authorName).filter(Boolean))) as string[],
    [submitted]
  );
  const gerencias = useMemo(() => distinct("gerencia"), [distinct]);
  const instalacoes = useMemo(() => distinct("instalacao"), [distinct]);
  const sistemas = useMemo(() => distinct("sistema"), [distinct]);
  const equipamentos = useMemo(() => distinct("equipamento"), [distinct]);

  const filtered = useMemo(() => {
    let list = submitted;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((r) =>
        [
          r.recordNumber,
          fieldValue(r, "instalacao"),
          fieldValue(r, "sistema"),
          fieldValue(r, "equipamento"),
          fieldValue(r, "gerencia"),
          r.authorName,
          statusLabels[r.status],
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s))
      );
    }
    if (statusFilter !== ALL) list = list.filter((r) => r.status === statusFilter);
    if (responsavelFilter !== ALL) list = list.filter((r) => r.authorName === responsavelFilter);
    if (gerenciaFilter !== ALL) list = list.filter((r) => fieldValue(r, "gerencia") === gerenciaFilter);
    if (instalacaoFilter !== ALL) list = list.filter((r) => fieldValue(r, "instalacao") === instalacaoFilter);
    if (sistemaFilter !== ALL) list = list.filter((r) => fieldValue(r, "sistema") === sistemaFilter);
    if (equipamentoFilter !== ALL) list = list.filter((r) => fieldValue(r, "equipamento") === equipamentoFilter);
    if (dateFrom) list = list.filter((r) => r.createdAt && r.createdAt >= dateFrom);
    if (dateTo) list = list.filter((r) => r.createdAt && r.createdAt <= dateTo + "T23:59:59");

    const fieldKeys: SortKey[] = ["instalacao", "sistema", "equipamento", "gerencia"];
    const sortValue = (r: AppRecord): string =>
      fieldKeys.includes(sortKey) ? fieldValue(r, sortKey) : ((r as unknown as Record<string, string>)[sortKey] || "");
    list = [...list].sort((a, b) => {
      const cmp = sortValue(a).localeCompare(sortValue(b));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [
    submitted,
    search,
    statusFilter,
    responsavelFilter,
    gerenciaFilter,
    instalacaoFilter,
    sistemaFilter,
    equipamentoFilter,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function rowData(r: AppRecord) {
    return {
      ID: r.recordNumber || "—",
      Instalação: fieldValue(r, "instalacao") || "—",
      Sistema: fieldValue(r, "sistema") || "—",
      Equipamento: fieldValue(r, "equipamento") || "—",
      Gerência: fieldValue(r, "gerencia") || "—",
      Data: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—",
      Status: statusLabels[r.status],
      Responsável: r.authorName || "—",
    };
  }

  async function exportExcel() {
    try {
      await exportRecordsToExcel({ records: filtered, userName: profile?.name || user?.email || "—" });
    } catch (error) {
      console.error("[RecordsHistoryPage:exportExcel] falha ao gerar Excel", error);
      toast.error("Erro ao gerar o Excel. Veja o console para detalhes.");
    }
  }

  async function exportPdf() {
    const columns = Object.keys(rowData(filtered[0] || ({} as AppRecord))).map((header) => ({
      header,
      get: (r: AppRecord) => String((rowData(r) as Record<string, string>)[header] ?? "—"),
    }));
    try {
      await generateRecordsTablePdf(filtered, columns);
    } catch (error) {
      console.error("[RecordsHistoryPage:exportPdf] falha ao gerar PDF", error);
      toast.error("Erro ao gerar o PDF. Veja o console para detalhes.");
    }
  }

  async function exportSinglePdf(r: AppRecord) {
    try {
      await generateRecordPdf(r, { fields: formFields, userName: profile?.name || r.authorName });
    } catch (error) {
      console.error("[RecordsHistoryPage:exportSinglePdf] falha ao gerar PDF", error);
      toast.error("Erro ao gerar o PDF. Veja o console para detalhes.");
    }
  }

  async function duplicateRecord(r: AppRecord) {
    const newId = crypto.randomUUID();
    try {
      await setDoc(doc(db, "records", newId), {
        status: "rascunho",
        authorId: user?.uid || r.authorId,
        authorName: profile?.name || r.authorName,
        attachments: r.attachments || [],
        formId: r.formId,
        data: r.data || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success("Registro duplicado");
      router.push(`/records/new?id=${newId}`);
    } catch {
      toast.error("Erro ao duplicar registro");
    }
  }

  async function deleteRecord(r: AppRecord) {
    try {
      await writeAuditLog(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: "Excluído (movido para Removidos)",
          recordId: r.id,
          recordNumber: r.recordNumber,
          statusBefore: r.status,
          statusAfter: r.status,
        }
      );
      await updateDoc(doc(db, "records", r.id), {
        deletedAt: new Date().toISOString(),
        deletedBy: user?.uid || null,
        deletedByName: profile?.name || user?.email || null,
      });
      toast.success("Registro movido para Removidos");
      setDeleteTarget(null);
    } catch {
      toast.error("Erro ao excluir registro");
    }
  }

  async function deleteSelected() {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    let ok = 0;
    for (const id of ids) {
      const r = records.find((rec) => rec.id === id);
      try {
        await writeAuditLog(
          { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
          {
            action: "Excluído (movido para Removidos)",
            recordId: id,
            recordNumber: r?.recordNumber,
            statusBefore: r?.status,
            statusAfter: r?.status,
          }
        );
        await updateDoc(doc(db, "records", id), {
          deletedAt: new Date().toISOString(),
          deletedBy: user?.uid || null,
          deletedByName: profile?.name || user?.email || null,
        });
        ok += 1;
      } catch {
        // continue deleting the rest even if one record fails
      }
    }
    toast.success(`${ok} registro(s) movido(s) para Removidos`);
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    setBulkDeleting(false);
  }

  async function restoreRecord(r: AppRecord) {
    try {
      await writeAuditLog(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: "Restaurado",
          recordId: r.id,
          recordNumber: r.recordNumber,
          statusBefore: r.status,
          statusAfter: r.status,
        }
      );
      await updateDoc(doc(db, "records", r.id), {
        deletedAt: null,
        deletedBy: null,
        deletedByName: null,
      });
      toast.success("Registro restaurado");
    } catch {
      toast.error("Erro ao restaurar registro");
    }
  }

  async function permanentDeleteRecord(r: AppRecord) {
    try {
      await writeAuditLog(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: "Excluído permanentemente",
          recordId: r.id,
          recordNumber: r.recordNumber,
          statusBefore: r.status,
          statusAfter: "",
        }
      );
      await deleteDoc(doc(db, "records", r.id));
      toast.success("Registro excluído permanentemente");
      setPermanentDeleteTarget(null);
    } catch {
      toast.error("Erro ao excluir registro permanentemente");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function renumberAll() {
    setRenumbering(true);
    try {
      const ordered = [...submitted].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      const countersByYear = new Map<number, number>();
      let batch = writeBatch(db);
      let opsInBatch = 0;
      for (const r of ordered) {
        const year = r.createdAt ? new Date(r.createdAt).getFullYear() : new Date().getFullYear();
        const next = (countersByYear.get(year) || 0) + 1;
        countersByYear.set(year, next);
        const recordNumber = `${next}/${year}`;
        if (r.recordNumber !== recordNumber) {
          batch.update(doc(db, "records", r.id), { recordNumber, updatedAt: new Date().toISOString() });
          opsInBatch += 1;
        }
        if (opsInBatch >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          opsInBatch = 0;
        }
      }
      if (opsInBatch > 0) await batch.commit();

      for (const [year, count] of countersByYear.entries()) {
        await setDoc(doc(db, "settings", `counter_${year}`), { value: count, year }, { merge: true });
      }

      await writeAuditLog(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        { action: "Renumeração geral de IDs", detail: "Alteração de número do fluxo (renumeração sequencial)" }
      );

      toast.success("IDs renumerados em ordem");
      setRenumberOpen(false);
    } catch {
      toast.error("Erro ao renumerar os IDs");
    } finally {
      setRenumbering(false);
    }
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = pageItems.every((r) => next.has(r.id));
      if (allSelected) {
        pageItems.forEach((r) => next.delete(r.id));
      } else {
        pageItems.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  function canEdit(r: AppRecord) {
    if (!profile) return false;
    if (profile.role === "admin" || profile.role === "gerente") return true;
    return profile.role === "tecnico" && r.authorId === user?.uid;
  }

  function canDelete() {
    return profile?.role === "admin" || profile?.role === "gerente";
  }

  function canPermanentDelete() {
    return profile?.role === "admin";
  }

  function canDuplicate() {
    return profile?.role !== "visualizador";
  }

  function renderSortIcon(column: SortKey) {
    if (sortKey !== column) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
          <p className="text-sm text-muted-foreground">Consulte todos os registros submetidos</p>
        </div>
        <div className="flex gap-2">
          {view === "ativos" && canDelete() && selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Excluir selecionados ({selectedIds.size})
            </Button>
          )}
          {view === "ativos" && canDelete() && (
            <Button variant="outline" onClick={() => setRenumberOpen(true)}>
              <ListOrdered className="h-4 w-4" />
              Renumerar IDs
            </Button>
          )}
          {view === "ativos" && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Importar Excel
              </Button>
              <Button variant="outline" onClick={exportExcel}>
                <FileSpreadsheet className="h-4 w-4" />
                Exportar Excel
              </Button>
              <Button variant="outline" onClick={exportPdf}>
                <Download className="h-4 w-4" />
                Exportar PDF
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          className={cn(
            "px-4 py-2 text-sm font-medium",
            view === "ativos" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => switchView("ativos")}
        >
          Ativos
        </button>
        <button
          className={cn(
            "px-4 py-2 text-sm font-medium",
            view === "removidos" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => switchView("removidos")}
        >
          Removidos
        </button>
        <div className="ml-auto flex items-center">
          <Button variant="ghost" size="sm" onClick={() => setDense((d) => !d)} aria-pressed={dense}>
            {dense ? "Densidade: Compacta" : "Densidade: Confortável"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por ID, instalação, sistema, equipamento, gerência, responsável ou status..."
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <FilterSelect label="Status" value={statusFilter} onChange={resetPage(setStatusFilter)}>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Responsável" value={responsavelFilter} onChange={resetPage(setResponsavelFilter)}>
            {responsaveis.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Gerência" value={gerenciaFilter} onChange={resetPage(setGerenciaFilter)}>
            {gerencias.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Instalação" value={instalacaoFilter} onChange={resetPage(setInstalacaoFilter)}>
            {instalacoes.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Sistema" value={sistemaFilter} onChange={resetPage(setSistemaFilter)}>
            {sistemas.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect label="Equipamento" value={equipamentoFilter} onChange={resetPage(setEquipamentoFilter)}>
            {equipamentos.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </FilterSelect>
          <div className="flex items-center gap-1">
            <Input type="date" value={dateFrom} onChange={(e) => resetPage(setDateFrom)(e.target.value)} title="Período de" />
            <Input type="date" value={dateTo} onChange={(e) => resetPage(setDateTo)(e.target.value)} title="Período até" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <EmptyState icon={Search} text="Nenhum registro encontrado" className="p-12" />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                {view === "ativos" && canDelete() && (
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os registros da página"
                      checked={pageItems.length > 0 && pageItems.every((r) => selectedIds.has(r.id))}
                      onChange={toggleSelectAllOnPage}
                    />
                  </TableHead>
                )}
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort("recordNumber")}>
                    ID {renderSortIcon("recordNumber")}
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort("instalacao")}>
                    Instalação {renderSortIcon("instalacao")}
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort("sistema")}>
                    Sistema {renderSortIcon("sistema")}
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort("equipamento")}>
                    Equipamento {renderSortIcon("equipamento")}
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort("gerencia")}>
                    Gerência {renderSortIcon("gerencia")}
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort("createdAt")}>
                    Data {renderSortIcon("createdAt")}
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort("status")}>
                    Status {renderSortIcon("status")}
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort("authorName")}>
                    Responsável {renderSortIcon("authorName")}
                  </button>
                </TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((r) => (
                <RecordRow
                  key={r.id}
                  record={r}
                  dense={dense}
                  onClick={() => setSelected(r)}
                  selectable={view === "ativos" && canDelete()}
                  selected={selectedIds.has(r.id)}
                  onToggleSelected={() => toggleSelected(r.id)}
                  actions={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Abrir ações do registro">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelected(r)}>
                          <Eye className="h-4 w-4" />
                          Visualizar
                        </DropdownMenuItem>
                        {view === "ativos" && canEdit(r) && (
                          <DropdownMenuItem onClick={() => router.push(`/records/new?id=${r.id}`)}>
                            <Pencil className="h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                        )}
                        {view === "ativos" && canDuplicate() && (
                          <DropdownMenuItem onClick={() => duplicateRecord(r)}>
                            <Copy className="h-4 w-4" />
                            Duplicar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => exportSinglePdf(r)}>
                          <Download className="h-4 w-4" />
                          Baixar PDF
                        </DropdownMenuItem>
                        {view === "ativos" && canDelete() && (
                          <DropdownMenuItem onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                            Excluir
                          </DropdownMenuItem>
                        )}
                        {view === "removidos" && canDelete() && (
                          <DropdownMenuItem onClick={() => restoreRecord(r)}>
                            <RotateCcw className="h-4 w-4" />
                            Restaurar
                          </DropdownMenuItem>
                        )}
                        {view === "removidos" && canPermanentDelete() && (
                          <DropdownMenuItem onClick={() => setPermanentDeleteTarget(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                            Excluir permanentemente
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
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
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg text-sm",
                page === i + 1 ? "bg-primary text-white" : "hover:bg-muted"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="grid h-[92vh] w-[95vw] max-w-6xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0">
          {selected && (
            <>
              <DialogHeader className="border-b border-border px-6 py-4">
                <DialogTitle className="flex items-center gap-3">
                  {selected.recordNumber || selected.id}
                  <StatusBadge status={selected.status} />
                </DialogTitle>
                <p className="text-sm text-muted-foreground">Responsável: {selected.authorName || "—"}</p>
              </DialogHeader>
              <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
                <div className="flex flex-col gap-5 overflow-y-auto border-b border-border p-6 lg:border-b-0 lg:border-r">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Campos preenchidos</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {Object.entries(selected.data || {}).map(([key, value]) => (
                        <div key={key} className="rounded-lg border border-border p-3">
                          <p className="text-xs font-medium text-muted-foreground">{key}</p>
                          <p className="whitespace-pre-wrap text-sm">
                            {Array.isArray(value) ? value.join(", ") : String(value ?? "—")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Anexos e fotos</h3>
                    {!selected.attachments || selected.attachments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum anexo</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {selected.attachments.map((a) => {
                          const isImage =
                            /\.(png|jpe?g|gif|webp)$/i.test(a.name) || a.contentType?.startsWith("image/");
                          return (
                            <a
                              key={a.name}
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex flex-col gap-1 rounded-lg border border-border p-2 hover:border-primary"
                            >
                              {isImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={a.url} alt={a.name} className="h-24 w-full rounded-md object-cover" />
                              ) : (
                                <div className="flex h-24 w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                                  Arquivo
                                </div>
                              )}
                              <span className="truncate text-xs">{a.name}</span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Atualizações do Fluxo</h3>
                    {isAdmin && (
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                        <textarea
                          className="flex-1 rounded-lg border border-border bg-background p-2 text-sm"
                          placeholder="Registre observações, andamento ou ações realizadas..."
                          value={newFlowUpdateText}
                          onChange={(e) => setNewFlowUpdateText(e.target.value)}
                          rows={2}
                        />
                        <Button size="sm" onClick={addFlowUpdate} disabled={savingFlowUpdate} className="sm:self-end">
                          Adicionar
                        </Button>
                      </div>
                    )}
                    {flowUpdates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma atualização registrada</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {flowUpdates.map((u) => (
                          <div key={u.id} className="rounded-lg border border-border p-3">
                            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{u.authorName}</span>
                              <span>{u.createdAt ? u.createdAt.toDate().toLocaleString("pt-BR") : "salvando..."}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm">{u.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col overflow-y-auto p-6">
                  <h3 className="mb-3 text-sm font-semibold">Log de auditoria</h3>
                  {logsLoading ? (
                    <div className="flex flex-col gap-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : logs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma ação registrada para este registro</p>
                  ) : (
                    <ol className="relative flex flex-col gap-5 border-l-2 border-border pl-4">
                      {logs.map((l) => (
                        <li key={l.id} className="relative">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                          <p className="text-sm font-medium">{l.action}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.actorName || "—"} · {l.createdAt ? new Date(l.createdAt).toLocaleString() : "—"}
                          </p>
                          {l.detail && <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{l.detail}&rdquo;</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir registro</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir o registro {deleteTarget?.recordNumber}? Ele será movido para a aba
            Removidos e poderá ser restaurado depois.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteRecord(deleteTarget)}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!permanentDeleteTarget} onOpenChange={(o) => !o && setPermanentDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir permanentemente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir permanentemente o registro {permanentDeleteTarget?.recordNumber}? Esta
            ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => permanentDeleteTarget && permanentDeleteRecord(permanentDeleteTarget)}
            >
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => !bulkDeleting && setBulkDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir registros selecionados</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir {selectedIds.size} registro(s)? Eles serão movidos para a aba Removidos e
            poderão ser restaurados depois.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={deleteSelected} disabled={bulkDeleting}>
              {bulkDeleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renumberOpen} onOpenChange={(o) => !renumbering && setRenumberOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renumerar IDs</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isso vai reordenar todos os {submitted.length} registro(s) submetidos por data de criação e renumerar
            sequencialmente (1/ano, 2/ano...), sem pular ou repetir números. Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenumberOpen(false)} disabled={renumbering}>
              Cancelar
            </Button>
            <Button onClick={renumberAll} disabled={renumbering}>
              {renumbering ? "Renumerando..." : "Renumerar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        formId={DEFAULT_FORM_ID}
        authorId={user?.uid}
        onImported={() => setImportOpen(false)}
      />
    </div>
  );
}
