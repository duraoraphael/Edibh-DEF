"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import {
  Calendar,
  Check,
  Clock,
  Copy,
  FileSpreadsheet,
  GripVertical,
  Hash,
  ListChecks,
  Mail,
  Paperclip,
  Phone,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  DEFAULT_FORM_ID,
  DEFAULT_FORM_SEED_FIELDS,
  fieldTypeLabels,
  logFirestoreError,
  optionBasedTypes,
  sanitizeForFirestore,
  slugifyKey,
} from "@/lib/forms";
import type { FormDefinition, FormField, FormFieldType } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const fieldTypeIcons: Record<FormFieldType, typeof Type> = {
  texto: Type,
  numero: Hash,
  data: Calendar,
  hora: Clock,
  selecao: ListChecks,
  multipla_escolha: ListChecks,
  checkbox: Check,
  radio: ListChecks,
  textarea: FileSpreadsheet,
  anexo: Paperclip,
  email: Mail,
  telefone: Phone,
};

export default function FormsManagerPage() {
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FormFieldType>("texto");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "formFields", DEFAULT_FORM_ID),
      async (snap) => {
        if (snap.exists()) {
          setForm(snap.data() as FormDefinition);
          setLoading(false);
          return;
        }
        if (seeded.current) {
          setLoading(false);
          return;
        }
        seeded.current = true;
        const seededFields: FormField[] = DEFAULT_FORM_SEED_FIELDS.map((f, i) => ({
          ...f,
          id: crypto.randomUUID(),
          order: i,
        }));
        const initial = sanitizeForFirestore({
          name: "Novo Registro",
          description: "Campos exibidos na tela Novo Registro",
          fields: seededFields,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        try {
          await setDoc(doc(db, "formFields", DEFAULT_FORM_ID), initial);
        } catch (error) {
          logFirestoreError({ fn: "FormsManagerPage:seed", payload: initial }, error);
          toast.error("Não foi possível inicializar os campos padrão. Veja o console.");
        }
        setLoading(false);
      },
      (error) => {
        logFirestoreError({ fn: "FormsManagerPage:subscribe" }, error);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  function persist(fields: FormField[]) {
    setForm((prev) => (prev ? { ...prev, fields } : prev));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const payload = sanitizeForFirestore({ fields, updatedAt: new Date().toISOString() });
      try {
        await setDoc(doc(db, "formFields", DEFAULT_FORM_ID), payload, { merge: true });
        toast.success("Campos salvos");
      } catch (error) {
        logFirestoreError({ fn: "FormsManagerPage:persist", payload }, error);
        toast.error("Erro ao salvar campos. Veja o console para detalhes.");
      }
    }, 500);
  }

  function addField() {
    if (!form) return;
    if (!newLabel.trim()) {
      toast.error("Informe o nome do campo");
      return;
    }
    const field: FormField = {
      id: crypto.randomUUID(),
      key: `${slugifyKey(newLabel)}_${form.fields.length}`,
      type: newType,
      label: newLabel.trim(),
      required: false,
      options: optionBasedTypes.includes(newType) ? ["Opção 1", "Opção 2"] : undefined,
      order: form.fields.length,
    };
    persist([...form.fields, field]);
    setAddOpen(false);
    setNewLabel("");
    setNewType("texto");
  }

  function updateField(id: string, patch: Partial<FormField>) {
    if (!form) return;
    persist(form.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeField(id: string) {
    if (!form) return;
    persist(
      form.fields
        .filter((f) => f.id !== id)
        .map((f, i) => ({ ...f, order: i }))
    );
    setDeleteTarget(null);
  }

  function duplicateField(id: string) {
    if (!form) return;
    const field = form.fields.find((f) => f.id === id);
    if (!field) return;
    persist([...form.fields, { ...field, id: crypto.randomUUID(), key: `${field.key}_copy`, order: form.fields.length }]);
  }

  function reorder(from: number, to: number) {
    if (!form) return;
    const next = [...form.fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next.map((f, i) => ({ ...f, order: i })));
  }

  const fields = (form?.fields || []).slice().sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formulários</h1>
          <p className="text-sm text-muted-foreground">Gerencie os campos exibidos na tela Novo Registro</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo Campo
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
          ) : fields.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-2 p-12 text-center">
                <p className="text-sm text-muted-foreground">Nenhum campo cadastrado ainda</p>
                <Button variant="outline" className="mt-2" onClick={() => setAddOpen(true)}>
                  + Novo Campo
                </Button>
              </CardContent>
            </Card>
          ) : (
            fields.map((field, index) => {
              const Icon = fieldTypeIcons[field.type];
              return (
                <Card
                  key={field.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== index) reorder(dragIndex, index);
                    setDragIndex(null);
                  }}
                >
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                        className="flex-1"
                      />
                      <Select
                        value={field.type}
                        onValueChange={(v: FormFieldType) =>
                          updateField(field.id, {
                            type: v,
                            options: optionBasedTypes.includes(v) ? field.options || ["Opção 1", "Opção 2"] : undefined,
                          })
                        }
                      >
                        <SelectTrigger className="w-40 shrink-0">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(fieldTypeLabels) as FormFieldType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {fieldTypeLabels[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => duplicateField(field.id)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(field.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="Placeholder"
                        value={field.placeholder || ""}
                        onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                      />
                      <Input
                        placeholder="Texto de ajuda / descrição"
                        value={field.helpText || ""}
                        onChange={(e) => updateField(field.id, { helpText: e.target.value })}
                      />
                      {(field.type === "texto" || field.type === "telefone") && (
                        <Input
                          placeholder="Máscara (ex.: (99) 99999-9999)"
                          value={field.mask || ""}
                          onChange={(e) => updateField(field.id, { mask: e.target.value })}
                        />
                      )}
                      <Input
                        placeholder="Validação (regex, opcional)"
                        value={field.validation || ""}
                        onChange={(e) => updateField(field.id, { validation: e.target.value })}
                      />
                    </div>

                    {optionBasedTypes.includes(field.type) && (
                      <OptionsInput
                        options={field.options || []}
                        onCommit={(options) => updateField(field.id, { options })}
                      />
                    )}

                    {optionBasedTypes.includes(field.type) && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs text-muted-foreground">Depende do campo</Label>
                          <Select
                            value={field.dependsOnFieldId || "__none__"}
                            onValueChange={(v) =>
                              updateField(field.id, {
                                dependsOnFieldId: v === "__none__" ? undefined : v,
                                optionsByParentValue: v === "__none__" ? undefined : field.optionsByParentValue,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Nenhum" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Nenhum</SelectItem>
                              {fields
                                .filter((f) => f.id !== field.id && optionBasedTypes.includes(f.type))
                                .map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {field.dependsOnFieldId && (
                          <div className="flex flex-col gap-2 sm:col-span-2">
                            <Label className="text-xs text-muted-foreground">
                              Opções por valor do campo pai
                            </Label>
                            {(fields.find((f) => f.id === field.dependsOnFieldId)?.options || []).map(
                              (parentOption) => (
                                <div key={parentOption} className="flex items-center gap-2">
                                  <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">
                                    {parentOption}
                                  </span>
                                  <OptionsInput
                                    options={field.optionsByParentValue?.[parentOption] || []}
                                    onCommit={(opts) =>
                                      updateField(field.id, {
                                        optionsByParentValue: {
                                          ...(field.optionsByParentValue || {}),
                                          [parentOption]: opts,
                                        },
                                      })
                                    }
                                  />
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">Chave: {field.key}</span>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Obrigatório</Label>
                        <Switch checked={!!field.required} onCheckedChange={(v) => updateField(field.id, { required: v })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Adicione campos para visualizar</p>
            ) : (
              fields.map((field) => (
                <div key={field.id} className="flex flex-col gap-1.5">
                  <Label>
                    {field.label} {field.required && <Badge>OBRIGATÓRIO</Badge>}
                  </Label>
                  <PreviewField field={field} />
                  {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Campo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newFieldLabel">Nome do campo</Label>
              <Input id="newFieldLabel" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex.: Situação Identificada" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tipo do campo</Label>
              <Select value={newType} onValueChange={(v: FormFieldType) => setNewType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(fieldTypeLabels) as FormFieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {fieldTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={addField}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir campo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este campo? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && removeField(deleteTarget)}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OptionsInput({
  options,
  onCommit,
}: {
  options: string[];
  onCommit: (options: string[]) => void;
}) {
  const [draft, setDraft] = useState(options.join(", "));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(options.join(", "));
  }, [options, focused]);

  function commit(text: string) {
    onCommit(
      text
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    );
  }

  return (
    <Input
      placeholder="Opções separadas por vírgula"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
    />
  );
}

function PreviewField({ field }: { field: FormField }) {
  switch (field.type) {
    case "texto":
    case "email":
    case "telefone":
      return <Input type={field.type === "email" ? "email" : "text"} placeholder={field.placeholder} disabled />;
    case "numero":
      return <Input type="number" placeholder={field.placeholder} disabled />;
    case "data":
      return <Input type="date" disabled />;
    case "hora":
      return <Input type="time" disabled />;
    case "textarea":
      return <Textarea placeholder={field.placeholder} disabled rows={3} />;
    case "anexo":
      return <Input type="file" disabled />;
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" disabled />
          {field.placeholder || "Confirmar"}
        </label>
      );
    case "selecao":
    case "multipla_escolha":
    case "radio":
      return (
        <div className="flex flex-col gap-1">
          {(field.options || []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type={field.type === "multipla_escolha" ? "checkbox" : "radio"} disabled />
              {o}
            </label>
          ))}
        </div>
      );
    default:
      return null;
  }
}
