import type { AppRecord, FormField } from "@/types";
import { escapeHtml } from "@/lib/security/html";
import { isAllowedAttachmentUrl } from "@/lib/security/url";

const NAVY = "#0b2540";
const GREEN = "#0e7a4b";

function formatFieldValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

function formatEmailFieldValue(field: FormField, value: unknown): string {
  if (field.type === "data" && typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return formatFieldValue(value);
}

export interface EmailImage {
  name: string;
  url: string;
  cid?: string;
}

export interface EmailTemplateData {
  record: AppRecord;
  fields: FormField[];
  images?: EmailImage[];
  parameter?: string;
  dataSource?: string;
  logoLeftUrl?: string;
  logoRightUrl?: string;
}

function findFieldValue(record: AppRecord, fields: FormField[], keyGuess: string[]): string | null {
  const f = fields.find((x) => keyGuess.includes(x.key.toLowerCase()));
  if (!f) return null;
  const v = record.data?.[f.key];
  if (v === undefined || v === null || v === "") return null;
  return formatFieldValue(v);
}

export function buildEmailSubject(record: AppRecord, fields: FormField[]): string {
  const instalacao = findFieldValue(record, fields, ["instalacao", "instalação"]);
  const sistema = findFieldValue(record, fields, ["sistema"]);
  const equipamento = findFieldValue(record, fields, ["equipamento"]);
  return [
    `Fluxo ${record.recordNumber || record.id}`,
    "FLUXO DE EQUIPAMENTOS CRÍTICOS",
    instalacao,
    sistema,
    equipamento,
  ]
    .filter(Boolean)
    .join(" - ");
}

function dataCard(label: string, value: string, wide: boolean): string {
  return `
  <td width="${wide ? "100" : "50"}%" valign="top" style="padding:5px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
      <tr>
        <td style="padding:11px 14px;border-left:3px solid ${GREEN};">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;font-weight:bold;">${escapeHtml(label)}</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:#1f2937;margin-top:3px;">${value}</div>
        </td>
      </tr>
    </table>
  </td>`;
}

/** Fixed-layout HTML report used both for the in-app preview and the email body. Table-based markup for Outlook compatibility. */
export function renderEmailReportHtml({
  record,
  fields,
  images = [],
  parameter,
  dataSource,
  logoLeftUrl = "https://fluxocriticos.vercel.app/cim-compartilhado2.png",
  logoRightUrl = "https://fluxocriticos.vercel.app/petrobras.png",
}: EmailTemplateData): string {
  const generalFields = fields
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((f) => f.type !== "anexo" && f.type !== "textarea");
  const textFields = fields
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((f) => f.type === "textarea");

  // Firestore only enforces document ownership on `attachments`, not the
  // shape/content of each entry's `url` — a value written outside the normal
  // upload flow (direct SDK call) could be anything. Images without a
  // pre-built `cid` (server-side inline path) must have their raw URL
  // validated against the Firebase Storage allowlist before it can appear in
  // the generated HTML at all; anything else is dropped rather than
  // rendered with an empty/broken `src`.
  const safeImages = images.filter((img) => img.cid || isAllowedAttachmentUrl(img.url));

  const dataCardsRows: string[] = [];
  for (let i = 0; i < generalFields.length; i += 2) {
    const a = generalFields[i];
    const b = generalFields[i + 1];
    dataCardsRows.push(`
    <tr>
      ${dataCard(a.label, escapeHtml(formatEmailFieldValue(a, record.data?.[a.key])), !b)}
      ${b ? dataCard(b.label, escapeHtml(formatEmailFieldValue(b, record.data?.[b.key])), false) : ""}
    </tr>`);
  }

  const textSectionsHtml = textFields
    .map((f) => {
      const value = escapeHtml(formatEmailFieldValue(f, record.data?.[f.key])).replace(/\n/g, "<br/>");
      return `
      <tr>
        <td style="padding:18px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:0 0 8px 2px;">
                <span style="display:inline-block;width:4px;height:14px;background-color:${GREEN};vertical-align:middle;margin-right:8px;border-radius:2px;"></span>
                <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0f172a;vertical-align:middle;">${escapeHtml(f.label)}</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#1f2937;">
                ${value}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  const emailMetadataHtml = parameter || dataSource ? `
  <tr>
    <td style="padding:12px 19px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${parameter ? dataCard("Parâmetro", escapeHtml(parameter), !dataSource) : ""}
          ${dataSource ? dataCard("Fonte de dados", escapeHtml(dataSource), !parameter) : ""}
        </tr>
      </table>
    </td>
  </tr>` : "";

  let imagesHtml = "";
  if (safeImages.length) {
    const perRow = 3;
    const rows: string[] = [];
    for (let i = 0; i < safeImages.length; i += perRow) {
      const chunk = safeImages.slice(i, i + perRow);
      rows.push(`
        <tr>
          ${chunk
            .map(
              (img) => `
          <td width="${Math.floor(100 / perRow)}%" style="padding:5px;" valign="top">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
              <tr>
                <td style="padding:6px;">
                  <img src="${img.cid ? `cid:${img.cid}` : escapeHtml(img.url)}" alt="${escapeHtml(img.name)}" width="180" height="120" style="display:block;border:0;outline:none;text-decoration:none;width:100%;height:120px;object-fit:cover;border-radius:6px;" />
                </td>
              </tr>
            </table>
          </td>`
            )
            .join("")}
          ${chunk.length < perRow ? `<td width="${Math.floor(100 / perRow) * (perRow - chunk.length)}%"></td>` : ""}
        </tr>`);
    }
    imagesHtml = `
    <tr>
      <td style="padding:18px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:0 0 8px 2px;">
              <span style="display:inline-block;width:4px;height:14px;background-color:${GREEN};vertical-align:middle;margin-right:8px;border-radius:2px;"></span>
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0f172a;vertical-align:middle;">Imagens (${safeImages.length})</span>
            </td>
          </tr>
          ${rows.join("")}
        </table>
      </td>
    </tr>`;
  }

  return `
<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#eef1f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f5;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="660" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">

  <tr>
    <td style="background-color:#ffffff;padding:24px 32px;border-bottom:1px solid #e2e8f0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="160" valign="middle" align="left">
            <img src="${logoLeftUrl}" alt="CIM — Centro Integrado de Monitoramento" width="150" height="40" style="display:block;border:0;outline:none;text-decoration:none;width:150px;height:40px;" />
          </td>
          <td valign="middle" align="center" style="padding:0 12px;">
            <div style="font-family:Arial,Helvetica,sans-serif;color:${NAVY};font-size:15px;font-weight:bold;letter-spacing:0;line-height:1.2;text-align:center;white-space:nowrap;">Fluxo de Equipamentos Críticos</div>
          </td>
          <td width="160" valign="middle" align="right">
            <img src="${logoRightUrl}" alt="Petrobras" width="104" height="35" style="display:block;border:0;outline:none;text-decoration:none;width:104px;height:auto;" />
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr><td style="height:3px;background-color:${GREEN};line-height:3px;font-size:0;">&nbsp;</td></tr>

  <tr>
    <td style="padding:22px 24px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#0f172a;">${escapeHtml(record.recordNumber || record.id)}</td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:20px 24px 0;">
      <span style="display:inline-block;width:4px;height:14px;background-color:${GREEN};vertical-align:middle;margin-right:8px;border-radius:2px;"></span>
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0f172a;vertical-align:middle;">Dados do Registro</span>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 19px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${dataCardsRows.join("")}
      </table>
    </td>
  </tr>
  ${emailMetadataHtml}

  <tr>
    <td style="padding:0 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${textSectionsHtml}
        ${imagesHtml}
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:26px 24px 22px;">
      <div style="height:1px;background-color:#e5e7eb;"></div>
    </td>
  </tr>

  <tr>
    <td style="padding:0 24px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="70" valign="top">
            <img src="${logoLeftUrl}" alt="CIM" width="52" height="14" style="display:block;border:0;outline:none;text-decoration:none;width:52px;height:14px;opacity:0.85;" />
          </td>
          <td valign="top">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#374151;font-weight:bold;">Fluxo de Equipamentos Críticos</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b7280;margin-top:2px;">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9ca3af;margin-top:8px;">Relatório gerado automaticamente pelo sistema.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
