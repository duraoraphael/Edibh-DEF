import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AppRecord, AttachmentRef, FormField } from "@/types";
import { statusLabels } from "./forms";

const GREEN: [number, number, number] = [14, 122, 75];
const GREEN_DARK: [number, number, number] = [12, 105, 64];
const GRAY_LIGHT: [number, number, number] = [245, 247, 250];
const TEXT_DARK: [number, number, number] = [31, 41, 55];
const TEXT_MUTED: [number, number, number] = [107, 114, 128];

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[pdf:urlToDataUrl] falha ao carregar imagem", { url, error });
    return null;
  }
}

/** Rasterizes any browser-renderable image (including SVG) to a PNG data URL jsPDF can embed. */
async function toPngDataUrl(src: string, maxSize = 240): Promise<string | null> {
  const dataUrl = src.startsWith("data:") ? src : await urlToDataUrl(src);
  if (!dataUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

interface HeaderAssets {
  normatel: string | null;
  petrobras: string | null;
}

let cachedAssets: HeaderAssets | null = null;

export async function loadHeaderAssets(): Promise<HeaderAssets> {
  if (cachedAssets) return cachedAssets;
  const [normatel, petrobras] = await Promise.all([
    toPngDataUrl("/Normatel Engenharia_BRANCO.png"),
    toPngDataUrl("/Principal_h_cor_RGB (1).svg"),
  ]);
  cachedAssets = { normatel, petrobras };
  return cachedAssets;
}

function drawHeader(doc: jsPDF, assets: HeaderAssets, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageWidth, 26, "F");

  let cursorX = 14;
  if (assets.normatel) {
    doc.addImage(assets.normatel, "PNG", cursorX, 6, 32, 14, undefined, "FAST");
    cursorX += 38;
  }
  if (assets.petrobras) {
    doc.addImage(assets.petrobras, "PNG", cursorX, 6, 26, 14, undefined, "FAST");
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, pageWidth - 14, 15, { align: "right" });

  doc.setDrawColor(...GREEN_DARK);
  doc.setLineWidth(1.2);
  doc.line(0, 26, pageWidth, 26);
}

function drawFooter(doc: jsPDF, opts: { recordNumber?: string; userName?: string }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(229, 231, 235);
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    const left = [
      `Emitido em ${new Date().toLocaleString("pt-BR")}`,
      opts.userName ? `Responsável: ${opts.userName}` : null,
      opts.recordNumber ? `Registro: ${opts.recordNumber}` : null,
    ]
      .filter(Boolean)
      .join("   •   ");
    doc.text(left, 14, pageHeight - 10);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: "right" });
  }
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFillColor(...GREEN);
  doc.rect(14, y - 4.5, 3, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.text(text, 20, y);
  return y + 8;
}

function fieldValue(record: AppRecord, key: string): string {
  const v = record.data?.[key];
  if (v === undefined || v === null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  return String(v);
}

interface GenerateOptions {
  fields?: FormField[];
  userName?: string;
}

export async function generateRecordPdf(record: AppRecord, options: GenerateOptions = {}) {
  const assets = await loadHeaderAssets();
  const doc = new jsPDF();
  drawHeader(doc, assets, "Fluxo de Equipamentos");

  let y = 38;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...TEXT_DARK);
  doc.text(record.recordNumber ? `Registro ${record.recordNumber}` : "Registro", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${record.recordNumber || "—"}  •  ${statusLabels[record.status]}`, 14, y);
  y += 10;

  const fields = (options.fields || []).slice().sort((a, b) => a.order - b.order);
  const generalFields = fields.filter((f) => f.type !== "textarea" && f.type !== "anexo");
  const textFields = fields.filter((f) => f.type === "textarea");
  const uploadFields = fields.filter((f) => f.type === "anexo");

  y = sectionTitle(doc, "Dados Gerais", y);
  const generalRows: [string, string][] = [
    ["Responsável", record.authorName || "—"],
    ...generalFields.map((f): [string, string] => [f.label, fieldValue(record, f.key)]),
  ];
  autoTable(doc, {
    startY: y,
    body: generalRows,
    theme: "plain",
    styles: { fontSize: 9.5, textColor: TEXT_DARK, cellPadding: 1.6 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, textColor: TEXT_MUTED }, 1: { cellWidth: "auto" } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  const occurrenceValues = textFields.length
    ? textFields.map((f) => `${f.label}: ${fieldValue(record, f.key)}`)
    : Object.entries(record.data || {})
        .filter(([, v]) => typeof v === "string" && v.length > 80)
        .map(([k, v]) => `${k}: ${String(v)}`);

  if (occurrenceValues.length > 0) {
    y = sectionTitle(doc, "Ocorrência", y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_DARK);
    for (const line of occurrenceValues) {
      const split = doc.splitTextToSize(line, 180);
      doc.text(split, 20, y);
      y += split.length * 5 + 3;
    }
    y += 4;
  }

  const attachments: AttachmentRef[] = record.attachments || [];
  const uploadFieldFiles = uploadFields
    .map((f) => ({ key: f.key, url: record.data?.[f.key] }))
    .filter((v): v is { key: string; url: string } => typeof v.url === "string" && !!v.url)
    .map(({ key, url }): AttachmentRef => ({ id: key, name: "Anexo do campo", url }));
  const allAttachments: AttachmentRef[] = [...attachments, ...uploadFieldFiles];

  if (allAttachments.length > 0) {
    y = sectionTitle(doc, "Anexos", y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const att of allAttachments) {
      const isImage = /\.(png|jpe?g|gif|webp)$/i.test(att.name) || att.contentType?.startsWith("image/");
      if (isImage) {
        const dataUrl = await toPngDataUrl(att.url, 220);
        if (dataUrl) {
          if (y > 250) {
            doc.addPage();
            y = 20;
          }
          doc.addImage(dataUrl, "PNG", 20, y, 40, 28, undefined, "FAST");
          doc.setTextColor(...TEXT_MUTED);
          doc.text(att.name, 65, y + 16, { maxWidth: 120 });
          y += 34;
          continue;
        }
      }
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setTextColor(...TEXT_DARK);
      doc.text(`• ${att.name}`, 20, y);
      y += 6;
    }
  }

  drawFooter(doc, { recordNumber: record.recordNumber, userName: options.userName });
  doc.save(`registro_${(record.recordNumber || record.id).replace("/", "-")}.pdf`);
}

export async function generateRecordsTablePdf(
  records: AppRecord[],
  columns: { header: string; get: (r: AppRecord) => string }[]
) {
  const assets = await loadHeaderAssets();
  const doc = new jsPDF();
  drawHeader(doc, assets, "Fluxo de Equipamentos");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Histórico de Registros", 14, 34);

  autoTable(doc, {
    startY: 40,
    head: [columns.map((c) => c.header)],
    body: records.map((r) => columns.map((c) => c.get(r))),
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: GRAY_LIGHT },
    styles: { fontSize: 8.5, textColor: TEXT_DARK },
    margin: { left: 14, right: 14, bottom: 20 },
  });

  drawFooter(doc, {});
  doc.save("registros_equipamentos.pdf");
}
