import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_EMAIL_IMAGE_BYTES = 24 * 1024 * 1024;

export interface InlineImageSource {
  name: string;
  url: string;
}

export interface InlineAttachment {
  filename: string;
  content: string;
  content_id: string;
  content_type: "image/png";
}

function safeBaseName(name: string, fallback: string): string {
  const cleaned = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned || fallback;
}

function assertFirebaseStorageUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") {
    throw new Error("A imagem não está em uma URL HTTPS do Firebase Storage permitida.");
  }
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (bucket && !url.pathname.startsWith(`/v0/b/${bucket}/o/`)) {
    throw new Error("A imagem pertence a um bucket Firebase não permitido.");
  }
  return url;
}

async function toOutlookPng(input: Buffer): Promise<Buffer> {
  const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.format) throw new Error("O anexo não contém uma imagem válida.");
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function fetchImage(source: InlineImageSource): Promise<Buffer> {
  const url = assertFirebaseStorageUrl(source.url);
  const response = await fetch(url, { redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error(`Firebase Storage respondeu HTTP ${response.status} para ${source.name}.`);
  const advertisedLength = Number(response.headers.get("content-length") || 0);
  if (advertisedLength > MAX_INLINE_IMAGE_BYTES) throw new Error(`${source.name} excede 8 MB.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_INLINE_IMAGE_BYTES) throw new Error(`${source.name} tem tamanho inválido.`);
  return bytes;
}

export async function buildInlineEmailImages(sources: InlineImageSource[]) {
  const logoSources = [
    { name: "logo-cim.png", cid: "logo-cim", file: "logo-cim.png" },
    { name: "logo-petrobras.png", cid: "logo-petrobras", file: "petrobras.png" },
  ];
  const attachments: InlineAttachment[] = [];
  const images: Array<InlineImageSource & { cid: string }> = [];
  let totalBytes = 0;

  for (const logo of logoSources) {
    const raw = await readFile(path.join(process.cwd(), "public", logo.file));
    const png = await toOutlookPng(raw);
    totalBytes += png.length;
    attachments.push({ filename: logo.name, content: png.toString("base64"), content_id: logo.cid, content_type: "image/png" });
  }

  for (const [index, source] of sources.entries()) {
    const png = await toOutlookPng(await fetchImage(source));
    totalBytes += png.length;
    if (totalBytes > MAX_EMAIL_IMAGE_BYTES) throw new Error("As imagens do e-mail excedem o limite seguro de 24 MB.");
    const cid = `registro-${index + 1}`;
    const stem = safeBaseName(source.name, `imagem-${index + 1}`).replace(/\.[^.]+$/, "");
    attachments.push({ filename: `${stem}.png`, content: png.toString("base64"), content_id: cid, content_type: "image/png" });
    images.push({ ...source, cid });
  }

  return { attachments, images, logoLeftUrl: "cid:logo-cim", logoRightUrl: "cid:logo-petrobras" };
}
