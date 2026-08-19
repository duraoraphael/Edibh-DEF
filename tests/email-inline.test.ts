import assert from "node:assert/strict";
import test from "node:test";
import { buildInlineEmailImages } from "../src/lib/email-inline-images.ts";
import { renderEmailReportHtml } from "../src/components/email/email-report-template.ts";

test("gera anexos PNG inline e HTML com CIDs exatamente correspondentes", async (t) => {
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "bucket.firebasestorage.app";
  const originalFetch = global.fetch;
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>');
  global.fetch = async () => new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml" } });
  t.after(() => { global.fetch = originalFetch; });

  const inline = await buildInlineEmailImages([{
    name: "inspeção.svg",
    url: "https://firebasestorage.googleapis.com/v0/b/bucket.firebasestorage.app/o/attachments%2Fimage.svg?alt=media&token=test",
  }]);
  const html = renderEmailReportHtml({
    record: { id: "R-1", status: "aprovado", authorId: "u1", data: {} },
    fields: [],
    images: inline.images,
    logoLeftUrl: inline.logoLeftUrl,
    logoRightUrl: inline.logoRightUrl,
  });

  assert.equal(inline.attachments.length, 3);
  for (const attachment of inline.attachments) {
    assert.equal(attachment.content_type, "image/png");
    assert.ok(attachment.content.length > 0);
    assert.match(html, new RegExp(`src=["']cid:${attachment.content_id}["']`));
  }
  assert.ok(!html.includes("data:image"));
  assert.ok(!html.includes("firebasestorage.googleapis.com"));
});
