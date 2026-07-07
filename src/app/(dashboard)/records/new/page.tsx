"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { toast } from "sonner";
import { Loader2, Paperclip, UploadCloud, X } from "lucide-react";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_FORM_ID,
  applyMask,
  getNextRecordNumber,
  logFirestoreError,
  sanitizeForFirestore,
} from "@/lib/forms";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AppRecord, AttachmentRef, FormDefinition, FormField } from "@/types";

const TEXTAREA_LIMIT = 1000;

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
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const [existingRecordNumber, setExistingRecordNumber] = useState<string | undefined>();
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
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
        setActiveForm(snap.exists() ? (snap.data() as FormDefinition) : null);
        setFormsLoading(false);
      },
      (error) => {
        logFirestoreError({ fn: "NewRecordPage:loadForm" }, error);
        setFormsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!activeForm) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const field of activeForm.fields) {
        if (!(field.key in next)) next[field.key] = defaultValueFor(field);
      }
      return next;
    });
  }, [activeForm]);

  useEffect(() => {
    if (editId) {
      getDoc(doc(db, "records", editId)).then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as AppRecord;
        setTitle(data.title || "");
        setValues(data.data || {});
        setAttachments(data.attachments || []);
        setExistingRecordNumber(data.recordNumber);
      });
      return;
    }
    const raw = window.localStorage.getItem(`edibh_draft_${draftId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setTitle(parsed.title ?? "");
        setValues(parsed.values ?? {});
        setAttachments(parsed.attachments ?? []);
      } catch {}
    }
  }, [draftId, editId]);

  const persistDraft = useCallback(
    async (nextTitle: string, nextValues: Record<string, unknown>, atts: AttachmentRef[]) => {
      window.localStorage.setItem(
        `edibh_draft_${draftId}`,
        JSON.stringify({ title: nextTitle, values: nextValues, attachments: atts })
      );
      if (!user) return;
      setSavingDraft(true);
      const payload = sanitizeForFirestore({
        title: nextTitle || "Rascunho sem título",
        status: "rascunho" as const,
        authorId: user.uid,
        authorName: profile?.name || user.email || null,
        attachments: atts,
        formId: activeForm?.id || null,
        data: nextValues,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
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
    [draftId, user, profile, activeForm]
  );

  function updateTitle(value: string) {
    setTitle(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistDraft(value, values, attachments), 800);
  }

  function updateValue(field: FormField, raw: unknown) {
    let value = raw;
    if (typeof raw === "string" && field.mask) value = applyMask(raw, field.mask);
    const next = { ...values, [field.key]: value };
    setValues(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistDraft(title, next, attachments), 800);
  }

  async function handleFieldFile(field: FormField, file: File | null) {
    if (!file || !user) return;
    const path = `attachments/${user.uid}/${draftId}/${field.key}_${Date.now()}_${file.name}`;
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
      const path = `attachments/${user.uid}/${draftId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        "state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setUploadProgress((p) => ({ ...p, [file.name]: pct }));
        },
        () => {
          toast.error(`Falha ao enviar ${file.name}`);
        },
        async () => {
          const url = await getDownloadURL(storageRef);
          setAttachments((prev) => {
            const next = [...prev, { name: file.name, url, size: file.size, contentType: file.type }];
            persistDraft(title, values, next);
            return next;
          });
          setUploadProgress((p) => {
            const rest = { ...p };
            delete rest[file.name];
            return rest;
          });
        }
      );
    }
  }

  function removeAttachment(name: string) {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.name !== name);
      persistDraft(title, values, next);
      return next;
    });
  }

  function validateForm(): boolean {
    if (!title.trim()) {
      toast.error("Informe o título do registro");
      return false;
    }
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
    if (!user) return;
    setSubmitting(true);
    let recordNumber = existingRecordNumber;
    try {
      if (!recordNumber) {
        try {
          recordNumber = await getNextRecordNumber();
        } catch (error) {
          logFirestoreError({ fn: "handleSubmit:getNextRecordNumber" }, error);
          toast.error("Falha ao gerar o número do registro. Verifique as permissões do Firestore em settings/counter_*.");
          return;
        }
      }

      const recordPayload = sanitizeForFirestore({
        recordNumber,
        title,
        status: "pendente" as const,
        authorId: user.uid,
        authorName: profile?.name || user.email || null,
        attachments,
        formId: activeForm?.id || null,
        data: values,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      try {
        await setDoc(doc(db, "records", draftId), recordPayload, { merge: true });
      } catch (error) {
        logFirestoreError({ fn: "handleSubmit:setDoc(records)", payload: recordPayload }, error);
        toast.error("Falha ao salvar o registro. Veja o console para detalhes.");
        return;
      }

      const approvalPayload = sanitizeForFirestore({
        recordId: draftId,
        recordTitle: title,
        status: "pendente" as const,
        createdAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      try {
        await setDoc(doc(db, "approvals", draftId), approvalPayload);
      } catch (error) {
        logFirestoreError({ fn: "handleSubmit:setDoc(approvals)", payload: approvalPayload }, error);
        toast.error("Registro salvo, mas falhou ao criar a aprovação. Veja o console para detalhes.");
        return;
      }

      window.localStorage.removeItem(`edibh_draft_${draftId}`);
      window.localStorage.removeItem("edibh_draft_id");
      toast.success(`Registro ${recordNumber} enviado para aprovação`);
      router.push("/records");
    } catch (error) {
      logFirestoreError({ fn: "handleSubmit" }, error);
      toast.error("Erro ao enviar registro. Veja o console para detalhes.");
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
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="title">Título</Label>
              <Badge>OBRIGATÓRIO</Badge>
            </div>
            <Input id="title" value={title} onChange={(e) => updateTitle(e.target.value)} placeholder="Título do registro" />
          </div>
          {generalFields.map((field) => (
            <div key={field.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor={field.id}>{field.label}</Label>
                {field.required && <Badge>OBRIGATÓRIO</Badge>}
              </div>
              <DynamicField field={field} value={values[field.key]} onChange={(v) => updateValue(field, v)} />
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
                    onChange={(e) => updateValue(field, e.target.value.slice(0, TEXTAREA_LIMIT))}
                    placeholder={field.placeholder}
                    rows={5}
                    maxLength={TEXTAREA_LIMIT}
                  />
                  <span className="self-end text-xs text-muted-foreground">
                    {value.length}/{TEXTAREA_LIMIT}
                  </span>
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
            .map(([name, pct]) => (
              <div key={name} className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{name}</p>
                <Progress value={pct} />
              </div>
            ))}

          {attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              {attachments.map((a) => (
                <div key={a.name} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{a.name}</span>
                  </div>
                  <button onClick={() => removeAttachment(a.name)} className="text-muted-foreground hover:text-destructive">
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

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
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
            {(field.options || []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "radio":
      return (
        <div className="flex flex-col gap-1.5">
          {(field.options || []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
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
      return (
        <div className="flex flex-col gap-1.5">
          {(field.options || []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
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
