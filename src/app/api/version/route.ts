/** Versão publicada do site: o app recarrega sozinho quando ela muda (src/components/pwa/app-refresh.tsx). */
export const dynamic = "force-dynamic";

export function GET() {
  const v = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
  return Response.json({ v }, { headers: { "cache-control": "no-store" } });
}
