"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
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
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  MoreVertical,
  Pencil,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X as XIcon,
} from "lucide-react";
import { exportRecordsToExcel } from "@/lib/excel-export";
import { canEditRecord } from "@/lib/access-policy";
import { formatRecordDataSource, isDataSourceField, recordDataSources } from "@/lib/data-source";
import { db } from "@/lib/firebase";
import { buildAuditLogData, logsCol, recordsCol, setRecordCase, usersCol, writeAuditLog } from "@/lib/firestore-helpers";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_FORM_ID,
  fieldValue,
  formatCalendarDate,
  formatRecordDate,
  getFirebaseErrorMessage,
  logFirestoreError,
  compareRecordNumbers,
  recordDateKey,
  statusLabels,
} from "@/lib/forms";
import { ExcelImportDialog } from "@/components/records/excel-import-dialog";
import { RecordRow } from "@/components/records/record-row";
import { CaseCheckbox } from "@/components/records/case-checkbox";
import { AttachmentImage, AttachmentLink, isImageAttachment } from "@/components/ui/attachment-link";
import { Checkbox } from "@/components/ui/checkbox";
import { generateRecordPdf, generateRecordsTablePdf } from "@/lib/pdf";
import { deleteOwnedAttachment, uploadAttachment } from "@/lib/attachment-upload";
import {
  FlowUpdatePhotoGallery,
  FlowUpdatePhotoPicker,
  FlowUpdatePhotoViewer,
} from "@/components/records/flow-update-photos";
import type { AppRecord, AttachmentRef, FormDefinition, FormField, LogEntry, RecordStatus, User } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  | "flowDate"
  | "instalacao"
  | "sistema"
  | "equipamento"
  | "gerencia";

const DEFAULT_PAGE_SIZE = 20;
const ALL = "todos";
const HISTORY_FILTERS_STORAGE_KEY = "records-history-filters-v1";
const HISTORY_FILTER_SELECT_CLASS = "h-12 rounded-xl border-[#E2E8F0] bg-white px-3.5 text-xs shadow-none [&>span]:line-clamp-2 [&>span]:whitespace-normal [&>span]:text-left";

interface PersistedHistoryFilters {
  search: string;
  status: string;
  responsavel: string;
  gerencia: string;
  instalacao: string;
  sistema: string;
  equipamento: string;
  dataSource: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
}

interface FlowUpdateEntry {
  id: string;
  text: string;
  authorName: string;
  createdAt: Timestamp | null;
  attachments: AttachmentRef[];
}

type UploadedPhoto = Awaited<ReturnType<typeof uploadAttachment>>;

function flowPhotosLabel(count: number) {
  return `${count} foto${count === 1 ? "" : "s"}`;
}

function HistoryFilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-2 block text-xs font-semibold tracking-wide text-[#243247]">{label}</span>
      {children}
    </div>
  );
}

