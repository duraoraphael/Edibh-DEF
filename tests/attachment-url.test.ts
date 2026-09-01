import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedAttachmentUrl, sanitizeAttachmentUrl } from "../src/lib/security/url.ts";

test("accepts a well-formed Firebase Storage download URL", () => {
  const url = "https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/attachments%2Fu1%2Ffoo.png?alt=media&token=abc";
  assert.equal(isAllowedAttachmentUrl(url), true);
  assert.equal(sanitizeAttachmentUrl(url), url);
});

test("rejects javascript: URIs", () => {
  assert.equal(isAllowedAttachmentUrl("javascript:alert(document.cookie)"), false);
});

test("rejects data: URIs", () => {
  assert.equal(isAllowedAttachmentUrl("data:text/html,<script>alert(1)</script>"), false);
});

test("rejects vbscript:, file: and blob: schemes", () => {
  assert.equal(isAllowedAttachmentUrl("vbscript:msgbox(1)"), false);
  assert.equal(isAllowedAttachmentUrl("file:///etc/passwd"), false);
  assert.equal(isAllowedAttachmentUrl("blob:https://firebasestorage.googleapis.com/abc"), false);
});

test("rejects a non-Firebase host, including a deceptive subdomain", () => {
  assert.equal(isAllowedAttachmentUrl("https://evil.example.com/payload.png"), false);
  assert.equal(isAllowedAttachmentUrl("https://firebasestorage.googleapis.com.evil.example/x"), false);
  assert.equal(isAllowedAttachmentUrl("https://storage.googleapis.com/some-bucket/x"), false);
});

test("rejects a URL carrying embedded userinfo (host-spoofing trick)", () => {
  assert.equal(isAllowedAttachmentUrl("https://firebasestorage.googleapis.com@evil.example/x"), false);
  assert.equal(isAllowedAttachmentUrl("https://user:pass@firebasestorage.googleapis.com/x"), false);
});

test("rejects malformed or empty values", () => {
  assert.equal(isAllowedAttachmentUrl(""), false);
  assert.equal(isAllowedAttachmentUrl(undefined), false);
  assert.equal(isAllowedAttachmentUrl(null), false);
  assert.equal(isAllowedAttachmentUrl('"><script>alert(1)</script>'), false);
  assert.equal(isAllowedAttachmentUrl("not a url"), false);
});

test("rejects http (non-https) even on the right host", () => {
  assert.equal(isAllowedAttachmentUrl("http://firebasestorage.googleapis.com/v0/b/demo/o/x"), false);
});

test("sanitizeAttachmentUrl returns null for a rejected value", () => {
  assert.equal(sanitizeAttachmentUrl("javascript:alert(1)"), null);
});
