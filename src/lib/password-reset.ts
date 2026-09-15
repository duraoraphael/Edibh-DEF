import { authErrorMessage } from "./auth-errors";

export const PASSWORD_RESET_SUCCESS = "Se existir uma conta com este e-mail, você receberá as instruções para redefinir sua senha.";
export const PASSWORD_RESET_PROVIDER_NOTICE = "Este fluxo redefine a senha de acesso por e-mail deste site. Ele não altera sua senha do Google ou da Microsoft. Se você usa esses provedores, continue entrando pelo provedor.";

export function passwordResetErrorMessage(error: unknown): string {
  const { code, retryAfter } = (error ?? {}) as { code?: string; retryAfter?: string | number };
  if (code === "auth/invalid-email") return "Informe um e-mail válido.";
  if (code === "app/rate-limited") return authErrorMessage(code, retryAfter);
  if (code === "auth/too-many-requests") return "Muitas solicitações. Aguarde alguns minutos e tente novamente.";
  if (code === "auth/network-request-failed") return "Falha de conexão. Verifique sua internet e tente novamente.";
  if (["auth/operation-not-allowed", "auth/unauthorized-continue-uri", "auth/invalid-continue-uri", "auth/configuration-error"].includes(code || "")) {
    return "A redefinição de senha está indisponível. Contate o administrador.";
  }
  return "Não foi possível enviar as instruções. Tente novamente mais tarde.";
}
