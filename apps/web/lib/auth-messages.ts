/** Traduz erros do Supabase Auth para mensagens claras em PT-BR (sem revelar se o e-mail existe). */
export function authErrorMessage(message: string, code?: string): string {
  const m = message.toLowerCase();
  if (code === "invalid_credentials" || m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (code === "email_not_confirmed" || m.includes("email not confirmed")) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (code === "weak_password" || m.includes("password should be")) return "Senha fraca. Use pelo menos 8 caracteres.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || m.includes("rate limit")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  if (code === "signup_disabled" || m.includes("signups not allowed")) return "Novos cadastros estão desativados.";
  if (m.includes("user already registered")) return "Não foi possível criar a conta com esses dados. Tente entrar ou recuperar a senha.";
  return "Não foi possível concluir. Tente novamente.";
}

export const MIN_PASSWORD_LENGTH = 8;

export function validateCredentials(email: string, password: string, needsStrong: boolean): string | null {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Informe um e-mail válido.";
  if (needsStrong && password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!password) return "Informe a senha.";
  return null;
}
