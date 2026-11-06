import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Escudo do time (base64 no banco). O `?v=` na URL muda quando ele é trocado. */
export async function GET(_req: Request, ctx: RouteContext<"/api/campeonatos/times/[id]/logo">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return new Response(null, { status: 404 });
  const { data } = await supabase.from("championship_teams").select("logo").eq("id", id).maybeSingle();
  if (!data?.logo) return new Response(null, { status: 404 });
  return new Response(Buffer.from(data.logo as string, "base64"), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=60" },
  });
}
