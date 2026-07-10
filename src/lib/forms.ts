import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import type { FormField, FormFieldType, UserRole } from "@/types";

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
  gerente: null,
  visualizador: null,
  tecnico: ["/dashboard", "/records", "/records/new", "/profile"],
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

export async function getNextRecordNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = doc(db, "settings", `counter_${year}`);
  try {
    const seq = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists() ? (snap.data().value as number) : 0;
      const next = current + 1;
      tx.set(counterRef, { value: next, year }, { merge: true });
      return next;
    });
    return `${String(seq).padStart(2, "0")}/${year}`;
  } catch (error) {
    logFirestoreError({ fn: "getNextRecordNumber", payload: { counterPath: `settings/counter_${year}` } }, error);
    // Do not block record persistence if the shared counter is unreachable
    // (e.g. permission issue on the "settings" collection). Fall back to a
    // timestamp-based number so the record is still saved.
    return `${Date.now()}/${year}`;
  }
}
