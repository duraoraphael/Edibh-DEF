// Gerador do relatório de auditoria de seguranca em PDF.
// Ambiente isolado: dependencias instaladas localmente em docs/security-audit
// (nao afeta o package.json do projeto). Rode com: node generate-report.mjs
//
// Reexecute este script sempre que findings-data.mjs mudar para regenerar o PDF.

import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  project,
  severityMeta,
  strengthColor,
  categories,
  findings,
  strengths,
  recommendations,
  githubIssues,
} from "./findings-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "relatorio-auditoria-seguranca.pdf");

const PAGE = { size: "A4", margins: { top: 78, bottom: 64, left: 56.7, right: 56.7 } };
const CONTENT_WIDTH = 595.28 - PAGE.margins.left - PAGE.margins.right;

const COLOR = {
  navy: "#0b2540",
  green: "#0e7a4b",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e2e8f0",
  bgLight: "#f8fafc",
  white: "#ffffff",
};

const REPORT_NAME = `Relatório de Auditoria de Segurança — ${project.name}`;

const doc = new PDFDocument({ ...PAGE, bufferPages: true, info: { Title: REPORT_NAME, Author: "Auditoria de Segurança" } });
const stream = fs.createWriteStream(OUT_PATH);
doc.pipe(stream);

// pdfkit's built-in "Courier" is a base-14 standard font (no embedded glyph
// data); several PDF viewers substitute it with a non-fixed-pitch fallback
// for accented Latin-1 characters (á/é/í/ó/ú/ã/õ/ç), which visibly breaks
// the monospace alignment of code blocks. Embedding the real Courier New
// TTF (present on Windows) avoids relying on any viewer's substitution.
const COURIER_TTF = "C:/Windows/Fonts/cour.ttf";
if (fs.existsSync(COURIER_TTF)) {
  doc.registerFont("CourierNew", COURIER_TTF);
} else {
  doc.registerFont("CourierNew", "Courier");
}

// ---------- helpers ----------

function ensureSpace(h) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + h > bottom) doc.addPage();
}

function sectionTitle(text, opts = {}) {
  ensureSpace(40);
  doc.moveDown(opts.noGapBefore ? 0 : 0.6);
  doc.fillColor(COLOR.green).font("Helvetica-Bold").fontSize(16).text(text, { continued: false });
  doc.moveTo(doc.page.margins.left, doc.y + 2)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
    .lineWidth(1.2).strokeColor(COLOR.green).stroke();
  doc.moveDown(0.6);
  doc.fillColor(COLOR.text).font("Helvetica").fontSize(10.5);
}

function subTitle(text) {
  ensureSpace(26);
  doc.moveDown(0.4);
  doc.fillColor(COLOR.navy).font("Helvetica-Bold").fontSize(12.5).text(text);
  doc.moveDown(0.25);
  doc.fillColor(COLOR.text).font("Helvetica").fontSize(10.5);
}

function bodyText(text, opts = {}) {
  doc.font("Helvetica").fontSize(10.2).fillColor(COLOR.text).text(text, {
    width: CONTENT_WIDTH,
    align: "justify",
    ...opts,
  });
}

function severityChip(sev, x, y) {
  const meta = severityMeta[sev] || { label: sev, color: COLOR.muted };
  doc.font("Helvetica-Bold").fontSize(8.5);
  const label = meta.label.toUpperCase();
  const w = doc.widthOfString(label) + 14;
  const h = 15;
  doc.roundedRect(x, y, w, h, 3).fill(meta.color);
  doc.fillColor("#ffffff").text(label, x + 7, y + 3.7, { lineBreak: false });
  doc.fillColor(COLOR.text).font("Helvetica").fontSize(10.2);
  return w;
}

