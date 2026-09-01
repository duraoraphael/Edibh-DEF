"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, query, where } from "firebase/firestore";
import { BriefcaseBusiness, CalendarDays, Database } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { recordsCol, setRecordCase } from "@/lib/firestore-helpers";
import { DEFAULT_FORM_ID, fieldValue, getFirebaseErrorMessage, logFirestoreError } from "@/lib/forms";
import { useAuth } from "@/lib/auth-context";
import type { AppRecord, FormDefinition } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CaseCheckbox } from "@/components/records/case-checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

function normalizeFieldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function DataSourceInfo({ value }: { value?: string }) {
  return (
    <div className="w-full min-w-0 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
      <p className="text-xs font-semibold text-primary">Fonte de Dados</p>
      <div className="mt-1 flex min-w-0 items-start gap-2 text-sm">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <strong className="min-w-0 break-words font-semibold leading-snug">{value || "Não informado"}</strong>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Dados informados no formulário</p>
    </div>
  );
}

export default function CasesPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [dataSourceFieldKey, setDataSourceFieldKey] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(doc(db, "formFields", DEFAULT_FORM_ID), (snapshot) => {
      if (!snapshot.exists()) return setDataSourceFieldKey(null);
      const form = snapshot.data() as FormDefinition;
      const field = form.fields.find((item) => normalizeFieldName(item.label) === "fonte_de_dados");
      setDataSourceFieldKey(field?.key ?? null);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(recordsCol(), where("isCase", "==", true)),
      (snapshot) => {
        const cases = snapshot.docs
          .map((item) => item.data())
          .filter((record) => !record.deletedAt)
          .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
        setRecords(cases);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        logFirestoreError({ fn: "CasesPage:load" }, snapshotError);
        setError(getFirebaseErrorMessage(snapshotError, "Não foi possível carregar os Cases."));
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  function canChange(record: AppRecord): boolean {
    if (profile?.role === "admin" || profile?.role === "gerente") return true;
    return profile?.role === "tecnico" && record.authorId === user?.uid;
  }

  async function unmarkCase(record: AppRecord) {
    if (!canChange(record) || updatingIds.has(record.id)) return;
    setUpdatingIds((current) => new Set(current).add(record.id));
    setRecords((current) => current.filter((item) => item.id !== record.id));
    try {
      await setRecordCase(record, false, {
        uid: user?.uid,
        name: profile?.name || user?.email || undefined,
        role: profile?.role,
      });
      toast.success("Fluxo removido dos Cases.");
    } catch (updateError) {
      setRecords((current) => current.some((item) => item.id === record.id) ? current : [...current, record]);
      logFirestoreError({ fn: "CasesPage:unmarkCase", payload: { recordId: record.id } }, updateError);
      toast.error(getFirebaseErrorMessage(updateError, "Não foi possível atualizar o Case."));
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(record.id);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
        <p className="text-sm text-muted-foreground">Fluxos marcados para acompanhamento.</p>
      </div>

      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">Total de Cases</p>
          <p className="mt-1 text-2xl font-semibold">{records.length}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><BriefcaseBusiness className="h-5 w-5" /></div>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-52 w-full" />)}
        </div>
      ) : error ? (
        <Card className="p-12 text-center text-sm text-destructive">{error}</Card>
      ) : records.length === 0 ? (
        <EmptyState icon={BriefcaseBusiness} text={'Nenhum Case encontrado. Marque a opção "Case" em um fluxo para ele aparecer aqui.'} className="p-12" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {records.map((record) => (
            <Card key={record.id} className="flex cursor-pointer flex-col gap-4 p-5 transition-colors hover:border-primary/40" onClick={() => router.push(`/records?record=${record.id}&returnTo=${encodeURIComponent("/cases")}`)}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs text-muted-foreground">Fluxo</p><h2 className="font-semibold">{record.recordNumber || record.id}</h2></div>
                <StatusBadge status={record.status} />
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{fieldValue(record, "equipamento") || fieldValue(record, "sistema") || "Fluxo sem título"}</p>
                <p className="text-muted-foreground">{fieldValue(record, "instalacao") || "Instalação não informada"}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{record.authorName || "Sem responsável"}</Badge>
                <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{record.createdAt ? new Date(record.createdAt).toLocaleDateString("pt-BR") : "Sem data"}</span>
                {record.updatedAt && <span>Atualizado: {new Date(record.updatedAt).toLocaleDateString("pt-BR")}</span>}
              </div>
              <DataSourceInfo value={dataSourceFieldKey ? fieldValue(record, dataSourceFieldKey) : undefined} />
              <div onClick={(event) => event.stopPropagation()}>
                <CaseCheckbox checked disabled={!canChange(record) || updatingIds.has(record.id)} recordLabel={record.recordNumber || record.id} onCheckedChange={(checked) => { if (!checked) unmarkCase(record); }} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
