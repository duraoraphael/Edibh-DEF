import { NextRequest, NextResponse } from "next/server";
import { authenticateFirebaseRequest, isSameOrigin, rejectPreflight } from "@/lib/api-guards";

export const OPTIONS = rejectPreflight;

export async function GET(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "origem não permitida" }, { status: 403 });
  }
  if (!(await authenticateFirebaseRequest(req))) {
    return NextResponse.json({ error: "sessão inválida" }, { status: 401 });
  }

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

  const res = await fetch(target.toString(), { redirect: "error" });
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "falha ao buscar arquivo" }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
