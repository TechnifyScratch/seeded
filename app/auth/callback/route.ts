import { NextResponse } from "next/server";
import { authClient } from "@/lib/server/db";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await (
      await authClient()
    ).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/live", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=callback", url.origin));
}
