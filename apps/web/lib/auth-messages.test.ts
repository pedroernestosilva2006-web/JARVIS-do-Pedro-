import { describe, expect, it } from "vitest";
import { authErrorMessage, validateCredentials } from "./auth-messages";

describe("mensagens de login", () => {
  it("traduz credenciais inválidas sem dizer se o e-mail existe", () => {
    expect(authErrorMessage("Invalid login credentials", "invalid_credentials")).toBe("E-mail ou senha incorretos.");
  });
  it("traduz senha fraca, e-mail não confirmado e limite de tentativas", () => {
    expect(authErrorMessage("Password should be at least 8 characters", "weak_password")).toContain("8 caracteres");
    expect(authErrorMessage("Email not confirmed", "email_not_confirmed")).toContain("Confirme seu e-mail");
    expect(authErrorMessage("x", "over_request_rate_limit")).toContain("Muitas tentativas");
  });
  it("conta já existente não vaza a existência do e-mail", () => {
    expect(authErrorMessage("User already registered")).not.toMatch(/já existe|already/i);
  });
  it("erro desconhecido vira mensagem genérica", () => {
    expect(authErrorMessage("boom")).toBe("Não foi possível concluir. Tente novamente.");
  });
  it("valida e-mail e tamanho mínimo da senha só no cadastro", () => {
    expect(validateCredentials("nao-e-email", "12345678", true)).toContain("e-mail válido");
    expect(validateCredentials("a@b.co", "1234567", true)).toContain("8 caracteres");
    expect(validateCredentials("a@b.co", "1234567", false)).toBeNull();
    expect(validateCredentials("a@b.co", "", false)).toBe("Informe a senha.");
    expect(validateCredentials("a@b.co", "12345678", true)).toBeNull();
  });
});