export default function RecordsHistoryPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRecordId = searchParams.get("record");
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [responsavelFilter, setResponsavelFilter] = useState<string>(ALL);
  const [gerenciaFilter, setGerenciaFilter] = useState<string>(ALL);
  const [instalacaoFilter, setInstalacaoFilter] = useState<string>(ALL);
  const [sistemaFilter, setSistemaFilter] = useState<string>(ALL);
  const [equipamentoFilter, setEquipamentoFilter] = useState<string>(ALL);
  const [dataSourceFilter, setDataSourceFilter] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recordNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<AppRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppRecord | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<AppRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkPermanentDeleteOpen, setBulkPermanentDeleteOpen] = useState(false);
  const [bulkPermanentDeleting, setBulkPermanentDeleting] = useState(false);
  const [view, setView] = useState<"ativos" | "removidos">("ativos");
  const [dense, setDense] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersRestored, setFiltersRestored] = useState(false);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoadedForId, setLogsLoadedForId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [flowUpdates, setFlowUpdates] = useState<FlowUpdateEntry[]>([]);
  const [newFlowUpdateText, setNewFlowUpdateText] = useState("");
  const [savingFlowUpdate, setSavingFlowUpdate] = useState(false);
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingUpdateText, setEditingUpdateText] = useState("");
  const [savingUpdateEdit, setSavingUpdateEdit] = useState(false);
  const [deletingUpdateId, setDeletingUpdateId] = useState<string | null>(null);
  const [newFlowFiles, setNewFlowFiles] = useState<File[]>([]);
  const [editingKeptPhotos, setEditingKeptPhotos] = useState<AttachmentRef[]>([]);
  const [editingNewFiles, setEditingNewFiles] = useState<File[]>([]);
  const [viewerPhoto, setViewerPhoto] = useState<AttachmentRef | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [updatingResponsible, setUpdatingResponsible] = useState(false);
  const [updatingCaseIds, setUpdatingCaseIds] = useState<Set<string>>(new Set());
  const selectedId = selected?.id;

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const stored = sessionStorage.getItem(HISTORY_FILTERS_STORAGE_KEY);
        if (!stored) return;
        const filters = JSON.parse(stored) as Partial<PersistedHistoryFilters>;
        const restoreString = (value: unknown, setter: (next: string) => void) => {
          if (typeof value === "string") setter(value);
        };
        restoreString(filters.search, setSearch);
        restoreString(filters.status, setStatusFilter);
        restoreString(filters.responsavel, setResponsavelFilter);
        restoreString(filters.gerencia, setGerenciaFilter);
        restoreString(filters.instalacao, setInstalacaoFilter);
        restoreString(filters.sistema, setSistemaFilter);
        restoreString(filters.equipamento, setEquipamentoFilter);
        restoreString(filters.dataSource, setDataSourceFilter);
        restoreString(filters.dateFrom, setDateFrom);
        restoreString(filters.dateTo, setDateTo);
        if (typeof filters.page === "number" && Number.isInteger(filters.page) && filters.page > 0) {
          setPage(filters.page);
        }
        if ([10, 20, 50].includes(filters.pageSize || 0)) {
          setPageSize(filters.pageSize!);
        }
        if (
          [filters.status, filters.responsavel, filters.gerencia, filters.instalacao, filters.sistema, filters.equipamento, filters.dataSource]
            .some((value) => typeof value === "string" && value !== ALL) ||
          Boolean(filters.dateFrom || filters.dateTo)
        ) {
          setFiltersOpen(true);
        }
      } catch {
        sessionStorage.removeItem(HISTORY_FILTERS_STORAGE_KEY);
      } finally {
        setFiltersRestored(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!filtersRestored) return;
    const filters: PersistedHistoryFilters = {
      search,
      status: statusFilter,
      responsavel: responsavelFilter,
      gerencia: gerenciaFilter,
      instalacao: instalacaoFilter,
      sistema: sistemaFilter,
      equipamento: equipamentoFilter,
      dataSource: dataSourceFilter,
      dateFrom,
      dateTo,
      page,
      pageSize,
    };
    const hasPersistedCriteria = Boolean(
      search || dateFrom || dateTo || page !== 1 || pageSize !== DEFAULT_PAGE_SIZE ||
      [statusFilter, responsavelFilter, gerenciaFilter, instalacaoFilter, sistemaFilter, equipamentoFilter, dataSourceFilter]
        .some((value) => value !== ALL)
    );
    if (hasPersistedCriteria) {
      sessionStorage.setItem(HISTORY_FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } else {
      sessionStorage.removeItem(HISTORY_FILTERS_STORAGE_KEY);
    }
  }, [
    filtersRestored,
    search,
    statusFilter,
    responsavelFilter,
    gerenciaFilter,
    instalacaoFilter,
    sistemaFilter,
    equipamentoFilter,
    dataSourceFilter,
    dateFrom,
    dateTo,
    page,
    pageSize,
  ]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "formFields", DEFAULT_FORM_ID), (snap) => {
      setFormFields(snap.exists() ? ((snap.data() as FormDefinition).fields || []) : []);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(usersCol(), (snap) => {
      setUsers(snap.docs.map((d) => d.data()));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(recordsCol(), orderBy("createdAt", "desc")),
      (snap) => {
        const nextRecords = snap.docs.map((d) => d.data());
        setRecords(nextRecords);
        if (requestedRecordId) {
          setSelected(nextRecords.find((record) => record.id === requestedRecordId && !record.deletedAt) || null);
        } else {
          setSelected(null);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [requestedRecordId]);

  useEffect(() => {
    // The audit log panel is only rendered while `selected` is set (see the
    // dialog below), so stale log data left in state while the dialog is
    // closed is harmless — avoids a synchronous setState on every close.
    if (!selectedId) return;
    const unsub = onSnapshot(
      query(logsCol(), where("recordId", "==", selectedId), orderBy("createdAt", "desc")),
      (snap) => {
        setLogs(snap.docs.map((d) => d.data()));
        setLogsLoadedForId(selectedId);
      },
      () => setLogsLoadedForId(selectedId)
    );
    return () => unsub();
  }, [selectedId]);

  const logsLoading = !!selected && logsLoadedForId !== selected.id;

  useEffect(() => {
    cancelEditFlowUpdate();
  }, [selected]);

  useEffect(() => {
    if (!selectedId) return;
    const unsub = onSnapshot(
      query(collection(db, "records", selectedId, "updates"), orderBy("createdAt", "desc")),
      (snap) => {
        setFlowUpdates(
          snap.docs.map((d) => ({
            id: d.id,
            text: d.data().text as string,
            authorName: d.data().authorName as string,
            createdAt: (d.data().createdAt as Timestamp) || null,
            attachments: Array.isArray(d.data().attachments) ? (d.data().attachments as AttachmentRef[]) : [],
          }))
        );
      }
    );
    return () => unsub();
  }, [selectedId]);

  /** Uploads sequentially; on any failure the photos already sent in this attempt are removed. */
  async function uploadFlowPhotos(files: File[], recordId: string): Promise<UploadedPhoto[]> {
    if (!user) throw new Error("Faça login novamente.");
    const uploaded: UploadedPhoto[] = [];
    try {
      for (const file of files) {
        const id = crypto.randomUUID().replace(/-/g, "");
        uploaded.push(await uploadAttachment(file, user.uid, recordId, id, () => {}));
      }
      return uploaded;
    } catch (error) {
      await discardFlowPhotos(uploaded);
      throw Object.assign(error instanceof Error ? error : new Error("upload"), { isUpload: true });
    }
  }

  async function discardFlowPhotos(photos: UploadedPhoto[]) {
    if (!user) return;
    for (const { attachment, recoveryKey } of photos) {
      try {
        if (attachment.path) await deleteOwnedAttachment(attachment.path, user.uid);
        localStorage.removeItem(recoveryKey);
      } catch {
        // Cleanup is best-effort; the recovery journal stays for later cleanup.
      }
    }
  }

  function flowSaveError(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : "";
    if ((error as { isUpload?: boolean })?.isUpload) {
      toast.error(`Erro ao enviar as fotos${message ? `: ${message}` : ""}. O texto foi mantido.`);
    } else {
      toast.error(fallback);
    }
  }

  async function addFlowUpdate() {
    if (!selected || !canEdit(selected)) return;
    const text = newFlowUpdateText.trim();
    if (!text && newFlowFiles.length === 0) {
      toast.error("Digite um texto ou adicione ao menos uma foto");
      return;
    }
    setSavingFlowUpdate(true);
    let uploaded: UploadedPhoto[] = [];
    try {
      uploaded = await uploadFlowPhotos(newFlowFiles, selected.id);
      const batch = writeBatch(db);
      batch.set(doc(collection(db, "records", selected.id, "updates")), {
        text,
        authorName: profile?.name || user?.email || "Usuário",
        createdAt: serverTimestamp(),
        attachments: uploaded.map((u) => u.attachment),
      });
      batch.set(doc(logsCol()), buildAuditLogData(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: "Atualização do fluxo adicionada",
          recordId: selected.id,
          recordNumber: selected.recordNumber,
          statusBefore: selected.status,
          statusAfter: selected.status,
          detail: [text, uploaded.length ? flowPhotosLabel(uploaded.length) : ""].filter(Boolean).join(" · "),
        }
      ));
      await batch.commit();
      uploaded.forEach((u) => localStorage.removeItem(u.recoveryKey));
      setNewFlowUpdateText("");
      setNewFlowFiles([]);
      toast.success("Atualização adicionada");
    } catch (error) {
      await discardFlowPhotos(uploaded);
      flowSaveError(error, "Erro ao salvar atualização");
    } finally {
      setSavingFlowUpdate(false);
    }
  }

  function startEditFlowUpdate(u: FlowUpdateEntry) {
    setEditingUpdateId(u.id);
    setEditingUpdateText(u.text);
    setEditingKeptPhotos(u.attachments);
    setEditingNewFiles([]);
  }

  function cancelEditFlowUpdate() {
    setEditingUpdateId(null);
    setEditingUpdateText("");
    setEditingKeptPhotos([]);
    setEditingNewFiles([]);
  }

  async function saveEditFlowUpdate() {
    if (!selected || !canEdit(selected) || !editingUpdateId) return;
    const text = editingUpdateText.trim();
    if (!text && editingKeptPhotos.length === 0 && editingNewFiles.length === 0) {
      toast.error("Digite um texto ou mantenha ao menos uma foto");
      return;
    }
    setSavingUpdateEdit(true);
    let uploaded: UploadedPhoto[] = [];
    try {
      uploaded = await uploadFlowPhotos(editingNewFiles, selected.id);
      const original = flowUpdates.find((u) => u.id === editingUpdateId)?.attachments ?? [];
      const removed = original.filter((photo) => !editingKeptPhotos.some((kept) => kept.id === photo.id));
      const attachments = [...editingKeptPhotos, ...uploaded.map((u) => u.attachment)];
      const batch = writeBatch(db);
      batch.update(doc(db, "records", selected.id, "updates", editingUpdateId), { text, attachments });
      batch.set(doc(logsCol()), buildAuditLogData(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: "Atualização do fluxo editada",
          recordId: selected.id,
          recordNumber: selected.recordNumber,
          statusBefore: selected.status,
          statusAfter: selected.status,
          detail: [text, attachments.length ? flowPhotosLabel(attachments.length) : ""].filter(Boolean).join(" · "),
        }
      ));
      await batch.commit();
      uploaded.forEach((u) => localStorage.removeItem(u.recoveryKey));
      // Files dropped from the update are removed from Storage only where the current user owns them.
      if (user) {
        for (const photo of removed) {
          if (photo.path) await deleteOwnedAttachment(photo.path, user.uid).catch(() => {});
        }
      }
      toast.success("Atualização editada");
      cancelEditFlowUpdate();
    } catch (error) {
      await discardFlowPhotos(uploaded);
      flowSaveError(error, "Erro ao editar atualização");
    } finally {
      setSavingUpdateEdit(false);
    }
  }

  async function deleteFlowUpdate(u: FlowUpdateEntry) {
    if (!selected || !canEdit(selected)) return;
    setDeletingUpdateId(u.id);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "records", selected.id, "updates", u.id));
      batch.set(doc(logsCol()), buildAuditLogData(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: "Atualização do fluxo excluída",
          recordId: selected.id,
          recordNumber: selected.recordNumber,
          statusBefore: selected.status,
          statusAfter: selected.status,
          detail: u.text || flowPhotosLabel(u.attachments.length),
        }
      ));
      await batch.commit();
      if (user) {
        for (const photo of u.attachments) {
          if (photo.path) await deleteOwnedAttachment(photo.path, user.uid).catch(() => {});
        }
      }
      toast.success("Atualização excluída");
    } catch {
      toast.error("Erro ao excluir atualização");
    } finally {
      setDeletingUpdateId(null);
    }
  }

  const EDITABLE_STATUS_TARGETS: RecordStatus[] = ["pendente", "aprovado", "rejeitado", "concluido", "concluido_direto"];

  const responsibleUsers = useMemo(
    () => users.filter((u) => u.status !== "inativo" && u.role !== "visualizador").sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  async function updateResponsible(r: AppRecord, newAuthorId: string) {
    const next = responsibleUsers.find((u) => u.id === newAuthorId);
    if (!next || next.id === r.authorId || !canChangeResponsible()) return;
    setUpdatingResponsible(true);
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      batch.update(doc(db, "records", r.id), { authorId: next.id, authorName: next.name || next.email, updatedAt: now });
      batch.set(doc(db, "approvals", r.id), { authorId: next.id, updatedAt: now }, { merge: true });
      batch.set(doc(logsCol()), buildAuditLogData(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: "Responsável do registro alterado",
          recordId: r.id,
          recordNumber: r.recordNumber,
          statusBefore: r.status,
          statusAfter: r.status,
          detail: `${r.authorName || r.authorId} → ${next.name || next.email}`,
        }
      ));
      await batch.commit();
      setSelected((prev) => (prev && prev.id === r.id ? { ...prev, authorId: next.id, authorName: next.name || next.email } : prev));
      toast.success("Responsável alterado");
    } catch (error) {
      logFirestoreError({ fn: "updateResponsible", payload: { recordId: r.id, newAuthorId } }, error);
      toast.error(getFirebaseErrorMessage(error, "Não foi possível alterar o responsável."));
    } finally {
      setUpdatingResponsible(false);
    }
  }

  async function updateRecordStatus(r: AppRecord, newStatus: RecordStatus) {
    if (newStatus === r.status) return;
    setUpdatingStatus(true);
    setRecords((current) => current.map((record) => record.id === r.id ? { ...record, status: newStatus } : record));
    setSelected((current) => current?.id === r.id ? { ...current, status: newStatus } : current);
    try {
      // Record + its approval doc change status together, atomically — a
      // batch instead of two independent writes, so there's never a partial
      // state where one updated and the other didn't.
      const batch = writeBatch(db);
      batch.update(doc(db, "records", r.id), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
      batch.set(
        doc(db, "approvals", r.id),
        {
          recordId: r.id,
          recordNumber: r.recordNumber,
          authorId: r.authorId,
          status: newStatus,
          reviewerId: user?.uid,
          reviewerName: profile?.name || user?.email || undefined,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      batch.set(doc(logsCol()), buildAuditLogData(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: `Status alterado para ${statusLabels[newStatus]}`,
          recordId: r.id,
          recordNumber: r.recordNumber,
          statusBefore: r.status,
          statusAfter: newStatus,
        }
      ));
      await batch.commit();

      toast.success(`Status alterado para ${statusLabels[newStatus]}`);

    } catch (error) {
      setRecords((current) => current.map((record) => record.id === r.id ? { ...record, status: r.status } : record));
      setSelected((current) => current?.id === r.id ? { ...current, status: r.status } : current);
      logFirestoreError({ fn: "updateRecordStatus", payload: { recordId: r.id, newStatus } }, error);
      toast.error(getFirebaseErrorMessage(error, "Não foi possível alterar o status."));
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function updateCase(r: AppRecord, isCase: boolean) {
    if (!canToggleCase(r) || updatingCaseIds.has(r.id)) return;
    setUpdatingCaseIds((current) => new Set(current).add(r.id));
    setRecords((current) => current.map((record) => record.id === r.id ? { ...record, isCase } : record));
    setSelected((current) => current?.id === r.id ? { ...current, isCase } : current);
    try {
      await setRecordCase(
        r,
        isCase,
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
      );
      toast.success(isCase ? "Fluxo marcado como Case" : "Fluxo removido dos Cases");
    } catch (error) {
      setRecords((current) => current.map((record) => record.id === r.id ? { ...record, isCase: r.isCase } : record));
      setSelected((current) => current?.id === r.id ? { ...current, isCase: r.isCase } : current);
      logFirestoreError({ fn: "updateCase", payload: { recordId: r.id, isCase } }, error);
      toast.error(getFirebaseErrorMessage(error, "Não foi possível atualizar o Case."));
    } finally {
      setUpdatingCaseIds((current) => {
        const next = new Set(current);
        next.delete(r.id);
        return next;
      });
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
  const dataSources = useMemo(
    () => Array.from(new Set(submitted.flatMap((record) => recordDataSources(record, formFields))))
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    [submitted, formFields]
  );

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
    if (dataSourceFilter !== ALL) list = list.filter((r) => recordDataSources(r, formFields).includes(dataSourceFilter));
    if (dateFrom || dateTo) {
      list = list.filter((r) => {
        const date = recordDateKey(r, formFields);
        return !!date && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
      });
    }

    const fieldKeys: SortKey[] = ["instalacao", "sistema", "equipamento", "gerencia"];
    const sortValue = (r: AppRecord): string => {
      if (sortKey === "flowDate") return recordDateKey(r, formFields);
      if (fieldKeys.includes(sortKey)) return fieldValue(r, sortKey);
      return (r as unknown as Record<string, string>)[sortKey] || "";
    };
    list = [...list].sort((a, b) => {
      const cmp =
        sortKey === "recordNumber"
          ? compareRecordNumbers(a.recordNumber, b.recordNumber)
          : sortValue(a).localeCompare(sortValue(b), "pt-BR", { numeric: true, sensitivity: "base" });
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
    dataSourceFilter,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
    formFields,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const visiblePages = Array.from(new Set([1, page - 1, page, page + 1, totalPages]))
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

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
      Data: formatRecordDate(r, formFields),
      Status: statusLabels[r.status],
      Responsável: r.authorName || "—",
    };
  }

  async function exportExcel() {
    try {
      await exportRecordsToExcel({ records: filtered, formFields, userName: profile?.name || user?.email || "—" });
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

  async function permanentDeleteSelected() {
    setBulkPermanentDeleting(true);
    const ids = Array.from(selectedIds);
    let ok = 0;
    for (const id of ids) {
      const r = records.find((rec) => rec.id === id);
      try {
        await writeAuditLog(
          { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
          {
            action: "Excluído permanentemente",
            recordId: id,
            recordNumber: r?.recordNumber,
            statusBefore: r?.status,
            statusAfter: "",
          }
        );
        await deleteDoc(doc(db, "records", id));
        ok += 1;
      } catch {
        // continue deleting the rest even if one record fails
      }
    }
    toast.success(`${ok} registro(s) excluído(s) permanentemente`);
    setSelectedIds(new Set());
    setBulkPermanentDeleteOpen(false);
    setBulkPermanentDeleting(false);
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
    return canEditRecord(profile, user?.uid, r);
  }

  function canToggleCase(r: AppRecord) {
    return canEditRecord(profile, user?.uid, r);
  }

  function canChangeStatus() {
    return profile?.role === "admin" || profile?.role === "gerente";
  }

  function canChangeResponsible() {
    return profile?.role === "admin" || profile?.role === "gerente";
  }

  function canDelete() {
    return profile?.role === "admin" || profile?.role === "gerente";
  }

  function canPermanentDelete() {
    return profile?.role === "admin";
  }

  function closeDetails() {
    setSelected(null);
    if (!searchParams.has("record")) return;
    const returnTo = searchParams.get("returnTo");
    if (returnTo === "/cases") {
      router.replace(returnTo);
    } else if (returnTo === "/records") {
      router.back();
    } else {
      router.replace("/records");
    }
  }

  function openDetails(record: AppRecord) {
    setSelected(record);
    const params = new URLSearchParams(searchParams.toString());
    params.set("record", record.id);
    params.set("returnTo", "/records");
    router.push(`/records?${params.toString()}`);
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

  function clearFilters() {
    sessionStorage.removeItem(HISTORY_FILTERS_STORAGE_KEY);
    setSearch("");
    setStatusFilter(ALL);
    setResponsavelFilter(ALL);
    setGerenciaFilter(ALL);
    setInstalacaoFilter(ALL);
    setSistemaFilter(ALL);
    setEquipamentoFilter(ALL);
    setDataSourceFilter(ALL);
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const activeFilterCount = [statusFilter, responsavelFilter, gerenciaFilter, instalacaoFilter, sistemaFilter, equipamentoFilter, dataSourceFilter]
    .filter((value) => value !== ALL).length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);
  const hasActiveCriteria = Boolean(search || activeFilterCount > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Histórico de Fluxos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visualize, filtre e marque fluxos estratégicos como Case.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {view === "ativos" && canDelete() && selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Excluir selecionados ({selectedIds.size})
            </Button>
          )}
          {view === "removidos" && canPermanentDelete() && selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setBulkPermanentDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Remover dos dashboards ({selectedIds.size})
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

      <div className="flex gap-2 border-b border-border/80">
        <button
          className={cn(
            "px-4 py-2 text-sm font-medium",
            view === "ativos" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => switchView("ativos")}
        >
          Ativos <span className="ml-1 text-xs text-muted-foreground">{records.filter((record) => record.status !== "rascunho" && !record.deletedAt).length}</span>
        </button>
        <button
          className={cn(
            "px-4 py-2 text-sm font-medium",
            view === "removidos" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => switchView("removidos")}
        >
          Removidos <span className="ml-1 text-xs text-muted-foreground">{records.filter((record) => !!record.deletedAt).length}</span>
        </button>
        <div className="ml-auto flex items-center">
          <Button className="h-9 rounded-lg bg-card shadow-none" variant="outline" size="sm" onClick={() => setDense((d) => !d)} aria-pressed={dense}>
            {dense ? "Densidade: Compacta" : "Densidade: Confortável"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <Input
              className="h-12 rounded-xl border-[#E2E8F0] bg-white pl-11 pr-4 shadow-sm placeholder:text-[#64748B] focus-visible:border-primary focus-visible:ring-primary/20"
              placeholder="Buscar por ID, instalação, sistema, equipamento, gerência, responsável ou status..."
              aria-label="Buscar no histórico"
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
            />
          </div>
          <Button
            className="h-12 min-w-36 justify-between rounded-xl border-primary-100 bg-primary-50 px-4 text-primary-800 shadow-none hover:bg-primary-100"
            variant="outline"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="history-filters-panel"
          >
            <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Filtros</span>
            {activeFilterCount > 0 && (
              <span className="rounded-md border border-primary-100 bg-white px-1.5 py-0.5 text-xs leading-none text-primary-700">{activeFilterCount}</span>
            )}
            <ChevronDown className={cn("h-4 w-4 text-primary-700 transition-transform motion-reduce:transition-none", filtersOpen && "rotate-180")} />
          </Button>
        </div>

        {filtersOpen && (
          <section id="history-filters-panel" aria-label="Filtros do histórico" className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-x-4 gap-y-4">
              <HistoryFilterField label="Status">
                <FilterSelect label="Status" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={statusFilter} onChange={resetPage(setStatusFilter)}>
                  {Object.entries(statusLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Responsável">
                <FilterSelect label="Responsável" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={responsavelFilter} onChange={resetPage(setResponsavelFilter)}>
                  {responsaveis.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Gerência">
                <FilterSelect label="Gerência" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={gerenciaFilter} onChange={resetPage(setGerenciaFilter)}>
                  {gerencias.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Instalação">
                <FilterSelect label="Instalação" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={instalacaoFilter} onChange={resetPage(setInstalacaoFilter)}>
                  {instalacoes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Sistema">
                <FilterSelect label="Sistema" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={sistemaFilter} onChange={resetPage(setSistemaFilter)}>
                  {sistemas.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Equipamento">
                <FilterSelect label="Equipamento" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={equipamentoFilter} onChange={resetPage(setEquipamentoFilter)}>
                  {equipamentos.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
              <HistoryFilterField label="Fonte de Dados">
                <FilterSelect label="Fonte de Dados" includeLabelInAllOption={false} className={HISTORY_FILTER_SELECT_CLASS} value={dataSourceFilter} onChange={resetPage(setDataSourceFilter)}>
                  {dataSources.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </FilterSelect>
              </HistoryFilterField>
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-[#E2E8F0] pt-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F6F8FA] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#243247]">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <span>Período</span>
                </div>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
                  <div className="relative min-w-0">
                    <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <Input id="history-date-from" aria-label="Data inicial do período" lang="pt-BR" type="date" value={dateFrom} onChange={(e) => resetPage(setDateFrom)(e.target.value)} title="Período de" className="h-11 rounded-xl border-[#E2E8F0] bg-white pl-10 shadow-none" />
                  </div>
                  <span className="text-center text-sm text-[#64748B]">até</span>
                  <div className="relative min-w-0">
                    <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <Input id="history-date-to" aria-label="Data final do período" lang="pt-BR" type="date" value={dateTo} onChange={(e) => resetPage(setDateTo)(e.target.value)} title="Período até" className="h-11 rounded-xl border-[#E2E8F0] bg-white pl-10 shadow-none" />
                  </div>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasActiveCriteria} className="h-11 w-full rounded-xl border-[#E2E8F0] bg-white px-4 text-[#243247] shadow-none hover:bg-[#F6F8FA] lg:w-auto">
                <RotateCcw className="h-4 w-4 text-[#64748B]" />
                Limpar Filtros
              </Button>
            </div>
          </section>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/80 bg-card">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <EmptyState icon={Search} text="Nenhum fluxo encontrado" className="p-12" />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/35 text-xs">
              <TableRow>
                {((view === "ativos" && canDelete()) || (view === "removidos" && canPermanentDelete())) && (
                  <TableHead className="w-8">
                    <Checkbox
                      aria-label="Selecionar todos os registros da página"
                      checked={pageItems.length > 0 && pageItems.every((r) => selectedIds.has(r.id))}
                      onCheckedChange={toggleSelectAllOnPage}
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
                <TableHead className="min-w-64">
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
                  <button className="flex items-center gap-1" onClick={() => toggleSort("flowDate")}>
                    Data {renderSortIcon("flowDate")}
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
                <TableHead>Fonte de Dados</TableHead>
                <TableHead>Case</TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((r) => (
                <RecordRow
                  key={r.id}
                  record={r}
                  dataSource={formatRecordDataSource(r, formFields)}
                  flowDate={formatRecordDate(r, formFields)}
                  dense={dense}
                  onClick={() => openDetails(r)}
                  selectable={(view === "ativos" && canDelete()) || (view === "removidos" && canPermanentDelete())}
                  selected={selectedIds.has(r.id)}
                  onToggleSelected={() => toggleSelected(r.id)}
                  caseControl={canToggleCase(r) ? (
                    <CaseCheckbox
                      checked={r.isCase === true}
                      disabled={view !== "ativos" || updatingCaseIds.has(r.id)}
                      recordLabel={r.recordNumber || r.id}
                      onCheckedChange={(checked) => updateCase(r, checked)}
                    />
                  ) : r.isCase ? <span>CASE</span> : <span>—</span>}
                  actions={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Abrir ações do registro">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetails(r)}>
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
      {filtered.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border/70 bg-card px-4 py-3 text-sm lg:flex-row">
          <p className="text-muted-foreground">Mostrando <span className="font-medium text-foreground">{(page - 1) * pageSize + 1} a {Math.min(page * pageSize, filtered.length)}</span> de <span className="font-medium text-foreground">{filtered.length}</span> registros</p>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</Button>
            {visiblePages.map((pageNumber, index) => (
              <span key={pageNumber} className="contents">
                {index > 0 && pageNumber - visiblePages[index - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
                <button onClick={() => setPage(pageNumber)} className={cn("flex h-8 w-8 items-center justify-center rounded-md border text-sm transition-colors", page === pageNumber ? "border-primary bg-card text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground")}>{pageNumber}</button>
              </span>
            ))}
            <Button variant="ghost" size="sm" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
          </div>
          <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
            <SelectTrigger className="h-8 w-32 rounded-md shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent>{[10, 20, 50].map((size) => <SelectItem key={size} value={String(size)}>{size} por página</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && closeDetails()}>
        <DialogContent className="grid h-[92vh] w-[95vw] max-w-6xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0">
          {selected && (
            <>
              <DialogHeader className="border-b border-border px-6 py-4">
                <DialogTitle className="flex flex-wrap items-center gap-3">
                  {selected.recordNumber || selected.id}
                  {!selected.deletedAt && canEdit(selected) && (
                    <Button size="sm" variant="outline" onClick={() => router.push(`/records/new?id=${selected.id}`)}>
                      <Pencil className="h-4 w-4" />Editar
                    </Button>
                  )}
                  {canChangeStatus() ? (
                    <Select
                      value={selected.status}
                      onValueChange={(v) => updateRecordStatus(selected, v as RecordStatus)}
                      disabled={updatingStatus}
                    >
                      <SelectTrigger className="h-7 w-auto text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EDITABLE_STATUS_TARGETS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {statusLabels[s]}
                          </SelectItem>
                        ))}
                        {selected.status === "reajuste" && (
                          <SelectItem value="reajuste">{statusLabels.reajuste}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <StatusBadge status={selected.status} />
                  )}
                </DialogTitle>
                {canChangeResponsible() ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      Responsável atual: <strong className="font-medium text-foreground">{selected.authorName || "—"}</strong>
                    </span>
                    <Select
                      value={selected.authorId}
                      onValueChange={(value) => updateResponsible(selected, value)}
                      disabled={updatingResponsible}
                    >
                      <SelectTrigger className="h-8 min-w-52 text-sm">
                        <SelectValue placeholder="Selecione o responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        {responsibleUsers.map((responsible) => (
                          <SelectItem key={responsible.id} value={responsible.id}>
                            {responsible.name || responsible.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Responsável: {selected.authorName || "—"}</p>
                )}
              </DialogHeader>
              <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
                <div className="flex flex-col gap-5 overflow-y-auto border-b border-border p-6 lg:border-b-0 lg:border-r">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Campos preenchidos</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="min-w-0 overflow-hidden rounded-lg border border-border p-3">
                        <p className="text-xs font-medium text-muted-foreground">Fonte de Dados</p>
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">{formatRecordDataSource(selected, formFields)}</p>
                      </div>
                      {Object.entries(selected.data || {}).filter(([key]) => !isDataSourceField(key, formFields)).map(([key, value]) => (
                        <div key={key} className="min-w-0 overflow-hidden rounded-lg border border-border p-3">
                          <p className="text-xs font-medium text-muted-foreground">{key}</p>
                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
                            {formFields.some((field) => field.key === key && field.type === "data")
                              ? formatCalendarDate(value)
                              : Array.isArray(value) ? value.join(", ") : String(value ?? "—")}
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
                        {selected.attachments.map((a, i) => (
                          <AttachmentLink
                            key={a.id || `${a.name}-${i}`}
                            attachment={a}
                            className="flex flex-col gap-1 rounded-lg border border-border p-2 hover:border-primary"
                          >
                            {isImageAttachment(a) ? (
                              <AttachmentImage attachment={a} alt={a.name} className="h-24 w-full rounded-md object-cover" />
                            ) : (
                              <div className="flex h-24 w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                                Arquivo
                              </div>
                            )}
                            <span className="truncate text-xs">{a.name}</span>
                          </AttachmentLink>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Atualizações do Fluxo</h3>
                    {canEdit(selected) && (
                      <div className="mb-3 flex flex-col gap-2">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <textarea
                            className="flex-1 rounded-lg border border-border bg-background p-2 text-sm"
                            placeholder="Registre observações, andamento ou ações realizadas..."
                            value={newFlowUpdateText}
                            onChange={(e) => setNewFlowUpdateText(e.target.value)}
                            rows={2}
                          />
                          <Button size="sm" onClick={addFlowUpdate} disabled={savingFlowUpdate} className="sm:self-end">
                            {savingFlowUpdate ? "Salvando..." : "Adicionar"}
                          </Button>
                        </div>
                        <FlowUpdatePhotoPicker
                          files={newFlowFiles}
                          disabled={savingFlowUpdate}
                          onAddFiles={(added) => setNewFlowFiles((prev) => [...prev, ...added])}
                          onRemoveFile={(index) => setNewFlowFiles((prev) => prev.filter((_, i) => i !== index))}
                          onOpen={setViewerPhoto}
                        />
                      </div>
                    )}
                    {flowUpdates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma atualização registrada</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {flowUpdates.map((u) => (
                          <div key={u.id} className="rounded-lg border border-border p-3">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">{u.authorName}</span>
                                <span>{u.createdAt ? u.createdAt.toDate().toLocaleString("pt-BR") : "salvando..."}</span>
                              </div>
                              {canEdit(selected) && editingUpdateId !== u.id && (
                                <div className="flex items-center gap-1">
                                  <button
                                    className="text-muted-foreground hover:text-foreground"
                                    aria-label="Editar atualização"
                                    onClick={() => startEditFlowUpdate(u)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    className="text-muted-foreground hover:text-destructive"
                                    aria-label="Excluir atualização"
                                    disabled={deletingUpdateId === u.id}
                                    onClick={() => deleteFlowUpdate(u)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {editingUpdateId === u.id ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  className="rounded-lg border border-border bg-background p-2 text-sm"
                                  value={editingUpdateText}
                                  onChange={(e) => setEditingUpdateText(e.target.value)}
                                  rows={2}
                                />
                                <FlowUpdatePhotoPicker
                                  existing={editingKeptPhotos}
                                  files={editingNewFiles}
                                  disabled={savingUpdateEdit}
                                  onAddFiles={(added) => setEditingNewFiles((prev) => [...prev, ...added])}
                                  onRemoveFile={(index) => setEditingNewFiles((prev) => prev.filter((_, i) => i !== index))}
                                  onRemoveExisting={(id) => setEditingKeptPhotos((prev) => prev.filter((p) => p.id !== id))}
                                  onOpen={setViewerPhoto}
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={saveEditFlowUpdate} disabled={savingUpdateEdit}>
                                    <Check className="h-3.5 w-3.5" />
                                    Salvar
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={cancelEditFlowUpdate}>
                                    <XIcon className="h-3.5 w-3.5" />
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {u.text && <p className="whitespace-pre-wrap text-sm">{u.text}</p>}
                                <FlowUpdatePhotoGallery photos={u.attachments} onOpen={setViewerPhoto} />
                              </>
                            )}
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

      <Dialog open={bulkPermanentDeleteOpen} onOpenChange={(o) => !bulkPermanentDeleting && setBulkPermanentDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover fluxos dos dashboards</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir permanentemente {selectedIds.size} registro(s)? Esta ação não pode ser
            desfeita e os registros serão removidos dos dashboards.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPermanentDeleteOpen(false)} disabled={bulkPermanentDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={permanentDeleteSelected} disabled={bulkPermanentDeleting}>
              {bulkPermanentDeleting ? "Removendo..." : "Remover permanentemente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <FlowUpdatePhotoViewer photo={viewerPhoto} onClose={() => setViewerPhoto(null)} />

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
