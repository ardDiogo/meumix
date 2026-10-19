import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Cron da Vercel: confere `Authorization: Bearer <CRON_SECRET>`. Devolve a resposta de erro, ou null se ok. */
export function cronUnauthorized(request: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 503 });
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  return null;
}
