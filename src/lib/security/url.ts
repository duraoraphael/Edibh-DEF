/**
 * Central allowlist-based validator for every URL that comes from
 * user-controllable data (record `attachments[].url`, upload-field values)
 * and ends up as an href/src/HTML attribute somewhere in the app.
 *
 * Firestore does not validate the *contents* of `attachments[].url` — only
 * document ownership — so a value written outside the normal upload flow
 * (e.g. a direct Firestore SDK call from devtools) could contain anything,
 * including a `javascript:` URI or a string crafted to break out of an HTML
 * attribute. Every render site must go through `sanitizeAttachmentUrl` /
 * `isAllowedAttachmentUrl` instead of trusting the field directly.
 */

const ALLOWED_ATTACHMENT_HOST = "firebasestorage.googleapis.com";

function attachmentBucketPathPrefix(): string | null {
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  return bucket ? `/v0/b/${bucket}/o/` : null;
}

/**
 * True only for an https URL on the exact Firebase Storage host, scoped (when
 * the bucket env var is available) to this project's own bucket, with no
 * embedded userinfo (`https://host@evil.example/...`-style tricks). Uses
 * `new URL()` so the check inspects the *parsed* protocol/hostname — never a
 * substring/startsWith check, which is trivially bypassed
 * (`https://firebasestorage.googleapis.com.evil.example/...`).
 */
export function isAllowedAttachmentUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== ALLOWED_ATTACHMENT_HOST) return false;
  if (parsed.username || parsed.password) return false;
  const prefix = attachmentBucketPathPrefix();
  if (prefix && !parsed.pathname.startsWith(prefix)) return false;
  return true;
}

/** Returns the URL unchanged if it passes `isAllowedAttachmentUrl`, otherwise `null`. */
export function sanitizeAttachmentUrl(url: string | null | undefined): string | null {
  return isAllowedAttachmentUrl(url) ? (url as string) : null;
}
