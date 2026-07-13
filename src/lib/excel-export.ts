import ExcelJS from "exceljs";
import type { AppRecord, RecordStatus } from "@/types";
import { fieldValue, statusLabels } from "./forms";

const GREEN_DARK = "FF14532D";
const GREEN = "FF15803D";
const GREEN_LIGHT = "FFDCFCE7";
const ROW_ALT = "FFF3F9F4";
const WHITE = "FFFFFFFF";
const BORDER_COLOR = "FFD1D5DB";

const statusColors: Record<RecordStatus, { fg: string; bg: string }> = {
  rascunho: { fg: "FF4B5563", bg: "FFE5E7EB" },
  pendente: { fg: "FF92400E", bg: "FFFEF3C7" },
  aprovado: { fg: "FF166534", bg: "FFDCFCE7" },
  rejeitado: { fg: "FF991B1B", bg: "FFFEE2E2" },
  reajuste: { fg: "FF92400E", bg: "FFFEF3C7" },
};

const thinBorder = { style: "thin" as const, color: { argb: BORDER_COLOR } };

function arrayBufferToDataUrl(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:image/png;base64,${btoa(binary)}`;
}

async function fetchImageBuffer(path: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export interface ExportExcelOptions {
  records: AppRecord[];
  userName: string;
  title?: string;
}

export async function exportRecordsToExcel({ records, userName, title = "Registros de Equipamentos" }: ExportExcelOptions) {
  const wb = new ExcelJS.Workbook();
  wb.creator = userName;
  wb.created = new Date();

  const sheet = wb.addWorksheet("Registros", {
    views: [{ state: "frozen", ySplit: 6 }],
  });

  const columns = [
    { header: "ID", key: "id", width: 12 },
    { header: "Instalação", key: "instalacao", width: 20 },
    { header: "Sistema", key: "sistema", width: 18 },
    { header: "Equipamento", key: "equipamento", width: 20 },
    { header: "Gerência", key: "gerencia", width: 18 },
    { header: "Data", key: "data", width: 14 },
    { header: "Status", key: "status", width: 20 },
    { header: "Responsável", key: "responsavel", width: 22 },
  ];
  const colCount = columns.length;

  sheet.mergeCells(1, 1, 3, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { size: 20, bold: true, color: { argb: WHITE } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= colCount; c++) {
      sheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_DARK } };
    }
  }
  sheet.getRow(1).height = 14;
  sheet.getRow(2).height = 28;
  sheet.getRow(3).height = 14;

  const now = new Date();
  sheet.mergeCells(4, 1, 4, Math.ceil(colCount / 2));
  sheet.getCell(4, 1).value = `Exportado em: ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR")}`;
  sheet.mergeCells(4, Math.ceil(colCount / 2) + 1, 4, colCount);
  sheet.getCell(4, Math.ceil(colCount / 2) + 1).value = `Exportado por: ${userName}`;
  sheet.getCell(4, Math.ceil(colCount / 2) + 1).alignment = { horizontal: "right" };
  for (let c = 1; c <= colCount; c++) {
    const cell = sheet.getCell(4, c);
    cell.font = { size: 10, italic: true, color: { argb: "FF374151" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
  }

  sheet.getRow(5).height = 6;

  const headerRow = sheet.getRow(6);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  });
  headerRow.height = 22;

  columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width;
  });

  const dataStartRow = 7;
  records.forEach((r, idx) => {
    const rowIndex = dataStartRow + idx;
    const row = sheet.getRow(rowIndex);
    const values = [
      r.recordNumber || "—",
      fieldValue(r, "instalacao") || "—",
      fieldValue(r, "sistema") || "—",
      fieldValue(r, "equipamento") || "—",
      fieldValue(r, "gerencia") || "—",
      r.createdAt ? new Date(r.createdAt) : null,
      statusLabels[r.status] || r.status,
      r.authorName || "—",
    ];
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
      cell.alignment = { vertical: "middle" };
      if (!(idx % 2)) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
      }
    });
    row.getCell(6).numFmt = "dd/mm/yyyy";
    const statusCell = row.getCell(7);
    const colors = statusColors[r.status];
    if (colors) {
      statusCell.font = { bold: true, color: { argb: colors.fg } };
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.bg } };
    }
  });

  const lastRow = dataStartRow + records.length - 1;
  if (records.length > 0) {
    sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: colCount } };
    void lastRow;
  }

  try {
    const [petrobras, normatel] = await Promise.all([
      fetchImageBuffer("/petrobras.png"),
      fetchImageBuffer("/Simbolo eng verde.png"),
    ]);
    if (petrobras) {
      const imgId = wb.addImage({ base64: arrayBufferToDataUrl(petrobras), extension: "png" });
      sheet.addImage(imgId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 90, height: 40 } });
    }
    if (normatel) {
      const imgId = wb.addImage({ base64: arrayBufferToDataUrl(normatel), extension: "png" });
      sheet.addImage(imgId, { tl: { col: colCount - 1.3, row: 0.1 }, ext: { width: 40, height: 40 } });
    }
  } catch {
    // logos are a visual enhancement only — export still succeeds without them
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `registros_equipamentos_${now.toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
