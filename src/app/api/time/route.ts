/**
 * Relógio do servidor (docs/regras-do-mix.md, seção 1). Também serve de "ping"
 * para manter o servidor aquecido e renovar a sessão (o proxy roda antes).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
