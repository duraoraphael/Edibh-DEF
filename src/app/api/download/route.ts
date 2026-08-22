import { NextRequest, NextResponse } from "next/server";
import { authenticateFirebaseRequest, clientIp, firebaseBearerToken, firebaseRequestRole, isSameOrigin, rejectPreflight } from "@/lib/api-guards";
import { fixedWindowLimit } from "@/lib/rate-limit";

export const OPTIONS = rejectPreflight;

export async function GET(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "origem não permitida" }, { status: 403 });
  }
  const userId = await authenticateFirebaseRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "sessão inválida" }, { status: 401 });
  }
  const rate = await fixedWindowLimit("download", `${userId}:${clientIp(req)}`, 60, "10 m");
  if (!rate.success) return NextResponse.json({ error: rate.unavailable ? "serviço temporariamente indisponível" : "limite excedido" }, { status: rate.unavailable ? 503 : 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "download";
  if (!url) return NextResponse.json({ error: "url obrigatória" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "url inválida" }, { status: 400 });
  }
  if (!/^https:$/.test(target.protocol) || target.hostname !== "firebasestorage.googleapis.com") {
    return NextResponse.json({ error: "host não permitido" }, { status: 400 });
  }

  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(target.pathname);
  let objectPath = "";
  try { objectPath = match ? decodeURIComponent(match[2]) : ""; } catch { objectPath = ""; }
  if (!bucket || !match || match[1] !== bucket || !objectPath.startsWith("attachments/")) {
    return NextResponse.json({ error: "arquivo não permitido" }, { status: 403 });
  }
  const ownerId = objectPath.split("/")[1];
  const role = ownerId === userId ? null : await firebaseRequestRole(req, userId);
  if (ownerId !== userId && !["admin", "gerente"].includes(role || "")) {
    return NextResponse.json({ error: "operação não autorizada" }, { status: 403 });
  }

  target.searchParams.delete("token");
  target.searchParams.set("alt", "media");
  const token = firebaseBearerToken(req);
  const res = await fetch(target.toString(), { redirect: "error", headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "falha ao buscar arquivo" }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename.replace(/[\r\n]/g, ""))}`,
      "Cache-Control": "no-store",
    },
  });
}
