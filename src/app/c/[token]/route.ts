import { NextResponse, type NextRequest } from "next/server";
import { CONFIRM_COOKIE, CONFIRM_COOKIE_MAX_AGE, userForConfirmToken } from "@/services/confirm-links";

/**
 * Link pessoal: lembra o celular (cookie) e leva ao /confirmar, que faz a
 * inscrição. O GET em si não inscreve ninguém (prévias do WhatsApp também abrem o link).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/c/[token]">) {
  const { token } = await ctx.params;
  const user = await userForConfirmToken(token);
  if (!user) return NextResponse.redirect(new URL("/confirmar?link=invalido", request.url));
  const res = NextResponse.redirect(new URL("/confirmar", request.url));
  res.cookies.set(CONFIRM_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CONFIRM_COOKIE_MAX_AGE,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
