import { redirect } from "next/navigation";
import { connection } from "next/server";
import { loginRequired } from "@/lib/access";

/**
 * Sem login obrigatório (uso interno), a tela de login não é necessária: segue para o app.
 * `connection()` garante que isto é decidido a cada requisição (e não congelado no build).
 */
export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!loginRequired()) redirect("/inbox");
  return children;
}
