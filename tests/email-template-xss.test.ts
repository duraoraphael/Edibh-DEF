import assert from "node:assert/strict";
import test from "node:test";
import { renderEmailReportHtml } from "../src/components/email/email-report-template.ts";
import type { AppRecord, FormField } from "../src/types/index.ts";

const fields: FormField[] = [
  { id: "f1", key: "instalacao", type: "texto", label: "Instalação", order: 0 },
];

const baseRecord: AppRecord = {
  id: "rec1",
  recordNumber: "001/2026",
  status: "pendente",
  authorId: "author1",
  data: { instalacao: "Plataforma X" },
};

// Firestore only checks document ownership on `attachments`, never the shape
// of each entry's `url` — a value like this could reach the record via a
// direct SDK write that bypasses the normal upload UI entirely.
const MALICIOUS_QUERY = '"><script>window.__xssFired = true;</script>';
const maliciousButAllowedHostUrl =
  `https://firebasestorage.googleapis.com/v0/b/demo-bucket/o/x?n=${MALICIOUS_QUERY}`;

test("a same-host URL carrying an HTML-breakout payload is escaped, not executed", () => {
  const html = renderEmailReportHtml({
    record: baseRecord,
    fields,
    images: [{ name: "foto.png", url: maliciousButAllowedHostUrl }],
  });
  assert.ok(!html.includes("<script>"), "raw <script> tag must never appear in the generated HTML");
  assert.ok(!html.includes(MALICIOUS_QUERY), "the raw unescaped payload must not appear verbatim");
  assert.ok(html.includes("&lt;script&gt;"), "the payload must appear HTML-escaped instead");
});

test("a javascript: URI attachment is dropped from the rendered report entirely", () => {
  const html = renderEmailReportHtml({
    record: baseRecord,
    fields,
    images: [{ name: "foto.png", url: "javascript:alert(document.cookie)" }],
  });
  assert.ok(!html.includes("javascript:"), "javascript: scheme must never reach the output HTML");
});

test("a cid-backed image (server-side inline path) still renders normally", () => {
  const html = renderEmailReportHtml({
    record: baseRecord,
    fields,
    images: [{ name: "foto.png", url: "https://firebasestorage.googleapis.com/ignored", cid: "registro-1" }],
  });
  assert.ok(html.includes('src="cid:registro-1"'));
});

test("field labels and values are still HTML-escaped", () => {
  const html = renderEmailReportHtml({
    record: { ...baseRecord, data: { instalacao: '<img src=x onerror=alert(1)>' } },
    fields,
    images: [],
  });
  assert.ok(!html.includes("<img src=x onerror"));
  assert.ok(html.includes("&lt;img"));
});
