import type { ReactNode } from "react";
import { sanitizeAttachmentUrl } from "@/lib/security/url";
import { cn } from "@/lib/utils";
import type { AttachmentRef } from "@/types";

/** Every attachment rendering site (Histórico, Aprovações, ...) should use this instead of re-implementing the check. */
export function isImageAttachment(attachment: AttachmentRef): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(attachment.name) || !!attachment.contentType?.startsWith("image/");
}

/**
 * Renders `attachment.url` as a link only after it passes the shared
 * Firebase Storage allowlist (`sanitizeAttachmentUrl`). Firestore only
 * validates document ownership, not the *contents* of `attachments[].url`,
 * so this is the last line of defense against a malicious value reaching an
 * `href` — an invalid URL renders as inert, non-clickable text instead.
 */
export function AttachmentLink({
  attachment,
  className,
  children,
}: {
  attachment: AttachmentRef;
  className?: string;
  children: ReactNode;
}) {
  const url = sanitizeAttachmentUrl(attachment.url);
  if (!url) {
    return (
      <span className={cn("cursor-not-allowed opacity-60", className)} title="Anexo inválido">
        {children}
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

/** Same allowlist check as `AttachmentLink`, for the `<img>` case. Falls back to a neutral placeholder instead of an empty/broken `src`. */
export function AttachmentImage({
  attachment,
  alt,
  className,
}: {
  attachment: AttachmentRef;
  alt: string;
  className?: string;
}) {
  const url = sanitizeAttachmentUrl(attachment.url);
  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-xs text-muted-foreground", className)}>
        Anexo inválido
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