function codeBlock(text, opts = {}) {
  if (!text) return;
  const padX = 10, padY = 8;
  doc.font("CourierNew").fontSize(8);
  const width = CONTENT_WIDTH - padX * 2;
  const h = doc.heightOfString(text, { width }) + padY * 2;
  ensureSpace(h + 6);
  const x = doc.page.margins.left;
  const y = doc.y;
  doc.rect(x, y, CONTENT_WIDTH, h).fill(opts.bg || "#0f172a");
  doc.fillColor(opts.fg || "#e2e8f0").font("CourierNew").fontSize(8).text(text, x + padX, y + padY, { width });
  doc.y = y + h + 8;
  doc.fillColor(COLOR.text).font("Helvetica").fontSize(10.2);
}

function labeledLine(label, value) {
  ensureSpace(16);
  const startX = doc.page.margins.left;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOR.navy).text(`${label}: `, startX, doc.y, { continued: true, width: CONTENT_WIDTH });
  doc.font("Helvetica").fontSize(9.5).fillColor(COLOR.text).text(value, { width: CONTENT_WIDTH });
  doc.moveDown(0.15);
}

// ---------- cover page ----------

function drawCover() {
  const pw = doc.page.width;
  const ph = doc.page.height;

  // Same pagination gotcha as the header/footer pass: absolute-positioned
  // text near the very top/bottom of the page (outside the normal margin
  // box) makes pdfkit think content overflowed and silently insert a blank
  // page. Disable margins for this fully hand-laid-out page.
  const savedTop = doc.page.margins.top;
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.top = 0;
  doc.page.margins.bottom = 0;

  doc.rect(0, 0, pw, ph).fill(COLOR.navy);
  doc.rect(0, ph - 10, pw, 10).fill(COLOR.green);

  doc.fillColor("#9fd8bd").font("Helvetica-Bold").fontSize(11)
    .text("RELATÓRIO CONFIDENCIAL — USO INTERNO", 56.7, 120, { characterSpacing: 1 });

  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(30)
    .text("Relatório de Auditoria\nde Segurança", 56.7, 160, { width: pw - 113.4, lineGap: 4 });

  doc.fillColor("#cbd5e1").font("Helvetica").fontSize(15)
    .text(project.name, 56.7, 270, { width: pw - 113.4 });

  doc.moveTo(56.7, 305).lineTo(pw - 56.7, 305).strokeColor("#2f4a68").lineWidth(1).stroke();

  const infoY = 325;
  doc.fillColor("#9fb3c8").font("Helvetica-Bold").fontSize(9.5).text("DATA", 56.7, infoY);
  doc.fillColor("#ffffff").font("Helvetica").fontSize(11).text(project.date, 56.7, infoY + 14);

  doc.fillColor("#9fb3c8").font("Helvetica-Bold").fontSize(9.5).text("ESCOPO AUDITADO", 56.7, infoY + 42);
  doc.fillColor("#ffffff").font("Helvetica").fontSize(11).text(
    "Código-fonte completo do repositório (frontend Next.js/React, regras de segurança do Firestore e do Storage, rotas de API, configuração de build/CI e arquivos de deploy).",
    56.7, infoY + 56, { width: pw - 113.4, lineGap: 2 }
  );

  const stackY = infoY + 130;
  doc.fillColor("#9fb3c8").font("Helvetica-Bold").fontSize(9.5).text("STACK DETECTADA", 56.7, stackY);
  const stackLines = [
    ["Linguagem", project.stack.linguagem],
    ["Framework", project.stack.framework],
    ["Camada de dados", project.stack.dados],
    ["Autenticação", project.stack.auth],
    ["Isolamento (equiv. RLS)", project.stack.isolamento],
    ["Rotas de API", project.stack.apiRoutes],
    ["Deploy / CI", project.stack.deploy],
  ];
  let ly = stackY + 16;
  stackLines.forEach(([k, v]) => {
    doc.fillColor("#6cbd90").font("Helvetica-Bold").fontSize(9.5).text(`${k}:`, 56.7, ly, { continued: true, width: pw - 113.4 });
    doc.fillColor("#e2e8f0").font("Helvetica").fontSize(9.5).text(` ${v}`, { width: pw - 113.4 - 130 });
    ly = doc.y + 3;
  });

  doc.fillColor("#7c93ab").font("Helvetica").fontSize(8.5)
    .text("Gerado automaticamente a partir da revisão manual, linha a linha, do código-fonte listado acima.", 56.7, ph - 40, { width: pw - 113.4, lineBreak: false });

  doc.page.margins.top = savedTop;
  doc.page.margins.bottom = savedBottom;
}

