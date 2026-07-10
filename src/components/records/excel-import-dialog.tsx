"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { writeBatch, doc, deleteDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Upload, Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet, X, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { recordsCol } from "@/lib/firestore-helpers";
import { getNextRecordNumber } from "@/lib/forms";
import type { AppRecord, RecordStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FieldKey = "id" | "instalacao" | "sistema" | "equipamento" | "gerencia" | "responsavel";

const REQUIRED_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "instalacao", label: "Instalação" },
  { key: "sistema", label: "Sistema" },
  { key: "equipamento", label: "Equipamento" },
  { key: "gerencia", label: "Gerência" },
  { key: "responsavel", label: "Responsável" },
];

const AUTO_DETECT: Record<FieldKey, string[]> = {
  id: ["id", "codigo", "código", "numero", "número", "nº", "no", "registro"],
  instalacao: ["instalacao", "instalação", "local", "planta", "unidade"],
  sistema: ["sistema", "subsystem", "subsistema"],
  equipamento: ["equipamento", "tag", "asset"],
  gerencia: ["gerencia", "gerência", "area", "área", "setor"],
  responsavel: ["responsavel", "responsável", "usuario", "usuário", "owner"],
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function autoDetectColumn(headers: string[], key: FieldKey): string {
  const candidates = AUTO_DETECT[key];
  const found = headers.find((h) => candidates.includes(normalize(h)));
  return found || "";
}

interface ParsedRow {
  raw: Record<string, unknown>;
  index: number;
}

interface ImportResult {
  imported: number;
  ignored: number;
  errors: string[];
  batchId: string;
  importedIds: string[];
}

export function ExcelImportDialog({
  open,
  onOpenChange,
  formId,
  authorId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId?: string;
  authorId?: string;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    id: "",
    instalacao: "",
    sistema: "",
    equipamento: "",
    gerencia: "",
    responsavel: "",
  });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [deletingImport, setDeletingImport] = useState(false);

  function reset() {
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({ id: "", instalacao: "", sistema: "", equipamento: "", gerencia: "", responsavel: "" });
    setImporting(false);
    setResult(null);
    setParseError(null);
  }

  function handleClose(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  async function handleFile(f: File) {
    setResult(null);
    setParseError(null);
    const validExt = /\.(xlsx|xls)$/i.test(f.name);
    if (!validExt) {
      toast.error("Formato inválido. Envie um arquivo .xlsx ou .xls");
      return;
    }
    setFile(f);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        setParseError("Planilha inexistente no arquivo");
        return;
      }
      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (json.length === 0) {
        setParseError("Arquivo vazio ou sem linhas de dados");
        return;
      }
      const hdrs = Object.keys(json[0]);
      if (hdrs.length === 0) {
        setParseError("Cabeçalhos ausentes na planilha");
        return;
      }
      const parsedRows: ParsedRow[] = json
        .map((raw, index) => ({ raw, index }))
        .filter(({ raw }) => Object.values(raw).some((v) => String(v).trim() !== ""));
      if (parsedRows.length === 0) {
        setParseError("Nenhuma linha com dados válidos");
        return;
      }
      setHeaders(hdrs);
      setRows(parsedRows);
      setMapping({
        id: autoDetectColumn(hdrs, "id"),
        instalacao: autoDetectColumn(hdrs, "instalacao"),
        sistema: autoDetectColumn(hdrs, "sistema"),
        equipamento: autoDetectColumn(hdrs, "equipamento"),
        gerencia: autoDetectColumn(hdrs, "gerencia"),
        responsavel: autoDetectColumn(hdrs, "responsavel"),
      });
    } catch {
      setParseError("Não foi possível ler o arquivo. Verifique se não está corrompido.");
    }
  }

  function cellValue(row: ParsedRow, column: string): string {
    if (!column) return "";
    const v = row.raw[column];
    if (v === undefined || v === null) return "";
    if (v instanceof Date) return v.toLocaleDateString("pt-BR");
    return String(v).trim();
  }

  const missingRequired = REQUIRED_FIELDS.filter((f) => !mapping[f.key]);

  const duplicateIds = useMemo(() => {
    if (!mapping.id) return new Set<string>();
    const seen = new Set<string>();
    const dupes = new Set<string>();
    rows.forEach((r) => {
      const id = cellValue(r, mapping.id);
      if (!id) return;
      if (seen.has(id)) dupes.add(id);
      seen.add(id);
    });
    return dupes;
  }, [rows, mapping.id]);

  const canImport = rows.length > 0 && missingRequired.length === 0 && !importing;

  async function runImport() {
    if (!canImport) return;
    setImporting(true);
    let imported = 0;
    let ignored = 0;
    const errors: string[] = [];
    const seenIds = new Set<string>();
    const importedIds: string[] = [];
    const batchId = crypto.randomUUID();
    try {
      let batch = writeBatch(db);
      let opsInBatch = 0;
      for (const row of rows) {
        const id = cellValue(row, mapping.id);
        const instalacao = cellValue(row, mapping.instalacao);
        const sistema = cellValue(row, mapping.sistema);
        const equipamento = cellValue(row, mapping.equipamento);
        const gerencia = cellValue(row, mapping.gerencia);
        const responsavel = cellValue(row, mapping.responsavel);

        if (id && seenIds.has(id)) {
          ignored += 1;
          errors.push(`Linha ${row.index + 2}: ID duplicado (${id})`);
          continue;
        }
        if (id) seenIds.add(id);

        const newId = crypto.randomUUID();
        const recordNumber = await getNextRecordNumber();
        const record: Omit<AppRecord, "id"> = {
          recordNumber,
          status: "aprovado" as RecordStatus,
          authorId: authorId || "import",
          authorName: responsavel,
          formId,
          data: {
            instalacao,
            sistema,
            equipamento,
            gerencia,
            idPlanilha: id,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          importBatchId: batchId,
        };
        batch.set(doc(recordsCol(), newId), record as AppRecord);
        opsInBatch += 1;
        imported += 1;
        importedIds.push(newId);

        if (opsInBatch >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          opsInBatch = 0;
        }
      }
      if (opsInBatch > 0) await batch.commit();

      setResult({ imported, ignored, errors, batchId, importedIds });
      if (imported > 0) {
        toast.success(`${imported} registro(s) importado(s)`);
        onImported();
      }
      if (ignored > 0) toast.message(`${ignored} linha(s) ignorada(s)`);
    } catch {
      toast.error("Erro ao importar os registros");
    } finally {
      setImporting(false);
    }
  }

  async function deleteImport() {
    if (!result || result.importedIds.length === 0) return;
    setDeletingImport(true);
    try {
      for (const id of result.importedIds) {
        await deleteDoc(doc(recordsCol(), id));
      }
      toast.success("Importação excluída por completo");
      setResult(null);
      onImported();
    } catch {
      toast.error("Erro ao excluir a importação");
    } finally {
      setDeletingImport(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Excel</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>Selecionar arquivo</Label>
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm hover:border-primary">
                <Upload className="h-4 w-4" />
                Escolher arquivo
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
              {file && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                  {file.name}
                  <button onClick={reset} className="ml-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </div>
          </div>

          {parseError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {parseError}
            </div>
          )}

          {headers.length > 0 && (
            <>
              <div className="flex flex-col gap-2">
                <Label>Mapeamento de colunas</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {REQUIRED_FIELDS.map((f) => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {f.label} <span className="text-destructive">*</span>
                      </span>
                      <Select
                        value={mapping[f.key] || undefined}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a coluna" />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {missingRequired.length > 0 && (
                  <p className="text-xs text-destructive">
                    Mapeie todos os campos obrigatórios: {missingRequired.map((f) => f.label).join(", ")}
                  </p>
                )}
                {duplicateIds.size > 0 && (
                  <p className="text-xs text-destructive">
                    IDs duplicados encontrados: {Array.from(duplicateIds).join(", ")}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>
                  Prévia ({rows.length} registro{rows.length !== 1 ? "s" : ""}, {headers.length} coluna
                  {headers.length !== 1 ? "s" : ""})
                </Label>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {REQUIRED_FIELDS.map((f) => (
                          <TableHead key={f.key}>{f.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 5).map((r) => (
                        <TableRow key={r.index}>
                          {REQUIRED_FIELDS.map((f) => (
                            <TableCell key={f.key}>{cellValue(r, mapping[f.key]) || "—"}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}

          {result && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  {result.imported} importado(s) · {result.ignored} ignorado(s)
                </div>
                {result.imported > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={deleteImport}
                    disabled={deletingImport}
                  >
                    {deletingImport ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Excluir importação
                  </Button>
                )}
              </div>
              {result.errors.length > 0 && (
                <ul className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button onClick={runImport} disabled={!canImport}>
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              "Importar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
