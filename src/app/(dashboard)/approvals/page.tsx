"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, doc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { toast } from "sonner";
import { CheckCircle2, Clock, MessageSquareWarning, XCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { approvalsCol, logsCol } from "@/lib/firestore-helpers";
import type { Approval, ApprovalAction, LogEntry } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  const [loading, setLoading] = useState(true);
  const [dialogAction, setDialogAction] = useState<{ approval: Approval; action: ApprovalAction } | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

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
    if (!expanded) {
      setLogs([]);
      return;
    }
    const unsub = onSnapshot(
      query(logsCol(), where("recordId", "==", expanded), orderBy("createdAt", "desc")),
      (snap) => setLogs(snap.docs.map((d) => d.data())),
      () => setLogs([])
    );
    return () => unsub();
  }, [expanded]);

  const pending = useMemo(() => approvals.filter((a) => a.status === "pendente"), [approvals]);

  const canReview = profile?.role === "admin" || profile?.role === "gerente";

  async function confirmAction() {
    if (!dialogAction) return;
    if (!canReview) {
      toast.error("Apenas administradores e gerentes podem revisar aprovações");
      return;
    }
    setSubmitting(true);
    try {
      const { approval, action } = dialogAction;
      await updateDoc(doc(db, "approvals", approval.id), {
        status: action,
        comment,
        reviewerId: user?.uid,
        reviewerName: profile?.name || user?.email || undefined,
        updatedAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "records", approval.recordId), {
        status: action,
        updatedAt: new Date().toISOString(),
      });
      await addDoc(logsCol(), {
        id: "",
        recordId: approval.recordId,
        action: actionLabels[action],
        actorId: user?.uid,
        actorName: profile?.name || user?.email || undefined,
        detail: comment,
        createdAt: new Date().toISOString(),
      });
      toast.success(`Registro ${actionLabels[action].toLowerCase()} com sucesso`);
      setDialogAction(null);
      setComment("");
    } catch {
      toast.error("Erro ao processar aprovação");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aprovações</h1>
        <p className="text-sm text-muted-foreground">Analise e decida sobre os registros pendentes</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !canReview ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Apenas administradores e gerentes podem revisar aprovações
            </p>
          </CardContent>
        </Card>
      ) : pending.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma aprovação pendente no momento</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pending.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="truncate">{a.recordNumber || a.recordId}</span>
                  <Badge variant="warning">Pendente</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
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
                  className="text-left text-xs font-medium text-primary hover:underline"
                  onClick={() => setExpanded(expanded === a.recordId ? null : a.recordId)}
                >
                  {expanded === a.recordId ? "Ocultar histórico de ações" : "Ver histórico de ações"}
                </button>
                {expanded === a.recordId && (
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
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dialogAction} onOpenChange={(o) => !o && setDialogAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction ? actionLabels[dialogAction.action] : ""}
            </DialogTitle>
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
    </div>
  );
}
