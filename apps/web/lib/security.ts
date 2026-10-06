import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function safeEqual(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Valida "Authorization: Bearer <CRON_SECRET>" (pg_cron / Vercel Cron). */
export function isAuthorizedCron(req: Request, secret: string): boolean {
  return safeEqual(req.headers.get("authorization"), `Bearer ${secret}`);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(prefix: string, bytes = 24): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}

/** Código curto e legível para parear o Telegram (sem 0/O/1/I). */
export function pairingCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}
