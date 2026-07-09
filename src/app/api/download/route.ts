import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "download";
  if (!url) return NextResponse.json({ error: "url obrigatória" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "url inválida" }, { status: 400 });
  }
  if (!/^https:$/.test(target.protocol) || !target.hostname.endsWith("firebasestorage.googleapis.com")) {
    return NextResponse.json({ error: "host não permitido" }, { status: 400 });
  }

  const res = await fetch(target.toString());
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
