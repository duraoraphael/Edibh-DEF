import { doc, getDoc, getDocs, query, runTransaction, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { recordsCol } from "./firestore-helpers";
import type { AppRecord, FormField, FormFieldType, RecordStatus, UserRole } from "@/types";

export const statusLabels: Record<RecordStatus, string> = {
  rascunho: "Rascunho",
  pendente: "Em Análise",
  aprovado: "Em Andamento",
  rejeitado: "Reprovado",
  reajuste: "Aguardando Reajuste",
};

export const statusVariant: Record<RecordStatus, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  rascunho: "secondary",
  pendente: "warning",
  aprovado: "success",
  rejeitado: "destructive",
  reajuste: "warning",
};

export function fieldValue(r: AppRecord, key: string): string {
  const v = r.data?.[key];
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export const DEFAULT_FORM_ID = "default";

export const DEFAULT_FORM_SEED_FIELDS: Omit<FormField, "id" | "order">[] = [
  { key: "instalacao", type: "texto", label: "Instalação", required: true },
  { key: "sistema", type: "texto", label: "Sistema", required: true },
  { key: "equipamento", type: "texto", label: "Equipamento", required: true },
  { key: "tipo_equipamento", type: "texto", label: "Tipo de Equipamento" },
  { key: "gerencia", type: "texto", label: "Gerência", required: true },
  { key: "data", type: "data", label: "Data", required: true },
  { key: "situacao_identificada", type: "textarea", label: "Situação Identificada" },
  { key: "anexo", type: "anexo", label: "Upload de Arquivos" },
];

/** Firestore rejects `undefined` field values; strip them (arrays/objects included) before any write. */
export function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForFirestore(v)) as unknown as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = sanitizeForFirestore(v);
    }
    return out as T;
  }
  return value;
}

interface LogErrorContext {
  fn: string;
  field?: string;
  payload?: unknown;
}

export function logFirestoreError(context: LogErrorContext, error: unknown) {
  const err = error as { code?: string; message?: string; stack?: string };
  console.error(
    `[${context.fn}] falha${context.field ? ` no campo "${context.field}"` : ""}: ${err?.message || String(error)}`,
    {
      function: context.fn,
      field: context.field,
      code: err?.code,
      message: err?.message,
      stack: err?.stack,
      payload: context.payload,
    }
  );
}

export const fieldTypeLabels: Record<FormFieldType, string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  hora: "Hora",
  selecao: "Select",
  multipla_escolha: "Multi Select",
  checkbox: "Checkbox",
  radio: "Radio",
  textarea: "Textarea",
  anexo: "Upload",
  email: "Email",
  telefone: "Telefone",
};

export const optionBasedTypes: FormFieldType[] = ["selecao", "multipla_escolha", "radio"];

export const roleLabels: Record<UserRole, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  tecnico: "Técnico de Operações",
  visualizador: "Visualizador",
};

/** Routes each role may access. `null` = all authenticated users. Used by both sidebar and route-guard. */
export const allowedRoutesByRole: Record<UserRole, string[] | null> = {
  admin: null,
  gerente: ["/dashboard", "/records", "/records/new", "/forms", "/approvals", "/profile", "/email", "/sharepoint", "/audit"],
  visualizador: ["/dashboard", "/records", "/profile", "/audit"],
  tecnico: ["/dashboard", "/records", "/records/new", "/profile", "/audit"],
};

export function isRouteAllowed(role: UserRole | undefined, pathname: string): boolean {
  if (!role) return false;
  const allowed = allowedRoutesByRole[role];
  if (!allowed) return true;
  return allowed.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

export function slugifyKey(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "campo"
  );
}

export function applyMask(value: string, mask: string): string {
  const digits = value.replace(/\D/g, "");
  let result = "";
  let digitIndex = 0;
  for (const ch of mask) {
    if (digitIndex >= digits.length) break;
    if (ch === "9") {
      result += digits[digitIndex];
      digitIndex += 1;
    } else {
      result += ch;
    }
  }
  return result;
}

export async function recordNumberExists(recordNumber: string, excludeId?: string): Promise<boolean> {
  const snap = await getDocs(query(recordsCol(), where("recordNumber", "==", recordNumber)));
  return snap.docs.some((d) => d.id !== excludeId && !(d.data() as AppRecord).deletedAt);
}

/** Per-year counter doc id, e.g. "recordCounter_2026". Resets naturally each year. */
function recordCounterId(year: number): string {
  return `recordCounter_${year}`;
}

