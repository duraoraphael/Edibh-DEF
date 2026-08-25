"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { toast } from "sonner";
import { ChevronsUpDown, Loader2, Paperclip, Search, UploadCloud, X } from "lucide-react";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_FORM_ID,
  applyMask,
  createRecordWithSequentialNumber,
  getFirebaseErrorMessage,
  logFirestoreError,
  recordNumberExists,
  saveRecordWithFixedNumber,
  sanitizeForFirestore,
} from "@/lib/forms";
import { createNotifications, getUserIdsByRoles, writeAuditLog } from "@/lib/firestore-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AppRecord, AttachmentRef, FormDefinition, FormField, RecordStatus } from "@/types";

function SectionCard({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
          {number}
        </div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="h-px w-full bg-border" />
      <div className="mt-6">{children}</div>
    </Card>
  );
}

function defaultValueFor(field: FormField): unknown {
  if (field.type === "checkbox") return false;
  if (field.type === "multipla_escolha") return [] as string[];
  return "";
}

/** Backfills `id` on attachments saved before it existed, so keys/removal stay unique even for same-named files. */
function withAttachmentIds(list: AttachmentRef[]): AttachmentRef[] {
  return list.map((a) => (a.id ? a : { ...a, id: crypto.randomUUID() }));
}

export default function NewRecordPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [draftId] = useState(() => {
    if (editId) return editId;
    if (typeof window === "undefined") return crypto.randomUUID();
    const existing = window.localStorage.getItem("edibh_draft_id");
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem("edibh_draft_id", id);
    return id;
  });

  const [activeForm, setActiveForm] = useState<FormDefinition | null>(null);
  const [formsLoading, setFormsLoading] = useState(true);
  // When editing an existing record, values/attachments are populated from
  // Firestore in the effect below. Otherwise, restore any locally saved
  // draft synchronously on first render.
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (editId || typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(`edibh_draft_${draftId}`);
    if (!raw) return {};
    try {
      return JSON.parse(raw).values ?? {};
    } catch {
      return {};
    }
  });
  const [attachments, setAttachments] = useState<AttachmentRef[]>(() => {
    if (editId || typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(`edibh_draft_${draftId}`);
    if (!raw) return [];
    try {
      return withAttachmentIds(JSON.parse(raw).attachments ?? []);
    } catch {
      return [];
    }
  });
  const [existingRecordNumber, setExistingRecordNumber] = useState<string | undefined>();
  // When editing a record that was already submitted, autosave must not
  // downgrade its status back to "rascunho" (which would hide it from the
  // Histórico "Ativos" view) nor overwrite its original createdAt.
  const [existingStatus, setExistingStatus] = useState<RecordStatus | null>(null);
  const [existingCreatedAt, setExistingCreatedAt] = useState<string | null>(null);
  // The original creator is immutable once a record exists in Firestore: it
  // is only ever set on first creation, never reassigned to whoever is
  // currently editing (admin/gerente included).
  const [existingAuthorId, setExistingAuthorId] = useState<string | null>(null);
  const [existingAuthorName, setExistingAuthorName] = useState<string | null>(null);
  const [manualRecordNumber, setManualRecordNumber] = useState("");
  const isAdmin = profile?.role === "admin";
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  // Display label for each in-flight generic upload, keyed by the same id as
  // uploadProgress (not by filename, since two files can share a name).
  const [uploadFileNames, setUploadFileNames] = useState<Record<string, string>>({});
  const [dragActive, setDragActive] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "formFields", DEFAULT_FORM_ID),
      (snap) => {
        const form = snap.exists() ? (snap.data() as FormDefinition) : null;
        setActiveForm(form);
        setFormsLoading(false);
        // Fill in defaults for any fields that don't have a value yet. Done
        // here (inside the subscription callback) rather than in a separate
        // effect so this only runs when the form actually changes.
        if (form) {
          setValues((prev) => {
            const next = { ...prev };
            for (const field of form.fields) {
              if (!(field.key in next)) next[field.key] = defaultValueFor(field);
            }
            return next;
          });
        }
      },
      (error) => {
        logFirestoreError({ fn: "NewRecordPage:loadForm" }, error);
        setFormsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    // Always check whether this draft/record already exists in Firestore, so
    // the original creator is picked up even when resuming a locally-saved
    // draft (editId unset but the doc already has an authorId). Field/attachment
    // values are only restored from Firestore when explicitly editing (?id=),
    // otherwise the locally-saved draft state (set at useState init) wins.
    getDoc(doc(db, "records", draftId)).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as AppRecord;
      if (editId) {
        setValues(data.data || {});
        setAttachments(withAttachmentIds(data.attachments || []));
      }
      setExistingRecordNumber(data.recordNumber);
      setExistingStatus(data.status ?? null);
      setExistingCreatedAt(data.createdAt ?? null);
      setExistingAuthorId(data.authorId ?? null);
      setExistingAuthorName(data.authorName ?? null);
      setManualRecordNumber(data.recordNumber || "");
    });
  }, [draftId, editId]);

  const persistDraft = useCallback(
    async (nextValues: Record<string, unknown>, atts: AttachmentRef[]) => {
      window.localStorage.setItem(
        `edibh_draft_${draftId}`,
        JSON.stringify({ values: nextValues, attachments: atts })
      );
      if (!user) return;
      setSavingDraft(true);
      // When editing an already-submitted record, keep its current status and
      // original createdAt so an autosave never turns it back into a rascunho
      // (which would hide it from the Histórico "Ativos" list) or reset its date.
      const isEditingExisting = !!editId && !!existingStatus;
      const payload = sanitizeForFirestore({
        status: isEditingExisting ? existingStatus : ("rascunho" as const),
        authorId: existingAuthorId ?? user.uid,
        authorName: existingAuthorName ?? profile?.name ?? "Usuário",
        attachments: atts,
        formId: activeForm?.id || null,
        data: nextValues,
        updatedAt: new Date().toISOString(),
        createdAt: existingCreatedAt ?? new Date().toISOString(),
      });
      try {
        await setDoc(doc(db, "records", draftId), payload, { merge: true });
        setSavedAt(new Date());
      } catch (error) {
        logFirestoreError({ fn: "persistDraft", payload }, error);
      } finally {
        setSavingDraft(false);
      }
    },
    [draftId, user, profile, activeForm, editId, existingStatus, existingCreatedAt, existingAuthorId, existingAuthorName]
  );

  function updateValue(field: FormField, raw: unknown) {
    let value = raw;
    if (typeof raw === "string" && field.mask) value = applyMask(raw, field.mask);
    const next = { ...values, [field.key]: value };
    for (const f of activeForm?.fields || []) {
      if (f.dependsOnFieldId === field.id) next[f.key] = defaultValueFor(f);
    }
    setValues(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (isParameterField(field)) {
      window.localStorage.setItem(
        `edibh_draft_${draftId}`,
        JSON.stringify({ values: next, attachments })
      );
    }
    debounceRef.current = setTimeout(() => persistDraft(next, attachments), 800);
  }

  async function handleFieldFile(field: FormField, file: File | null) {
    if (!file || !user) return;
    // Use a random id instead of Date.now() to keep this function pure for
    // React's compiler-purity checks and avoid any (unlikely) path collision.
    const path = `attachments/${user.uid}/${draftId}/${field.key}_${crypto.randomUUID()}_${file.name}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setUploadProgress((p) => ({ ...p, [field.key]: pct }));
      },
      () => toast.error(`Falha ao enviar ${file.name}`),
      async () => {
        const url = await getDownloadURL(storageRef);
        updateValue(field, url);
        setUploadProgress((p) => {
          const rest = { ...p };
          delete rest[field.key];
          return rest;
        });
      }
    );
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !user) return;
    const list = Array.from(files);
    for (const file of list) {
      // A per-upload id (not the filename) tracks progress and identifies the
      // resulting attachment — two files can share a name (e.g. "IMG_001.jpg"
      // from a phone camera), which previously caused duplicate React keys
      // and made removing one attachment remove every same-named one.
      const id = crypto.randomUUID();
      const path = `attachments/${user.uid}/${draftId}/${id}_${file.name}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      setUploadFileNames((p) => ({ ...p, [id]: file.name }));
      task.on(
        "state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setUploadProgress((p) => ({ ...p, [id]: pct }));
        },
        () => {
          toast.error(`Falha ao enviar ${file.name}`);
          setUploadProgress((p) => {
            const rest = { ...p };
            delete rest[id];
            return rest;
          });
          setUploadFileNames((p) => {
            const rest = { ...p };
            delete rest[id];
            return rest;
          });
        },
        async () => {
          const url = await getDownloadURL(storageRef);
          setAttachments((prev) => {
            const next = [...prev, { id, name: file.name, url, size: file.size, contentType: file.type }];
            persistDraft(values, next);
            return next;
          });
          setUploadProgress((p) => {
            const rest = { ...p };
            delete rest[id];
            return rest;
          });
          setUploadFileNames((p) => {
            const rest = { ...p };
            delete rest[id];
            return rest;
          });
        }
      );
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.id !== id);
      persistDraft(values, next);
      return next;
    });
  }

  function validateForm(): boolean {
    for (const field of activeForm?.fields || []) {
      const value = values[field.key];
      if (field.required) {
        const empty =
          value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0) ||
          (field.type === "checkbox" && value !== true);
        if (empty) {
          toast.error(`Preencha o campo obrigatório: ${field.label}`);
          return false;
        }
      }
      if (field.validation && typeof value === "string" && value) {
        try {
          if (!new RegExp(field.validation).test(value)) {
            toast.error(`Valor inválido para o campo: ${field.label}`);
            return false;
          }
        } catch {}
      }
    }
    return true;
  }

  async function handleSubmit() {
    if (!validateForm()) return;
    if (!user) {
      toast.error("Sessão expirada. Faça login novamente para enviar o registro.");
      return;
    }
    setSubmitting(true);
    try {
      const typed = manualRecordNumber.trim();
      const authorId = existingAuthorId ?? user.uid;
      const authorName = existingAuthorName ?? profile?.name ?? "Usuário";
      const buildRecordPayload = (recordNumber: string) => ({
        recordNumber,
        status: "pendente" as const,
        authorId,
        authorName,
        attachments,
        formId: activeForm?.id || null,
        data: values,
        updatedAt: new Date().toISOString(),
        createdAt: existingCreatedAt ?? new Date().toISOString(),
      });
      const buildApprovalPayload = (recordNumber: string) => ({
        recordId: draftId,
        recordNumber,
        authorId,
        status: "pendente" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Assigning a sequential number and persisting the record + its
      // approval doc happens in ONE atomic transaction (see forms.ts): if
      // the write is rejected for any reason, the number is never consumed
      // and nothing is left half-created.
      let recordNumber: string;
      if (isAdmin && typed) {
        if (typed !== existingRecordNumber && (await recordNumberExists(typed, draftId))) {
          toast.error(`O número de fluxo "${typed}" já está em uso. Informe outro número.`);
          setSubmitting(false);
          return;
        }
        recordNumber = typed;
        await saveRecordWithFixedNumber(draftId, recordNumber, buildRecordPayload, buildApprovalPayload);
      } else if (existingRecordNumber) {
        recordNumber = existingRecordNumber;
        await saveRecordWithFixedNumber(draftId, recordNumber, buildRecordPayload, buildApprovalPayload);
      } else {
        recordNumber = await createRecordWithSequentialNumber(draftId, buildRecordPayload, buildApprovalPayload);
      }

      try {
        await writeAuditLog(
          { uid: user.uid, name: profile?.name || "Usuário", role: profile?.role },
          {
            action: editId ? "Reenviado após reajuste" : "Criado",
            recordId: draftId,
            recordNumber,
            statusBefore: editId ? "reajuste" : "",
            statusAfter: "pendente",
          }
        );
      } catch (error) {
        logFirestoreError({ fn: "handleSubmit:writeAuditLog" }, error);
      }

      try {
        const approverIds = await getUserIdsByRoles(["admin", "gerente"]);
        await createNotifications(approverIds, {
          type: "aprovacao_pendente",
          title: "Aprovação pendente",
          message: `Registro ${recordNumber} aguarda análise`,
          recordId: draftId,
          recordNumber,
          href: "/approvals",
        });
      } catch (error) {
        logFirestoreError({ fn: "handleSubmit:createNotifications" }, error);
      }

      window.localStorage.removeItem(`edibh_draft_${draftId}`);
      window.localStorage.removeItem("edibh_draft_id");
      toast.success(`Registro ${recordNumber} enviado para aprovação`);
      router.push("/records");
    } catch (error) {
      logFirestoreError({ fn: "handleSubmit" }, error);
      toast.error(getFirebaseErrorMessage(error, "Não foi possível enviar o registro."));
    } finally {
      setSubmitting(false);
    }
  }

  const fields = (activeForm?.fields || []).slice().sort((a, b) => a.order - b.order);
  const generalFields = fields.filter((f) => f.type !== "textarea" && f.type !== "anexo");
  const textFields = fields.filter((f) => f.type === "textarea");
  const uploadFields = fields.filter((f) => f.type === "anexo");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Novo Fluxo de Equipamentos Críticos</h1>
        <p className="text-sm text-muted-foreground">
          {activeForm ? `Formulário: ${activeForm.name}` : "Preencha as seções abaixo para criar um novo registro"}
        </p>
      </div>

      {!formsLoading && !activeForm && (
        <Card className="p-6 text-sm text-muted-foreground">
          Nenhum formulário configurado. Peça a um administrador para criar um formulário na aba Formulários.
        </Card>
      )}

      <SectionCard number={1} title="Dados Gerais">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-record-number">Número do Fluxo</Label>
              <Input
                id="manual-record-number"
                value={manualRecordNumber}
                onChange={(e) => setManualRecordNumber(e.target.value)}
                placeholder="Deixe em branco para gerar automaticamente"
              />
              <p className="text-xs text-muted-foreground">
                Opcional. Se não informado, o próximo número sequencial será gerado automaticamente.
              </p>
            </div>
          )}
          {generalFields.map((field) => (
            <div key={field.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor={field.id}>{field.label}</Label>
                {field.required && <Badge>OBRIGATÓRIO</Badge>}
              </div>
              <DynamicField
                field={field}
                value={values[field.key]}
                onChange={(v) => updateValue(field, v)}
                allFields={fields}
                values={values}
              />
              {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
            </div>
          ))}
        </div>
      </SectionCard>

      {textFields.length > 0 && (
        <SectionCard number={2} title="Ocorrência">
          <div className="flex flex-col gap-5">
            {textFields.map((field) => {
              const value = (values[field.key] as string) || "";
              return (
                <div key={field.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={field.id}>{field.label}</Label>
                    {field.required && <Badge>OBRIGATÓRIO</Badge>}
                  </div>
                  <Textarea
                    id={field.id}
                    value={value}
                    onChange={(e) => updateValue(field, e.target.value)}
                    placeholder={field.placeholder}
                    rows={5}
                  />
                  {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard number={textFields.length > 0 ? 3 : 2} title="Anexos">
        <div className="flex flex-col gap-6">
          {uploadFields.map((field) => (
            <div key={field.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Label>{field.label}</Label>
                {field.required && <Badge>OBRIGATÓRIO</Badge>}
              </div>
              <input
                type="file"
                onChange={(e) => handleFieldFile(field, e.target.files?.[0] || null)}
                className="text-sm"
              />
              {uploadProgress[field.key] !== undefined && <Progress value={uploadProgress[field.key]} />}
              {typeof values[field.key] === "string" && values[field.key] ? (
                <a
                  href={values[field.key] as string}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Arquivo enviado
                </a>
              ) : null}
            </div>
          ))}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-12 text-center transition-colors",
              dragActive ? "border-primary bg-primary-50" : "border-border hover:bg-muted/50"
            )}
          >
            <UploadCloud className="h-10 w-10 text-primary" />
            <p className="text-sm font-medium">Arraste arquivos aqui</p>
            <p className="text-xs text-muted-foreground">ou clique para selecionar</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {Object.entries(uploadProgress)
            .filter(([key]) => !uploadFields.some((f) => f.key === key))
            .map(([id, pct]) => (
              <div key={id} className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{uploadFileNames[id] || "Enviando..."}</p>
                <Progress value={pct} />
              </div>
            ))}

          {attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{a.name}</span>
                  </div>
                  <button onClick={() => removeAttachment(a.id)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {savingDraft ? "Salvando rascunho..." : savedAt ? `Rascunho salvo às ${savedAt.toLocaleTimeString()}` : ""}
        </p>
        <Button onClick={handleSubmit} disabled={submitting} size="lg">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Enviar para aprovação
        </Button>
      </div>
    </div>
  );
}

function sortOptions(options?: string[]): string[] {
  return Array.from(new Set(options || [])).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function resolveOptions(field: FormField, allFields?: FormField[], values?: Record<string, unknown>): string[] {
  if (field.dependsOnFieldId && field.optionsByParentValue) {
    const parentValue = values?.[allFields?.find((f) => f.id === field.dependsOnFieldId)?.key || ""];
    if (typeof parentValue === "string" && parentValue) {
      return sortOptions(field.optionsByParentValue[parentValue]);
    }
    return [];
  }
  return sortOptions(field.options);
}

function isParameterField(field: FormField): boolean {
  return field.label.trim().localeCompare("Parâmetro", "pt-BR", { sensitivity: "base" }) === 0;
}

function ParameterMultiSelect({
  field,
  value,
  options,
  onChange,
}: {
  field: FormField;
  value: unknown;
  options: string[];
  onChange: (value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string" && value
      ? [value]
      : [];
  const visibleTags = selected.slice(0, 2);
  const hiddenCount = selected.length - visibleTags.length;
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filteredOptions = normalizedQuery
    ? options.filter((option) => option.toLocaleLowerCase("pt-BR").includes(normalizedQuery))
    : options;

  function toggle(option: string) {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
  }

  function remove(option: string) {
    onChange(selected.filter((item) => item !== option));
  }

  return (
    <div className="min-w-0 space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={field.id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={`${field.label}: ${selected.length} selecionados`}
            className="h-10 w-full justify-between border-border bg-white px-3 font-normal shadow-sm hover:bg-white"
          >
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
              {selected.length === 0
                ? field.placeholder || "Selecione os parâmetros"
                : `${selected.length} selecionado${selected.length === 1 ? "" : "s"}`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={16}
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden p-0 shadow-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && filteredOptions.length) {
                  event.preventDefault();
                  optionRefs.current[0]?.focus();
                }
              }}
              placeholder="Pesquisar parâmetro..."
              aria-label="Pesquisar parâmetro"
              className="h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1" role="group" aria-label="Parâmetros disponíveis">
            {filteredOptions.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum parâmetro encontrado.</p>
            )}
            {filteredOptions.map((option, index) => {
              const checked = selected.includes(option);
              return (
                <button
                  ref={(node) => { optionRefs.current[index] = node; }}
                  key={`${field.id}-parameter-${option}`}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(option)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      optionRefs.current[index + 1]?.focus();
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (index === 0) searchRef.current?.focus();
                      else optionRefs.current[index - 1]?.focus();
                    }
                  }}
                  className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-primary-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                >
                  <Checkbox checked={checked} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
                  <span className="flex-1">{option}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground" aria-live="polite">
              {selected.length} selecionado{selected.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])} disabled={!selected.length}>
                Limpar
              </Button>
              <Button type="button" size="sm" onClick={() => setOpen(false)}>
                Concluir
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Parâmetros selecionados">
          {visibleTags.map((option) => (
            <Badge key={option} variant="success" className="max-w-full gap-1 py-1 pl-2.5 pr-1">
              <span className="truncate">{option}</span>
              <button
                type="button"
                onClick={() => remove(option)}
                className="rounded-full p-0.5 text-primary-700 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`Remover ${option}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
          {hiddenCount > 0 && <Badge variant="secondary">+{hiddenCount}</Badge>}
        </div>
      )}
    </div>
  );
}

function DynamicField({
  field,
  value,
  onChange,
  allFields,
  values,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  allFields?: FormField[];
  values?: Record<string, unknown>;
}) {
  const options = resolveOptions(field, allFields, values);
  switch (field.type) {
    case "numero":
      return (
        <Input
          type="number"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
    case "data":
      return <Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "hora":
      return <Input type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "email":
      return (
        <Input
          type="email"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
    case "telefone":
      return (
        <Input
          type="tel"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.placeholder || "Confirmar"}
        </label>
      );
    case "selecao":
      return (
        <Select value={(value as string) || undefined} onValueChange={(v) => onChange(v)}>
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder || "Selecione"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o, index) => (
              <SelectItem key={`${field.id}-option-${index}`} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "radio":
      return (
        <div className="flex flex-col gap-1.5">
          {options.map((o, index) => (
            <label key={`${field.id}-radio-${index}`} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={field.id}
                checked={value === o}
                onChange={() => onChange(o)}
              />
              {o}
            </label>
          ))}
        </div>
      );
    case "multipla_escolha": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      if (isParameterField(field)) {
        return <ParameterMultiSelect field={field} value={value} options={options} onChange={onChange} />;
      }
      return (
        <div className="flex flex-col gap-1.5">
          {options.map((o, index) => (
            <label key={`${field.id}-checkbox-${index}`} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))
                }
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    default:
      return (
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
  }
}