// ---------- methodology note (own page, since it is verbose) ----------

function drawMethodology() {
  doc.addPage();
  sectionTitle("Nota metodológica", { noGapBefore: true });
  bodyText(
    "Cada uma das cinco categorias solicitadas foi mapeada para o equivalente concreto da stack detectada (Next.js + Firebase, sem backend REST tradicional para os recursos de negócio). O mapeamento aplicado foi:"
  );
  doc.moveDown(0.4);
  project.methodology.forEach((m) => {
    ensureSpace(28);
    doc.font("Helvetica").fontSize(10).fillColor(COLOR.text).text(m, { width: CONTENT_WIDTH, indent: 0, lineGap: 2 });
    doc.moveDown(0.3);
  });
  doc.moveDown(0.3);
  bodyText(
    "Todos os achados reportados foram verificados diretamente no código-fonte (arquivo e linha citados); nenhum item é especulativo. Itens que dependem de uma ação adicional do atacante (ex.: escrita direta via SDK do Firestore fora da UI) têm essa condição de explorabilidade descrita explicitamente."
  );
}

// ---------- charts ----------

function polarPoint(cx, cy, r, angleRad) {
  return { x: cx + r * Math.sin(angleRad), y: cy - r * Math.cos(angleRad) };
}

function drawDonutSlice(cx, cy, rOuter, rInner, startDeg, endDeg, color) {
  const steps = Math.max(2, Math.ceil((endDeg - startDeg) / 3));
  const start = (startDeg * Math.PI) / 180;
  const end = (endDeg * Math.PI) / 180;
  const outerPts = [];
  const innerPts = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + ((end - start) * i) / steps;
    outerPts.push(polarPoint(cx, cy, rOuter, a));
    innerPts.push(polarPoint(cx, cy, rInner, a));
  }
  doc.moveTo(outerPts[0].x, outerPts[0].y);
  outerPts.slice(1).forEach((p) => doc.lineTo(p.x, p.y));
  innerPts.slice().reverse().forEach((p) => doc.lineTo(p.x, p.y));
  doc.closePath().fill(color);
}

function drawSeverityDonut(x, y, w, h, counts, total) {
  const cx = x + w / 2 - 55;
  const cy = y + h / 2;
  const rOuter = Math.min(w, h) / 2 - 14;
  const rInner = rOuter * 0.55;

  let angle = 0;
  const order = ["critica", "alta", "media", "baixa", "informativa"];
  const slices = order.filter((k) => counts[k] > 0);
  if (slices.length === 0) {
    doc.circle(cx, cy, rOuter).lineWidth(1.2).strokeColor(COLOR.border).stroke();
  } else if (slices.length === 1) {
    doc.circle(cx, cy, rOuter).fill(severityMeta[slices[0]].color);
    doc.circle(cx, cy, rInner).fill(COLOR.white);
  } else {
    slices.forEach((k) => {
      const deg = (counts[k] / total) * 360;
      drawDonutSlice(cx, cy, rOuter, rInner, angle, angle + deg, severityMeta[k].color);
      angle += deg;
    });
  }

  doc.font("Helvetica-Bold").fontSize(20).fillColor(COLOR.navy)
    .text(String(total), cx - rInner, cy - 10, { width: rInner * 2, align: "center" });
  doc.font("Helvetica").fontSize(7.5).fillColor(COLOR.muted)
    .text("achados", cx - rInner, cy + 10, { width: rInner * 2, align: "center" });

  // legend
  let ly = y + 6;
  const lx = x + w - 150;
  order.forEach((k) => {
    if (!severityMeta[k]) return;
    doc.rect(lx, ly + 2, 10, 10).fill(severityMeta[k].color);
    doc.fillColor(COLOR.text).font("Helvetica").fontSize(9.5)
      .text(`${severityMeta[k].label}: ${counts[k] || 0}`, lx + 16, ly + 1);
    ly += 18;
  });
}