function recordCounterRef(year: number) {
  return doc(db, "settings", recordCounterId(year));
}

/** Format: zero-padded 3-digit sequence + "/" + year, e.g. "001/2026", "130/2026". */
export function formatRecordNumber(seq: number, year: number): string {
  return `${String(seq).padStart(3, "0")}/${year}`;
}

/**
 * Reorders "NNN/YYYY" to "YYYY-NNN" so plain string comparison sorts
 * chronologically — "NNN/YYYY" alone doesn't (e.g. "999/2026" > "100/2027"
 * lexicographically, the wrong order). Falls back to the raw value for
 * legacy/malformed numbers so they still sort somewhere, just not specially.
 */
export function recordNumberSortValue(recordNumber?: string): string {
  const raw = recordNumber?.trim() || "";
  const m = /^(\d+)\/(\d{4})$/.exec(raw);
  return m ? `${m[2]}-${m[1].padStart(3, "0")}` : raw;
}

/** Matches both the current "NNN/YYYY" format and the legacy bare "NNNN" format. */
const RECORD_NUMBER_PATTERN = /^(\d+)(?:\/(\d{4}))?$/;

/**
 * Scans existing records to find the highest sequence number already used
 * for `year`. Legacy records (created before the "NNN/YYYY" format existed)
 * have no year suffix, so their year is inferred from `createdAt`. Used only
 * to seed a year's counter the first time it's needed, so numbering
 * continues from wherever it left off instead of restarting at 1.
 */
async function findHighestExistingSequence(year: number): Promise<number> {
  const snap = await getDocs(recordsCol());
  let max = 0;
  for (const docSnap of snap.docs) {
    const r = docSnap.data() as AppRecord;
    const raw = r.recordNumber?.trim();
    if (!raw) continue;
    const m = RECORD_NUMBER_PATTERN.exec(raw);
    if (!m) continue;
    const seq = parseInt(m[1], 10);
    if (Number.isNaN(seq)) continue;
    const recYear = m[2] ? parseInt(m[2], 10) : r.createdAt ? new Date(r.createdAt).getFullYear() : year;
    if (recYear === year && seq > max) max = seq;
  }
  return max;
}

/**
 * Ensures `settings/recordCounter_{year}` exists before it's incremented.
 * Seeds it (once) from the highest sequence number already in use for that
 * year, so the first flow of a year continues the existing sequence rather
 * than restarting at 1. Safe under concurrency: the seed itself is only
 * committed inside a transaction that re-checks existence, so a race between
 * two first-callers converges on the same seed instead of overwriting a
 * counter that has already advanced.
 */
async function ensureCounterSeeded(year: number): Promise<void> {
  const counterRef = recordCounterRef(year);
  const existing = await getDoc(counterRef);
  if (existing.exists()) return;
  const seed = await findHighestExistingSequence(year);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    if (!snap.exists()) tx.set(counterRef, { value: seed, year });
  });
}

/**
 * Next sequential flow number for the current year ("NNN/YYYY"). Uses a
 * Firestore transaction on a per-year counter doc so concurrent submissions
 * from different users never collide or skip — the transaction retries
 * automatically on contention. No fallback: if the counter write fails, the
 * caller must surface the error rather than silently minting a
 * non-sequential/non-unique number.
 */
export async function getNextRecordNumber(): Promise<string> {
  const year = new Date().getFullYear();
  await ensureCounterSeeded(year);
  const counterRef = recordCounterRef(year);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? (snap.data().value as number) : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next, year }, { merge: true });
    return next;
  });
  return formatRecordNumber(seq, year);
}

/**
 * Reserves `count` consecutive numbers in ONE transaction (a single
 * counter read-modify-write instead of one transaction per row). Used by
 * bulk import, where rows are later persisted via a batched write: this
 * keeps the reservation itself atomic/gap-free under concurrency, though a
 * batch failure after reservation still forfeits that block — acceptable
 * for a rare, admin-only bulk operation, unlike the single-flow submission
 * path above which guarantees full record+number atomicity.
 */
export async function reserveSequentialNumbers(count: number): Promise<string[]> {
  if (count <= 0) return [];
  const year = new Date().getFullYear();
  await ensureCounterSeeded(year);
  const counterRef = recordCounterRef(year);
  const start = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? (snap.data().value as number) : 0;
    tx.set(counterRef, { value: current + count, year }, { merge: true });
    return current + 1;
  });
  return Array.from({ length: count }, (_, i) => formatRecordNumber(start + i, year));
}

