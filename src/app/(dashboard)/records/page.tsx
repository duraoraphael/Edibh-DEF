"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";
import { logsCol, recordsCol } from "@/lib/firestore-helpers";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_FORM_ID } from "@/lib/forms";
import { ExcelImportDialog } from "@/components/records/excel-import-dialog";
import { generateRecordPdf, generateRecordsTablePdf } from "@/lib/pdf";
import type { AppRecord, FormDefinition, FormField, LogEntry, RecordStatus } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

const statusLabels: Record<RecordStatus, string> = {
  rascunho: "Rascunho",
  pendente: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Reprovado",
  reajuste: "Aguardando Reajuste",
};

const statusVariant: Record<RecordStatus, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  rascunho: "secondary",
  pendente: "warning",
  aprovado: "success",
  rejeitado: "destructive",
  reajuste: "warning",
};

type SortKey = "recordNumber" | "authorName" | "status" | "createdAt";

const PAGE_SIZE = 8;
const ALL = "todos";

function fieldValue(r: AppRecord, key: string): string {
  const v = r.data?.[key];
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
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
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoadedForId, setLogsLoadedForId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

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

  const submitted = useMemo(() => records.filter((r) => r.status !== "rascunho"), [records]);

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

    list = [...list].sort((a, b) => {
      const va = (a[sortKey] || "") as string;
      const vb = (b[sortKey] || "") as string;
      const cmp = va.localeCompare(vb);
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

  function exportExcel() {
    const sheet = XLSX.utils.json_to_sheet(filtered.map(rowData));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Registros");
    XLSX.writeFile(wb, "registros_equipamentos.xlsx");
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
      await addDoc(logsCol(), {
        id: "",
        recordId: r.id,
        action: "Excluído",
        actorId: user?.uid,
        actorName: profile?.name || user?.email || undefined,
        detail: r.recordNumber,
        createdAt: new Date().toISOString(),
      });
      await deleteDoc(doc(db, "records", r.id));
      toast.success("Registro excluído");
      setDeleteTarget(null);
    } catch {
      toast.error("Erro ao excluir registro");
    }
  }

  function canEdit(r: AppRecord) {
    if (!profile) return false;
    if (profile.role === "admin" || profile.role === "gerente") return true;
    return profile.role === "tecnico" && r.authorId === user?.uid;
  }

  function canDelete() {
    return profile?.role === "admin" || profile?.role === "gerente";
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
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button className="flex items-center gap-1" onClick={() => toggleSort("recordNumber")}>
                    ID {renderSortIcon("recordNumber")}
                  </button>
                </TableHead>
                <TableHead>Instalação</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Equipamento</TableHead>
                <TableHead>Gerência</TableHead>
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
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <TableCell className="font-medium">{r.recordNumber || "—"}</TableCell>
                  <TableCell>{fieldValue(r, "instalacao") || "—"}</TableCell>
                  <TableCell>{fieldValue(r, "sistema") || "—"}</TableCell>
                  <TableCell>{fieldValue(r, "equipamento") || "—"}</TableCell>
                  <TableCell>{fieldValue(r, "gerencia") || "—"}</TableCell>
                  <TableCell>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[r.status]}>{statusLabels[r.status]}</Badge>
                  </TableCell>
                  <TableCell>{r.authorName || "—"}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelected(r)}>
                          <Eye className="h-4 w-4" />
                          Visualizar
                        </DropdownMenuItem>
                        {canEdit(r) && (
                          <DropdownMenuItem onClick={() => router.push(`/records/new?id=${r.id}`)}>
                            <Pencil className="h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                        )}
                        {canDuplicate() && (
                          <DropdownMenuItem onClick={() => duplicateRecord(r)}>
                            <Copy className="h-4 w-4" />
                            Duplicar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => exportSinglePdf(r)}>
                          <Download className="h-4 w-4" />
                          Baixar PDF
                        </DropdownMenuItem>
                        {canDelete() && (
                          <DropdownMenuItem onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                            Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                  <Badge variant={statusVariant[selected.status]}>{statusLabels[selected.status]}</Badge>
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
            Tem certeza que deseja excluir o registro {deleteTarget?.recordNumber}? Esta ação não pode ser desfeita.
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