function drawCategoryBars(x, y, w, h, data) {
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const rowH = h / data.length;
  const labelW = 150;
  const barAreaW = w - labelW - 40;

  data.forEach((d, i) => {
    const ry = y + i * rowH + rowH * 0.22;
    const barH = rowH * 0.56;
    doc.font("Helvetica").fontSize(9).fillColor(COLOR.text)
      .text(d.label, x, ry + barH / 2 - 5, { width: labelW - 8, ellipsis: true });
    const barW = Math.max(2, (d.value / maxVal) * barAreaW);
    doc.rect(x + labelW, ry, barW, barH).fill(COLOR.green);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOR.navy)
      .text(String(d.value), x + labelW + barW + 6, ry + barH / 2 - 5);
  });
}

// ---------- executive summary ----------

function drawExecutiveSummary() {
  doc.addPage();
  sectionTitle("Resumo executivo", { noGapBefore: true });

  const counts = { critica: 0, alta: 0, media: 0, baixa: 0, informativa: 0 };
  findings.forEach((f) => { counts[f.severity] = (counts[f.severity] || 0) + 1; });
  const total = findings.length;

  bodyText(
    `A auditoria identificou ${total} itens ao longo das cinco categorias solicitadas, sendo ${counts.critica} de severidade crítica, ${counts.alta} alta, ${counts.media} média, ${counts.baixa} baixa e ${counts.informativa} informativa/de cobertura. Os gráficos abaixo resumem a distribuição.`
  );
  doc.moveDown(0.6);

  ensureSpace(190);
  const chartsY = doc.y;
  drawSeverityDonut(doc.page.margins.left, chartsY, CONTENT_WIDTH, 170, counts, total);
  doc.y = chartsY + 180;

  subTitle("Achados por categoria");
  const catCounts = categories.map((c) => ({
    label: c.label,
    value: findings.filter((f) => f.category === c.id).length,
  }));
  ensureSpace(140);
  const barY = doc.y + 6;
  drawCategoryBars(doc.page.margins.left, barY, CONTENT_WIDTH, 120, catCounts);
  doc.y = barY + 130;
}

// ---------- strengths / weaknesses ----------

function drawStrengthsWeaknesses() {
  doc.addPage();
  sectionTitle("Pontos fortes e pontos fracos", { noGapBefore: true });

  subTitle("Pontos fortes (verificados no código)");
  strengths.forEach((s) => {
    ensureSpace(40);
    const x = doc.page.margins.left;
    const y = doc.y;
    doc.rect(x, y + 3, 4, 12).fill(strengthColor);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.navy).text(s.title, x + 12, y, { width: CONTENT_WIDTH - 12 });
    doc.font("Helvetica").fontSize(9.3).fillColor(COLOR.muted).text(s.detail, x + 12, doc.y + 1, { width: CONTENT_WIDTH - 12, lineGap: 1 });
    doc.moveDown(0.55);
  });

  subTitle("Pontos fracos centrais (achados críticos)");
  const critical = findings.filter((f) => f.severity === "critica");
  critical.forEach((f) => {
    ensureSpace(40);
    const x = doc.page.margins.left;
    const y = doc.y;
    doc.rect(x, y + 3, 4, 12).fill(severityMeta.critica.color);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.navy).text(`${f.id} — ${f.title}`, x + 12, y, { width: CONTENT_WIDTH - 12 });
    doc.font("Helvetica").fontSize(9.3).fillColor(COLOR.muted).text(f.location, x + 12, doc.y + 1, { width: CONTENT_WIDTH - 12, lineGap: 1 });
    doc.moveDown(0.55);
  });
}

