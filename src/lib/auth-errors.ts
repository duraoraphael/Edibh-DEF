export function normalizeEmail(email: string): string {
  return email.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim().toLowerCase();
}

export function authError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

/** Provider messages can contain input. Retain only a bounded diagnostic code. */
export function providerErrorCode(payload: unknown): string {
  const message = (payload as { error?: { message?: unknown } })?.error?.message;
  return typeof message === "string" ? /^[A-Z][A-Z_0-9]{1,79}\b/.exec(message)?.[0] || "UNKNOWN" : "UNKNOWN";
}

export function classifyProviderError(code: string, status: number) {
  if (["INVALID_LOGIN_CREDENTIALS", "INVALID_PASSWORD", "EMAIL_NOT_FOUND", "USER_DISABLED"].includes(code)) {
    return { code: "auth/invalid-credential", status: 401, credentialFailure: true };
  }
  if (code === "TOO_MANY_ATTEMPTS_TRY_LATER" || status === 429) {
    return { code: "auth/too-many-requests", status: 429, credentialFailure: false };
  }
  if (["OPERATION_NOT_ALLOWED", "PASSWORD_LOGIN_DISABLED", "API_KEY_INVALID", "PROJECT_NOT_FOUND", "CONFIGURATION_NOT_FOUND"].includes(code) || status === 403) {
    return { code: "auth/configuration-error", status: 503, credentialFailure: false };
  }
  return { code: "auth/service-unavailable", status: 503, credentialFailure: false };
}

function retryAfterText(retryAfter?: string | number | null): string {
  const seconds = Math.max(0, Math.ceil(Number(retryAfter)));
  if (!Number.isFinite(seconds) || seconds <= 0) return "alguns minutos";
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
}

export function authErrorMessage(code?: string, retryAfter?: string | number | null): string {
  if (code === "app/invalid-name") return "Informe seu nome, entre 2 e 120 caracteres.";
  if (code === "auth/weak-password") return "Use uma senha com pelo menos 6 caracteres.";
  if (code === "auth/email-already-in-use") return "Não foi possível concluir o cadastro. Se você já possui uma conta, entre ou use Esqueci minha senha.";
  if (["permission-denied", "firestore/permission-denied", "app/profile-incomplete"].includes(code || "")) return "A autenticação foi concluída, mas seu perfil de acesso precisa de recuperação. Use Recuperar cadastro ou contate o administrador.";
  if (["app/deadline-exceeded", "unavailable"].includes(code || "")) return "A operação não foi confirmada por falha de conexão. Se a conta já foi criada, entre para recuperar o cadastro.";
  if (["auth/user-token-expired", "auth/invalid-user-token"].includes(code || "")) return "Sua sessão expirou. Entre novamente.";
  if (code === "app/rate-limited") return `Muitas tentativas neste formulário. Tente novamente em ${retryAfterText(retryAfter)}.`;
  if (code === "auth/too-many-requests") return "O Firebase bloqueou temporariamente novas tentativas. Aguarde alguns minutos e tente novamente.";
  if (code === "auth/network-request-failed") return "Falha de conexão. Verifique sua internet e tente novamente.";
  if (["auth/configuration-error", "auth/configuration-not-found", "auth/unauthorized-continue-uri", "auth/invalid-api-key", "auth/api-key-not-valid", "auth/app-not-authorized", "auth/project-not-found", "auth/operation-not-allowed"].includes(code || "")) return "Erro de configuração do acesso. Contate o administrador.";
  if (code === "auth/service-unavailable") return "O serviço de acesso está temporariamente indisponível. Tente novamente mais tarde.";
  if (code === "auth/invalid-email") return "E-mail inválido.";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/user-disabled"].includes(code || "")) return "Credenciais inválidas. Verifique e tente novamente. Se necessário, use Esqueci minha senha.";
  return "Não foi possível concluir o acesso. Tente novamente.";
}

export async function checkAuthResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  const safeCodes = ["app/rate-limited", "auth/invalid-email", "auth/invalid-credential", "auth/too-many-requests", "auth/configuration-error", "auth/service-unavailable"];
  const code = safeCodes.includes(body?.code) ? body.code : response.status === 429 ? "auth/too-many-requests" : response.status === 401 ? "auth/invalid-credential" : "auth/service-unavailable";
  throw Object.assign(authError(code), { retryAfter: body?.retryAfterSeconds ?? response.headers.get("Retry-After") });
}

export async function postAuthGate(path: string, body: Record<string, string>): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  } catch {
    throw authError("auth/network-request-failed");
  }
  await checkAuthResponse(response);
}
