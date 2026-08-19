import { NextRequest, NextResponse } from "next/server";
import { rejectPreflight } from "@/lib/api-guards";
import { buildInlineEmailImages, type InlineImageSource } from "@/lib/email-inline-images";
import { renderEmailReportHtml } from "@/components/email/email-report-template";
import type { AppRecord, FormField } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const OPTIONS = rejectPreflight;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SendEmailBody {
  to: string[];
  cc?: string[];
  subject: string;
  record: AppRecord;
  fields: FormField[];
  images?: InlineImageSource[];
}

async function authenticate(request: NextRequest): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!token || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: token }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { users?: Array<{ localId?: string }> };
  return payload.users?.[0]?.localId || null;
}

export async function POST(request: NextRequest) {
  const userId = await authenticate(request);
  if (!userId) return NextResponse.json({ error: "sessão inválida" }, { status: 401 });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return NextResponse.json({ error: "serviço de e-mail não configurado" }, { status: 503 });

  try {
    const body = (await request.json()) as SendEmailBody;
    const to = Array.isArray(body.to) ? body.to.map((v) => v.trim()).filter(Boolean) : [];
    const cc = Array.isArray(body.cc) ? body.cc.map((v) => v.trim()).filter(Boolean) : [];
    if (!to.length || [...to, ...cc].some((email) => !EMAIL_RE.test(email))) {
      return NextResponse.json({ error: "destinatários inválidos" }, { status: 400 });
    }
    if (!body.record?.id || !Array.isArray(body.fields) || !body.subject?.trim()) {
      return NextResponse.json({ error: "dados do e-mail inválidos" }, { status: 400 });
    }

    const inline = await buildInlineEmailImages(body.images || []);
    const html = renderEmailReportHtml({
      record: body.record,
      fields: body.fields,
      images: inline.images,
      logoLeftUrl: inline.logoLeftUrl,
      logoRightUrl: inline.logoRightUrl,
    });
    const providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, cc, subject: body.subject.trim(), html, attachments: inline.attachments }),
      cache: "no-store",
    });
    const providerPayload = (await providerResponse.json()) as { id?: string; message?: string; name?: string };
    console.info("email.provider.response", { status: providerResponse.status, payload: providerPayload, userId, recordId: body.record.id });
    if (!providerResponse.ok || !providerPayload.id) {
      return NextResponse.json({ error: providerPayload.message || "provedor recusou o e-mail" }, { status: 502 });
    }
    return NextResponse.json({ id: providerPayload.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha ao preparar e-mail";
    console.error("email.send.failed", { message, userId });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