// ---------- detailed findings ----------

function drawFindingsTable() {
  doc.addPage();
  sectionTitle("Achados detalhados por categoria", { noGapBefore: true });
  bodyText("Severidade | Arquivo:linha | Descrição — detalhamento completo de cada achado, incluindo trecho de código, motivo de explorabilidade, impacto, condição de exploração e recomendação.");
  doc.moveDown(0.3);

  categories.forEach((cat) => {
    const items = findings.filter((f) => f.category === cat.id);
    if (items.length === 0) return;
    ensureSpace(30);
    doc.moveDown(0.5);
    doc.fillColor(COLOR.navy).font("Helvetica-Bold").fontSize(13).text(cat.label);
    doc.moveDown(0.3);

    items.forEach((f) => {
      ensureSpace(60);
      const x = doc.page.margins.left;
      let y = doc.y;

      const chipW = severityChip(f.severity, x, y);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR.navy)
        .text(`${f.id} — ${f.title}`, x + chipW + 8, y + 1, { width: CONTENT_WIDTH - chipW - 8 });
      doc.y = Math.max(doc.y, y + 17);
      doc.moveDown(0.15);

      labeledLine("Arquivo:linha", f.location);
      if (f.snippet) codeBlock(f.snippet);
      labeledLine("Por que é explorável", f.why);
      if (!f.isStrengthNote) {
        labeledLine("Impacto", f.impact);
        labeledLine("Condição de exploração", f.exploitCondition);
      }
      labeledLine(f.isStrengthNote ? "Observação" : "Recomendação", f.recommendation);

      ensureSpace(14);
      doc.moveDown(0.3);
      doc.moveTo(x, doc.y).lineTo(x + CONTENT_WIDTH, doc.y).strokeColor(COLOR.border).lineWidth(0.7).stroke();
      doc.moveDown(0.5);
    });
  });
}

// ---------- recommendations ----------

function drawRecommendations() {
  doc.addPage();
  sectionTitle("Recomendações priorizadas", { noGapBefore: true });

  const groups = {};
  recommendations.forEach((r) => {
    groups[r.priority] = groups[r.priority] || [];
    groups[r.priority].push(r.text);
  });

  const prioColor = { P1: severityMeta.critica.color, P2: severityMeta.media.color, P3: severityMeta.baixa.color };
  const prioDesc = {
    P1: "Ação imediata — riscos críticos com exploração direta e alto impacto.",
    P2: "Curto prazo — riscos relevantes, exploração requer alguma condição adicional.",
    P3: "Médio prazo — hardening e consistência, sem exploração direta identificada.",
  };

  Object.entries(groups).forEach(([prio, items]) => {
    ensureSpace(50);
    doc.moveDown(0.4);
    const x = doc.page.margins.left;
    const y = doc.y;
    const badgeW = 34, badgeH = 20;
    doc.roundedRect(x, y, badgeW, badgeH, 4).fill(prioColor[prio] || COLOR.muted);
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(11).text(prio, x, y + 5, { width: badgeW, align: "center" });
    doc.fillColor(COLOR.muted).font("Helvetica-Oblique").fontSize(9.5).text(prioDesc[prio] || "", x + badgeW + 10, y + 5, { width: CONTENT_WIDTH - badgeW - 10 });
    doc.y = Math.max(doc.y, y + badgeH);
    doc.moveDown(0.35);

    items.forEach((text) => {
      ensureSpace(28);
      const bx = doc.page.margins.left + 10;
      doc.circle(bx, doc.y + 5, 2).fill(COLOR.navy);
      doc.font("Helvetica").fontSize(10).fillColor(COLOR.text).text(text, bx + 10, doc.y, { width: CONTENT_WIDTH - 10, lineGap: 1 });
      doc.moveDown(0.3);
    });
  });
}

// ---------- github issues ----------

