import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Capa do campeonato (guardada no banco em base64). O `?v=` na URL muda quando ela é trocada. */
export async function GET(_req: Request, ctx: RouteContext<"/api/campeonatos/[id]/banner">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return new Response(null, { status: 404 });
  const { data } = await supabase.from("championships").select("banner").eq("id", id).maybeSingle();
  if (!data?.banner) return new Response(null, { status: 404 });
  return new Response(Buffer.from(data.banner as string, "base64"), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
