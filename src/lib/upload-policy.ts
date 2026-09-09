export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const extensions: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"],
  "image/webp": ["webp"], "image/gif": ["gif"],
  "application/pdf": ["pdf"], "application/msword": ["doc"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};
export const ATTACHMENT_ACCEPT = Object.values(extensions).flat().map(e => `.${e}`).join(",");

export function validateAttachment(file: Pick<File, "name" | "type" | "size">): string {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!extensions[file.type]?.includes(extension)) {
    throw new Error("Formato inválido. Use JPG, PNG, WEBP, GIF, PDF, Word ou Excel com a extensão correspondente.");
  }
  if (file.size <= 0 || file.size >= MAX_ATTACHMENT_BYTES) {
    throw new Error("O arquivo deve ter conteúdo e tamanho menor que 20 MB.");
  }
  return extension;
}

export function attachmentPath(uid: string, recordId: string, id: string, extension: string): string {
  for (const part of [uid, recordId, id, extension]) {
    if (!/^[a-zA-Z0-9_-]+$/.test(part)) throw new Error("Identificador de arquivo inválido.");
  }
  return `attachments/${uid}/${recordId}/${id}.${extension}`;
}

export const CONNECTION_MESSAGE = "Não foi possível conectar ao serviço. Verifique sua conexão, o bloqueador de anúncios ou a proteção do navegador para este site (Brave Shields). O acesso ao Firebase pode estar bloqueado.";

/** A deadline bounds the UI wait, NOT a Firebase commit. Never delete its files
 * or assume rollback just because this rejects: an acknowledgement may be lost. */
export function withDeadline<T>(operation: PromiseLike<T>, ms = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(CONNECTION_MESSAGE), { code: "app/deadline-exceeded" })), ms);
    Promise.resolve(operation).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function ownedAttachmentPathFromUrl(url: unknown, bucket: string, uid: string): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    const prefix = `/v0/b/${bucket}/o/`;
    if (parsed.origin !== "https://firebasestorage.googleapis.com" || !parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return path.startsWith(`attachments/${uid}/`) && !path.includes("..") ? path : null;
  } catch { return null; }
}

export function isDefiniteWriteFailure(error: unknown): boolean {
  const code = (error as { code?: string })?.code?.replace(/^firestore\//, "");
  return ["permission-denied", "unauthenticated", "invalid-argument", "not-found", "app/already-submitted"].includes(code || "");
}