function drawGithubIssues() {
  doc.addPage();
  sectionTitle("Issues para o GitHub", { noGapBefore: true });
  bodyText(
    "Texto completo, pronto para copiar e colar, de uma issue em Markdown por bloco delimitado. Achados triviais/relacionados foram agrupados numa única issue para evitar spam."
  );
  doc.moveDown(0.4);

  githubIssues.forEach((issue, idx) => {
    const n = idx + 1;
    ensureSpace(30);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR.muted).text(`--- ISSUE ${n} ---`);
    doc.moveDown(0.2);

    const fullMd = `### Título\n${issue.title}\n\n### Labels sugeridas\n${issue.labels.join(", ")}\n\n${issue.body}`;
    const padX = 10, padY = 9;
    doc.font("CourierNew").fontSize(7.6);
    const width = CONTENT_WIDTH - padX * 2;

    // paginate the markdown block manually so it can span multiple pages
    const lines = fullMd.split("\n");
    let buffer = [];
    const flush = () => {
      if (buffer.length === 0) return;
      const text = buffer.join("\n");
      const h = doc.heightOfString(text, { width }) + padY * 2;
      ensureSpace(h + 4);
      const x = doc.page.margins.left;
      const y = doc.y;
      doc.rect(x, y, CONTENT_WIDTH, h).fill("#0f172a");
      doc.fillColor("#e2e8f0").font("CourierNew").fontSize(7.6).text(text, x + padX, y + padY, { width });
      doc.y = y + h + 4;
      buffer = [];
    };

    // chunk into ~40-line groups so each heightOfString call stays cheap and
    // ensureSpace can break pages between chunks instead of mid-block
    const CHUNK = 42;
    for (let i = 0; i < lines.length; i += CHUNK) {
      buffer = lines.slice(i, i + CHUNK);
      flush();
    }

    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR.muted).text(`--- FIM ISSUE ${n} ---`);
    doc.moveDown(0.7);
    doc.fillColor(COLOR.text).font("Helvetica").fontSize(10.2);
  });
}

// ---------- header / footer pass ----------

function applyHeaderFooter() {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const isCover = i === range.start;
    const pw = doc.page.width;
    const ph = doc.page.height;

    // Drawing inside the page margins (header/footer strips) would otherwise
    // trigger pdfkit's automatic pagination (it treats any .text() call past
    // page.maxY()/before margins.top as overflow and silently inserts a new
    // page). Zeroing the margins for the duration of this draw disables that
    // check without affecting already-laid-out body content.
    const savedTop = doc.page.margins.top;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;

    if (!isCover) {
      doc.save();
      doc.rect(0, 0, pw, 42).fill(COLOR.navy);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text(REPORT_NAME, 30, 14, { width: pw - 60, ellipsis: true, lineBreak: false });
      doc.restore();
    }

    doc.save();
    doc.moveTo(30, ph - 34).lineTo(pw - 30, ph - 34).strokeColor(COLOR.border).lineWidth(0.7).stroke();
    doc.fillColor(COLOR.muted).font("Helvetica").fontSize(8);
    doc.text(REPORT_NAME, 30, ph - 26, { width: pw - 120, lineBreak: false });
    doc.text(`Página ${i - range.start + 1} de ${range.count}`, pw - 150, ph - 26, { width: 120, align: "right", lineBreak: false });
    doc.restore();

    doc.page.margins.top = savedTop;
    doc.page.margins.bottom = savedBottom;
  }
}

// ---------- build ----------

drawCover();
drawMethodology();
drawExecutiveSummary();
drawStrengthsWeaknesses();
drawFindingsTable();
drawRecommendations();
drawGithubIssues();
applyHeaderFooter();

// Page count must be read before end() flushes the buffered pages —
// afterwards bufferedPageRange() reports 0.
const finalPageCount = doc.bufferedPageRange().count;
doc.end();

stream.on("finish", () => {
  console.log(`PDF gerado: ${OUT_PATH}`);
  console.log(`Páginas: ${finalPageCount}`);
});
