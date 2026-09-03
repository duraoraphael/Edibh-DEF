"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, runTransaction, type DocumentSnapshot } from "firebase/firestore";
import { AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { buildAuditLogData, logsCol, recordsCol } from "@/lib/firestore-helpers";
import { fieldValue, getFirebaseErrorMessage, logFirestoreError } from "@/lib/forms";
import { useAuth } from "@/lib/auth-context";
import type { AppRecord } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const RECORD_NUMBER_PATTERN = /^(\d+)\/(\d{4})$/;
const MAX_BATCH_CORRECTIONS = 100;

interface NumberEdit {
  value: string;
  allowDuplicate: boolean;
}

function normalizeNumber(value: string): string {
  const match = RECORD_NUMBER_PATTERN.exec(value.trim());
  if (!match) return value.trim();
  return `${match[1].padStart(3, "0")}/${match[2]}`;
}

export function BatchNumberCorrection() {
  const { user, profile } = useAuth();
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, NumberEdit>>({});
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    return onSnapshot(
      recordsCol(),
      (snapshot) => {
        setRecords(snapshot.docs.map((item) => item.data()).filter((record) => !!record.recordNumber && !record.deletedAt));
        setLoading(false);
      },
      (error) => {
        logFirestoreError({ fn: "BatchNumberCorrection:load" }, error);
        setLoading(false);
      }
    );
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) => [
      record.recordNumber,
      fieldValue(record, "equipamento"),
      fieldValue(record, "instalacao"),
      record.authorName,
    ].some((value) => value?.toLowerCase().includes(term)));
  }, [records, search]);

  const finalNumberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      const number = selectedIds.has(record.id)
        ? normalizeNumber(edits[record.id]?.value ?? record.recordNumber ?? "")
        : normalizeNumber(record.recordNumber ?? "");
      if (number) counts.set(number, (counts.get(number) ?? 0) + 1);
    }
    return counts;
  }, [edits, records, selectedIds]);

  function toggleRecord(record: AppRecord, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size >= MAX_BATCH_CORRECTIONS) {
          toast.error(`Selecione no máximo ${MAX_BATCH_CORRECTIONS} fluxos por correção.`);
          return current;
        }
        next.add(record.id);
      } else {
        next.delete(record.id);
      }
      return next;
    });
    if (checked) {
      setEdits((current) => ({
        ...current,
        [record.id]: current[record.id] ?? { value: record.recordNumber ?? "", allowDuplicate: false },
      }));
    }
  }

  function updateEdit(id: string, patch: Partial<NumberEdit>) {
    setEdits((current) => ({
      ...current,
      [id]: { value: current[id]?.value ?? "", allowDuplicate: current[id]?.allowDuplicate ?? false, ...patch },
    }));
  }

  async function saveCorrections() {
    if (profile?.role !== "admin" || !user) return toast.error("Apenas administradores podem corrigir numerações.");
    const selected = records.filter((record) => selectedIds.has(record.id));
    const changes = selected.map((record) => ({
      record,
      next: normalizeNumber(edits[record.id]?.value ?? ""),
      allowDuplicate: edits[record.id]?.allowDuplicate ?? false,
    })).filter(({ record, next }) => next !== record.recordNumber);

    if (changes.length === 0) return toast.error("Informe ao menos uma numeração diferente da atual.");
    for (const change of changes) {
      if (!RECORD_NUMBER_PATTERN.test(change.next)) {
        return toast.error(`Número inválido para ${change.record.recordNumber}. Use o formato 001/2026.`);
      }
      if ((finalNumberCounts.get(change.next) ?? 0) > 1 && !change.allowDuplicate) {
        return toast.error(`O número ${change.next} ficará repetido. Autorize a repetição nessa linha para continuar.`);
      }
    }

    setSaving(true);
    const now = new Date().toISOString();
    try {
      await runTransaction(db, async (transaction) => {
        const approvalSnapshots: DocumentSnapshot[] = [];
        for (const change of changes) {
          approvalSnapshots.push(await transaction.get(doc(db, "approvals", change.record.id)));
        }

        const currentYear = new Date().getFullYear();
        const highestCurrentYear = changes.reduce((highest, change) => {
          const match = RECORD_NUMBER_PATTERN.exec(change.next);
          return match && Number(match[2]) === currentYear ? Math.max(highest, Number(match[1])) : highest;
        }, 0);
        const counterRef = doc(db, "settings", `recordCounter_${currentYear}`);
        const counterSnapshot = highestCurrentYear > 0 ? await transaction.get(counterRef) : null;

        changes.forEach((change, index) => {
          transaction.update(doc(db, "records", change.record.id), {
            recordNumber: change.next,
            updatedAt: now,
          });
          if (approvalSnapshots[index].exists()) {
            transaction.update(approvalSnapshots[index].ref, { recordNumber: change.next, updatedAt: now });
          }
          transaction.set(doc(logsCol()), buildAuditLogData(
            { uid: user.uid, name: profile.name, role: profile.role },
            {
              action: "Correção de numeração em lote",
              recordId: change.record.id,
              recordNumber: change.next,
              statusBefore: change.record.status,
              statusAfter: change.record.status,
              detail: `${change.record.recordNumber} → ${change.next}${change.allowDuplicate ? " (repetição autorizada)" : ""}`,
            }
          ));
        });

        const currentCounter = counterSnapshot?.exists() ? Number(counterSnapshot.data().value ?? 0) : 0;
        if (highestCurrentYear > currentCounter) {
          transaction.set(counterRef, { value: highestCurrentYear, year: currentYear }, { merge: true });
        }
      });
      toast.success(`${changes.length} numeração(ões) corrigida(s) com sucesso.`);
      setConfirmOpen(false);
      setSelectedIds(new Set());
      setEdits({});
    } catch (error) {
      logFirestoreError({ fn: "BatchNumberCorrection:save", payload: { count: changes.length } }, error);
      toast.error(getFirebaseErrorMessage(error, "Não foi possível salvar as correções."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Use esta área apenas para corrigir números existentes. O ID interno dos fluxos e a sequência automática não serão reduzidos.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por número, equipamento, instalação ou responsável..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Button onClick={() => setConfirmOpen(true)} disabled={saving || selectedIds.size === 0}>
          {saving ? "Salvando correções..." : `Salvar selecionados (${selectedIds.size})`}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Editar</TableHead>
                <TableHead>Fluxo</TableHead>
                <TableHead>Identificação</TableHead>
                <TableHead className="min-w-44">Novo número</TableHead>
                <TableHead className="min-w-64">Permissão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((record) => {
                const selected = selectedIds.has(record.id);
                const edit = edits[record.id];
                const normalized = normalizeNumber(edit?.value ?? record.recordNumber ?? "");
                const duplicate = selected && (finalNumberCounts.get(normalized) ?? 0) > 1;
                return (
                  <TableRow key={record.id}>
                    <TableCell><Checkbox checked={selected} onCheckedChange={(checked) => toggleRecord(record, checked === true)} aria-label={`Selecionar fluxo ${record.recordNumber}`} /></TableCell>
                    <TableCell className="font-semibold tabular-nums">{record.recordNumber}</TableCell>
                    <TableCell>
                      <p className="max-w-72 truncate text-sm">{fieldValue(record, "equipamento") || fieldValue(record, "sistema") || "Sem identificação"}</p>
                      <p className="text-xs text-muted-foreground">{fieldValue(record, "instalacao") || record.authorName || "—"}</p>
                    </TableCell>
                    <TableCell>
                      <Input disabled={!selected} value={edit?.value ?? record.recordNumber ?? ""} onChange={(event) => updateEdit(record.id, { value: event.target.value })} onBlur={() => selected && updateEdit(record.id, { value: normalized })} aria-label={`Novo número do fluxo ${record.recordNumber}`} />
                      {duplicate && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Este número ficará repetido.</p>}
                    </TableCell>
                    <TableCell>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox disabled={!selected || !duplicate} checked={edit?.allowDuplicate ?? false} onCheckedChange={(checked) => updateEdit(record.id, { allowDuplicate: checked === true })} />
                        Permitir repetição neste fluxo
                      </label>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Até {MAX_BATCH_CORRECTIONS} fluxos podem ser corrigidos por operação. Todas as alterações são confirmadas juntas e registradas na auditoria.</p>

      <Dialog open={confirmOpen} onOpenChange={(open) => !saving && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar correção em lote</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirme os novos números antes de continuar. A operação atualizará os fluxos selecionados e será registrada no log de auditoria.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={saveCorrections} disabled={saving}>{saving ? "Salvando..." : "Confirmar correções"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