/**
 * Atomically allocates the next sequential number AND persists the record +
 * its approval doc in the same Firestore transaction. This is the only path
 * allowed to consume a number: if the record/approval write is rejected for
 * any reason, the whole transaction (including the counter increment) is
 * rolled back, so no number is ever wasted and no half-created record is
 * left behind (previously, the number was consumed by a separate call before
 * the record write, so a failed write silently burned a number and left an
 * invisible orphaned draft).
 */
export async function createRecordWithSequentialNumber(
  draftId: string,
  buildRecordPayload: (recordNumber: string) => Record<string, unknown>,
  buildApprovalPayload: (recordNumber: string) => Record<string, unknown>
): Promise<string> {
  const year = new Date().getFullYear();
  await ensureCounterSeeded(year);
  const counterRef = recordCounterRef(year);
  const recordRef = doc(db, "records", draftId);
  const approvalRef = doc(db, "approvals", draftId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? (snap.data().value as number) : 0;
    const next = current + 1;
    const recordNumber = formatRecordNumber(next, year);
    tx.set(counterRef, { value: next, year }, { merge: true });
    tx.set(recordRef, sanitizeForFirestore(buildRecordPayload(recordNumber)), { merge: true });
    tx.set(approvalRef, sanitizeForFirestore(buildApprovalPayload(recordNumber)));
    return recordNumber;
  });
}

/**
 * Atomically persists the record + its approval doc for a flow that already
 * has a fixed number (admin manual entry, or a resubmission after
 * "Aguardando Reajuste" that keeps its original number). Doesn't touch the
 * sequential counter, so it carries no number-waste risk, but still keeps
 * the record and its approval in sync as a single all-or-nothing write.
 */
export async function saveRecordWithFixedNumber(
  draftId: string,
  recordNumber: string,
  buildRecordPayload: (recordNumber: string) => Record<string, unknown>,
  buildApprovalPayload: (recordNumber: string) => Record<string, unknown>
): Promise<void> {
  const recordRef = doc(db, "records", draftId);
  const approvalRef = doc(db, "approvals", draftId);
  await runTransaction(db, async (tx) => {
    tx.set(recordRef, sanitizeForFirestore(buildRecordPayload(recordNumber)), { merge: true });
    tx.set(approvalRef, sanitizeForFirestore(buildApprovalPayload(recordNumber)));
  });
}

const RECORD_NUMBER_FORMAT_MIGRATION_FLAG = "recordNumberFormatMigration";

/** Bare digits only, no "/YYYY" suffix — the format used before "NNN/YYYY" existed. */
const LEGACY_BARE_RECORD_NUMBER = /^\d+$/;

/**
 * One-time, idempotent migration: reformats every record still on the old
 * bare "NNNN" number (e.g. "0001") to "NNN/YYYY", using that record's own
 * `createdAt` year — it re-labels the existing sequence value, it does NOT
 * renumber/reassign anything, so no record's relative order or identity
 * changes and no data is lost. A `settings` flag doc marks completion so it
 * never re-scans (or re-writes) once done; safe to call on every load in
 * the meantime since re-running it before completion just re-derives the
 * same target value for the same records (no-op on retry/race).
 */
export async function migrateLegacyRecordNumbers(): Promise<void> {
  const flagRef = doc(db, "settings", RECORD_NUMBER_FORMAT_MIGRATION_FLAG);
  const already = await getDoc(flagRef);
  if (already.exists()) return;

  const snap = await getDocs(recordsCol());
  let batch = writeBatch(db);
  let opsInBatch = 0;
  const now = new Date().toISOString();

  for (const docSnap of snap.docs) {
    const r = docSnap.data() as AppRecord;
    const raw = r.recordNumber?.trim();
    if (!raw || !LEGACY_BARE_RECORD_NUMBER.test(raw)) continue;
    const seq = parseInt(raw, 10);
    if (Number.isNaN(seq)) continue;
    const year = r.createdAt ? new Date(r.createdAt).getFullYear() : new Date().getFullYear();
    batch.update(doc(db, "records", docSnap.id), {
      recordNumber: formatRecordNumber(seq, year),
      updatedAt: now,
    });
    opsInBatch += 1;
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();

  await setDoc(flagRef, { completedAt: now }, { merge: true });
}
