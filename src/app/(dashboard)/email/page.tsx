"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import JSZip from "jszip";
import { toast } from "sonner";
import { Download, Mail, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { emailLogsCol, recordsCol, usersCol } from "@/lib/firestore-helpers";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_FORM_ID, logFirestoreError, statusLabels } from "@/lib/forms";
import type { AppRecord, FormDefinition, User } from "@/types";
import { buildEmailSubject, renderEmailReportHtml } from "@/components/email/email-report-template";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(raw: string): string[] {
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export default function EmailPage() {
  const { user, profile } = useAuth();
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeForm, setActiveForm] = useState<FormDefinition | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [recordId, setRecordId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [to, setTo] = useState("");
  const [ccList, setCcList] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [ccOpen, setCcOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(recordsCol(), orderBy("createdAt", "desc")),
      (snap) => {
        setRecords(snap.docs.map((d) => d.data()).filter((r) => r.status !== "rascunho"));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "formFields", DEFAULT_FORM_ID),
      (snap) => setActiveForm(snap.exists() ? (snap.data() as FormDefinition) : null),
      (error) => logFirestoreError({ fn: "EmailPage:loadForm" }, error)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(usersCol()),
      (snap) => setAllUsers(snap.docs.map((d) => d.data())),
      () => {}
    );
    return () => unsub();
  }, []);

  const selected = useMemo(() => records.find((r) => r.id === recordId) || null, [records, recordId]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const haystack = [
        r.recordNumber,
        r.id,
        r.authorName,
        statusLabels[r.status],
        r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : "",
        ...Object.values(r.data || {}).map((v) => (v === null || v === undefined ? "" : String(v))),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [records, search]);

  const sortedFields = useMemo(
    () => (activeForm?.fields || []).slice().sort((a, b) => a.order - b.order),
    [activeForm]
  );

  const images = useMemo(() => {
    if (!selected) return [];
    return (selected.attachments || [])
      .filter((a) => /\.(png|jpe?g|gif|webp)$/i.test(a.name) || a.contentType?.startsWith("image/"))
      .map((a) => ({ name: a.name, url: a.url }));
  }, [selected]);

  const previewHtml = useMemo(() => {
    if (!selected) return "";
    return renderEmailReportHtml({
      record: selected,
      fields: sortedFields,
      images,
    });
  }, [selected, sortedFields, images]);

  const userSuggestions = useMemo(() => {
    const q = ccInput.trim().toLowerCase();
    if (!q) return [];
    return allUsers
      .filter(
        (u) =>
          u.email &&
          !ccList.some((e) => e.toLowerCase() === u.email.toLowerCase()) &&
          (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [ccInput, allUsers, ccList]);

  function addCc(email: string) {
    const trimmed = email.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (!ccList.some((e) => e.toLowerCase() === lower)) setCcList((prev) => [...prev, trimmed]);
    setCcInput("");
    setCcOpen(false);
  }

  function removeCc(email: string) {
    setCcList((prev) => prev.filter((e) => e !== email));
  }

  function selectRecord(id: string) {
    setRecordId(id);
    const r = records.find((x) => x.id === id);
    if (r) {
      const fields = (activeForm?.fields || []).slice().sort((a, b) => a.order - b.order);
      setSubject(buildEmailSubject(r, fields));
    }
  }

  async function sendViaOutlook() {
    if (!selected) {
      toast.error("Selecione um registro");
      return;
    }
    const toEmails = parseEmails(to);
    if (toEmails.length === 0) {
      toast.error("Informe ao menos um destinatário");
      return;
    }
    const invalid = toEmails.filter((e) => !EMAIL_RE.test(e));
    if (invalid.length > 0) {
      toast.error(`E-mail inválido: ${invalid.join(", ")}`);
      return;
    }
    setSending(true);
    try {
      if (images.length) await downloadImages();
      try {
        const blob = new Blob([previewHtml], { type: "text/html" });
        await navigator.clipboard.write([new ClipboardItem({ "text/html": blob })]);
        toast.message("Relatório copiado. Cole (Ctrl+V) no corpo do e-mail do Outlook.");
      } catch {
        // clipboard indisponível; segue apenas com mailto
      }
      const queryParts = [`subject=${encodeURIComponent(subject)}`];
      if (ccList.length) queryParts.push(`cc=${encodeURIComponent(ccList.join(","))}`);
      const mailto = `mailto:${encodeURIComponent(to)}?${queryParts.join("&")}`;
      window.location.href = mailto;
      await addDoc(emailLogsCol(), {
        id: "",
        recordId: selected.id,
        to: [to, ...ccList].join(", "),
        subject,
        message: previewHtml,
        senderId: user?.uid,
        senderName: profile?.name || user?.email || undefined,
        createdAt: new Date().toISOString(),
      });
      toast.success("Abrindo o Outlook...");
    } catch {
      toast.error("Erro ao abrir o Outlook");
    } finally {
      setSending(false);
    }
  }

  function triggerDownload(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function fetchAsBlob(url: string, filename: string): Promise<Blob | null> {
    try {
      const proxied = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
      const res = await fetch(proxied);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  async function downloadImages() {
    if (!selected) {
      toast.error("Selecione um registro");
      return;
    }
    const imgs = (selected.attachments || []).filter(
      (a) => /\.(png|jpe?g|gif|webp)$/i.test(a.name) || a.contentType?.startsWith("image/")
    );
    if (imgs.length === 0) {
      toast.error("Este registro não possui imagens anexadas");
      return;
    }
    setDownloading(true);
    try {
      if (imgs.length === 1) {
        const blob = await fetchAsBlob(imgs[0].url, imgs[0].name);
        if (!blob) {
          toast.error("Erro ao baixar a imagem");
          return;
        }
        const url = URL.createObjectURL(blob);
        triggerDownload(url, imgs[0].name);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success("Download iniciado");
        return;
      }

      const zip = new JSZip();
      let okCount = 0;
      await Promise.all(
        imgs.map(async (img, idx) => {
          const blob = await fetchAsBlob(img.url, img.name || `imagem_${idx + 1}`);
          if (blob) {
            zip.file(img.name || `imagem_${idx + 1}`, blob);
            okCount += 1;
          }
        })
      );

      if (okCount === 0) {
        toast.error("Não foi possível baixar as imagens");
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      triggerDownload(url, `imagens_${selected.recordNumber || selected.id}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(
        okCount < imgs.length
          ? `ZIP gerado com ${okCount} de ${imgs.length} imagens (algumas falharam)`
          : "Download iniciado"
      );
    } catch (error) {
      logFirestoreError({ fn: "EmailPage:downloadImages" }, error);
      toast.error("Erro ao baixar as imagens");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Enviar por E-mail</h1>
        <p className="text-sm text-muted-foreground">Envie registros preenchidos por e-mail via Outlook</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Selecionar registro</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              placeholder="Buscar por número, instalação, sistema, equipamento, responsável, status, data..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={recordId} onValueChange={selectRecord} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um registro" />
              </SelectTrigger>
              <SelectContent>
                {filteredRecords.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.recordNumber || r.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {search.trim() && (
              <p className="text-xs text-muted-foreground">{filteredRecords.length} registro(s) encontrado(s)</p>
            )}
            {selected && (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{selected.recordNumber || selected.id}</span>
                  <Badge>{statusLabels[selected.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Responsável: {selected.authorName || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  Anexos: {selected.attachments?.length || 0}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Compor e-mail</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">Destinatário(s)</Label>
              <Input
                id="to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="nome@empresa.com, outro@empresa.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc">Cc</Label>
              <div className="relative">
                <Input
                  id="cc"
                  value={ccInput}
                  onChange={(e) => {
                    setCcInput(e.target.value);
                    setCcOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addCc(ccInput);
                    }
                    if (e.key === "Escape") {
                      setCcOpen(false);
                    }
                  }}
                  onBlur={() => setTimeout(() => setCcOpen(false), 150)}
                  placeholder="Digite nome ou e-mail e pressione Enter"
                />
                {ccOpen && userSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                    {userSuggestions.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => addCc(u.email)}
                      >
                        <span className="font-medium">{u.name}</span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {ccList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ccList.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <button type="button" aria-label={`Remover ${email}`} onClick={() => removeCc(email)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subject">Assunto</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={sendViaOutlook} disabled={sending || !selected}>
                <Mail className="h-4 w-4" />
                Enviar pelo Outlook
              </Button>
              <Button variant="outline" onClick={downloadImages} disabled={downloading || !selected}>
                <Download className="h-4 w-4" />
                Baixar imagens
              </Button>
            </div>
          </CardContent>
        </Card>

        {selected && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Prévia do relatório</CardTitle>
            </CardHeader>
            <CardContent>
              <iframe
                title="Prévia do e-mail"
                srcDoc={previewHtml}
                className="h-150 w-full rounded-md border border-border bg-white"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
