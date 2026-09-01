"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, orderBy, query, where, writeBatch } from "firebase/firestore";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Clock, MessageSquareWarning, XCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { approvalsCol, recordsCol, createNotifications, writeAuditLog } from "@/lib/firestore-helpers";
import { DEFAULT_FORM_ID, logFirestoreError, statusVariant } from "@/lib/forms";
import type { AppRecord, Approval, ApprovalAction, FormDefinition, FormField, LogEntry } from "@/types";
import { logsCol } from "@/lib/firestore-helpers";
import { AttachmentLink } from "@/components/ui/attachment-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const actionLabels: Record<ApprovalAction, string> = {
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  reajuste: "Reajuste solicitado",
};

export default function ApprovalsPage() {
  const { user, profile } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [records, setRecords] = useState<Record<string, AppRecord>>({});
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogAction, setDialogAction] = useState<{ approval: Approval; action: ApprovalAction } | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(approvalsCol(), orderBy("createdAt", "desc")),
      (snap) => {
        setApprovals(snap.docs.map((d) => d.data()));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      recordsCol(),
      (snap) => {
        const map: Record<string, AppRecord> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data();
        });
        setRecords(map);
      },
      () => setRecords({})
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "formFields", DEFAULT_FORM_ID), (snap) => {
      setFormFields(snap.exists() ? (snap.data() as FormDefinition).fields || [] : []);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const unsub = onSnapshot(
      query(logsCol(), where("recordId", "==", expanded), orderBy("createdAt", "desc")),
      (snap) => setLogs(snap.docs.map((d) => d.data())),
      () => setLogs([])
    );
    return () => unsub();
  }, [expanded]);

  const pending = useMemo(() => approvals.filter((a) => a.status === "pendente"), [approvals]);
  const canReview = profile?.role === "admin" || profile?.role === "gerente";

  const sortedFields = useMemo(
    () => formFields.slice().sort((a, b) => a.order - b.order),
    [formFields]
  );

  async function processDecision(approval: Approval, action: ApprovalAction, note: string) {
    const rec = records[approval.recordId];
    const statusBefore = rec ? String(rec.status || "") : "";
    const recordAuthorId = rec ? String(rec.authorId || "") : "";

    // The approval decision and the record's status must change together —
    // batched so they either both commit or neither does, never a partial
    // state where one says "aprovado" and the other is still "pendente".
    const batch = writeBatch(db);
    batch.update(doc(db, "approvals", approval.id), {
      status: action,
      comment: note,
      reviewerId: user?.uid,
      reviewerName: profile?.name || user?.email || undefined,
      updatedAt: new Date().toISOString(),
    });
    batch.update(doc(db, "records", approval.recordId), {
      status: action,
      updatedAt: new Date().toISOString(),
    });
    await batch.commit();

    // The write is confirmed at this point. Remove the resolved item
    // immediately instead of waiting for the network snapshot round-trip;
    // onSnapshot remains the source of truth and will reconcile afterward.
    setApprovals((current) => current.filter((item) => item.id !== approval.id));
    setSelectedIds((current) => {
      if (!current.has(approval.id)) return current;
      const next = new Set(current);
      next.delete(approval.id);
      return next;
    });
    setExpanded((current) => current === approval.recordId ? null : current);

    // Audit log + notification are best-effort side effects: the decision
    // itself already succeeded above, so a failure here (transient network,
    // etc.) must never surface as "the approval failed" to the reviewer.
    try {
      await writeAuditLog(
        { uid: user?.uid, name: profile?.name || user?.email || undefined, role: profile?.role },
        {
          action: actionLabels[action],
          recordId: approval.recordId,
          recordNumber: approval.recordNumber,
          statusBefore,
          statusAfter: action,
          detail: note,
        }
      );
    } catch (error) {
      logFirestoreError({ fn: "processDecision:writeAuditLog" }, error);
    }

    if (recordAuthorId) {
      const notifType = action === "aprovado" ? "aprovado" : action === "rejeitado" ? "rejeitado" : "reajuste";
      await createNotifications([recordAuthorId], {
        type: notifType,
        title:
          action === "aprovado"
            ? "Registro aprovado"
            : action === "rejeitado"
              ? "Registro reprovado"
              : "Reajuste solicitado",
        message: `Registro ${approval.recordNumber || approval.recordId}${note ? `: ${note}` : ""}`,
        recordId: approval.recordId,
        recordNumber: approval.recordNumber,
        href: "/records",
      });
    }
  }

  async function confirmAction() {
    if (!dialogAction) return;
    if (!canReview) {
      toast.error("Apenas administradores e gerentes podem revisar aprovações");
      return;
    }
    setSubmitting(true);
    try {
      const { approval, action } = dialogAction;
      await processDecision(approval, action, comment);
      toast.success(`Registro ${actionLabels[action].toLowerCase()} com sucesso`);
      setDialogAction(null);
      setComment("");
    } catch {
      toast.error("Erro ao processar aprovação");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmBulkApprove() {
    if (!canReview) {
      toast.error("Apenas administradores e gerentes podem revisar aprovações");
      return;
    }
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);
    let ok = 0;
    for (const id of ids) {
      const approval = pending.find((a) => a.id === id);
      if (!approval) continue;
      try {
        await processDecision(approval, "aprovado", "");
        ok += 1;
      } catch {
        // continue with the rest
      }
    }
    toast.success(`${ok} registro(s) aprovado(s)`);
    setSelectedIds(new Set());
    setBulkOpen(false);
    setBulkProcessing(false);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === pending.length) return new Set();
      return new Set(pending.map((a) => a.id));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aprovações</h1>
          <p className="text-sm text-muted-foreground">Analise e decida sobre os registros pendentes</p>
        </div>
        {canReview && pending.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleSelectAll}>
              {selectedIds.size === pending.length ? "Limpar seleção" : "Selecionar todos"}
            </Button>
            <Button size="sm" onClick={() => setBulkOpen(true)} disabled={selectedIds.size === 0}>
              <CheckCircle2 className="h-4 w-4" />
              Aprovar selecionados ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !canReview ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Clock}
              text="Apenas administradores e gerentes podem revisar aprovações"
              className="p-12"
            />
          </CardContent>
        </Card>
      ) : pending.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={Clock} text="Nenhuma aprovação pendente no momento" className="p-12" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pending.map((a) => {
            const rec = records[a.recordId];
            const isOpen = expanded === a.recordId;
            return (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <label className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar aprovação ${a.recordNumber || a.recordId}`}
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelected(a.id)}
                      />
                      <span className="truncate">{a.recordNumber || a.recordId}</span>
                    </label>
                    <Badge variant={statusVariant.pendente}>Pendente</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {rec && (
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span>Responsável: {rec.authorName || "—"}</span>
                      <span>
                        Enviado em: {rec.createdAt ? new Date(rec.createdAt).toLocaleString("pt-BR") : "—"}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setDialogAction({ approval: a, action: "aprovado" })}>
                      <CheckCircle2 className="h-4 w-4" />
                      Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDialogAction({ approval: a, action: "rejeitado" })}>
                      <XCircle className="h-4 w-4" />
                      Rejeitar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDialogAction({ approval: a, action: "reajuste" })}>
                      <MessageSquareWarning className="h-4 w-4" />
                      Solicitar Reajuste
                    </Button>
                  </div>

                  <button
                    className="flex items-center gap-1 text-left text-xs font-medium text-primary hover:underline"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : a.recordId)}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    {isOpen ? "Ocultar detalhes do registro" : "Ver detalhes do registro"}
                  </button>

                  {isOpen && (
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Campos do registro</p>
                        {!rec ? (
                          <p className="text-xs text-muted-foreground">Registro não encontrado</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {sortedFields.map((f) => {
                              const v = rec.data?.[f.key];
                              const text = Array.isArray(v) ? v.join(", ") : v === undefined || v === null || v === "" ? "—" : String(v);
                              return (
                                <div key={f.id} className="min-w-0 rounded-lg border border-border p-2">
                                  <p className="text-[11px] font-medium text-muted-foreground">{f.label}</p>
                                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs">{text}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {rec?.attachments && rec.attachments.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Anexos</p>
                          <div className="flex flex-wrap gap-2">
                            {rec.attachments.map((att, i) => (
                              <AttachmentLink
                                key={att.id || `${att.name}-${i}`}
                                attachment={att}
                                className="rounded-md border border-border px-2 py-1 text-xs text-primary hover:bg-primary-50"
                              >
                                {att.name}
                              </AttachmentLink>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Histórico de ações</p>
                        <div className="flex flex-col gap-2 border-l-2 border-primary-200 pl-3">
                          {logs.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nenhuma ação registrada</p>
                          ) : (
                            logs.map((l) => (
                              <div key={l.id} className="text-xs">
                                <p className="font-medium">{l.action}</p>
                                <p className="text-muted-foreground">
                                  {l.actorName} · {l.createdAt ? new Date(l.createdAt).toLocaleString() : ""}
                                </p>
                                {l.detail && <p className="mt-0.5 italic text-muted-foreground">&ldquo;{l.detail}&rdquo;</p>}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!dialogAction} onOpenChange={(o) => !o && setDialogAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogAction ? actionLabels[dialogAction.action] : ""}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Adicione um comentário (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmAction} disabled={submitting}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={(o) => !bulkProcessing && setBulkOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar registros selecionados</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirmar a aprovação de {selectedIds.size} registro(s)? Esta ação registra o log de auditoria e notifica os
            responsáveis.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkProcessing}>
              Cancelar
            </Button>
            <Button onClick={confirmBulkApprove} disabled={bulkProcessing}>
              {bulkProcessing ? "Aprovando..." : "Aprovar todos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
