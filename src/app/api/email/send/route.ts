import { NextRequest, NextResponse } from "next/server";
import { authenticateFirebaseRequest, clientIp, firebaseBearerToken, isSameOrigin, rejectPreflight } from "@/lib/api-guards";
import { fixedWindowLimit } from "@/lib/rate-limit";
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

async function maySendEmail(request: NextRequest, userId: string): Promise<boolean> {
  const token = firebaseBearerToken(request);
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!token || !projectId) return false;
  try {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(userId)}`,
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!response.ok) return false;
    const document = (await response.json()) as { fields?: { role?: { stringValue?: string } } };
    return ["admin", "gerente"].includes(document.fields?.role?.stringValue || "");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "origem não permitida" }, { status: 403 });
  }
  const userId = await authenticateFirebaseRequest(request);
  if (!userId) return NextResponse.json({ error: "sessão inválida" }, { status: 401 });
  if (!(await maySendEmail(request, userId))) {
    return NextResponse.json({ error: "operação não autorizada" }, { status: 403 });
  }
  const rate = await fixedWindowLimit("email", `${userId}:${clientIp(request)}`, 5, "10 m");
  if (!rate.success) return NextResponse.json({ error: rate.unavailable ? "serviço temporariamente indisponível" : "limite excedido" }, { status: rate.unavailable ? 503 : 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  if (Number(request.headers.get("content-length") || 0) > 1_048_576) return NextResponse.json({ error: "corpo muito grande" }, { status: 413 });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return NextResponse.json({ error: "serviço de e-mail não configurado" }, { status: 503 });

  try {
    const body = (await request.json()) as SendEmailBody;
    const to = Array.isArray(body.to) ? body.to.map((v) => v.trim()).filter(Boolean) : [];
    const cc = Array.isArray(body.cc) ? body.cc.map((v) => v.trim()).filter(Boolean) : [];
    if (!to.length || to.length + cc.length > 20 || [...to, ...cc].some((email) => email.length > 254 || !EMAIL_RE.test(email))) {
      return NextResponse.json({ error: "destinatários inválidos" }, { status: 400 });
    }
    if (!body.record?.id || body.record.id.length > 200 || !Array.isArray(body.fields) || body.fields.length > 200 || !body.subject?.trim() || body.subject.length > 300 || !Array.isArray(body.images || []) || (body.images?.length || 0) > 20) {
      return NextResponse.json({ error: "dados do e-mail inválidos" }, { status: 400 });
    }

    const inline = await buildInlineEmailImages(body.images || [], firebaseBearerToken(request) || undefined);
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
    console.info("email.provider.response", { status: providerResponse.status, accepted: Boolean(providerPayload.id) });
    if (!providerResponse.ok || !providerPayload.id) {
      return NextResponse.json({ error: providerPayload.message || "provedor recusou o e-mail" }, { status: 502 });
    }
    return NextResponse.json({ id: providerPayload.id });
  } catch (error) {
    console.error("email.send.failed", { kind: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "não foi possível preparar o e-mail" }, { status: 422 });
  }
}
