import { NextResponse, type NextRequest } from "next/server";
import { CONFIRM_COOKIE } from "@/services/confirm-links";

/** "Não é você?": esquece o link pessoal lembrado neste navegador. */
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/confirmar", request.url));
  res.cookies.delete(CONFIRM_COOKIE);
  return res;
}
