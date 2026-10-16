import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Destino dos links enviados por e-mail (confirmação de conta e redefinição de senha). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createSupabaseServerClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/entrar?erro=link", origin));
}
