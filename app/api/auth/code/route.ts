import { z } from "zod";
import { createHash } from "node:crypto";
import { hashAccessCode } from "@/lib/domain/access-code";
import { configured, db, authClient, rpc, unwrap } from "@/lib/server/db";
import {
  sameOrigin,
  readBody,
  HttpError,
  errorResponse,
} from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!configured())
      throw new HttpError(
        503,
        "Connect Supabase and provision your access code before signing in.",
      );
    const address =
      request.headers.get("x-vercel-forwarded-for") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "local";
    const bucket = createHash("sha256").update(address).digest("hex");
    const globalAllowed = await rpc("consume_login_attempt", {
      p_bucket: "global",
      p_limit: 100,
    });
    const localAllowed = await rpc("consume_login_attempt", {
      p_bucket: bucket,
      p_limit: 10,
    });
    if (!globalAllowed || !localAllowed)
      throw new HttpError(429, "Too many attempts. Try again in a minute.");
    const { code } = z
      .strictObject({ code: z.string().min(16).max(256) })
      .parse(await readBody(request));
    const credential = unwrap(
      await db()
        .from("access_codes")
        .select("profile_id,expires_at")
        .eq("code_hash", hashAccessCode(code))
        .eq("enabled", true)
        .maybeSingle(),
    ) as { profile_id: string; expires_at: string | null } | null;
    if (
      !credential ||
      (credential.expires_at && Date.parse(credential.expires_at) <= Date.now())
    )
      throw new HttpError(401, "Invalid or expired access code.");
    const profile = unwrap(
      await db()
        .from("profiles")
        .select("email")
        .eq("id", credential.profile_id)
        .single(),
    ) as { email: string };
    // Mint and redeem a one-time Auth token on the server. No email is sent and no token is returned to JS.
    const { data: link, error } = await db().auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    });
    if (error || !link.properties?.hashed_token)
      throw new HttpError(
        503,
        "Unable to create a session. Try again shortly.",
      );
    const auth = await authClient();
    const { error: sessionError } = await auth.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "magiclink",
    });
    if (sessionError)
      throw new HttpError(
        503,
        "Unable to create a session. Try again shortly.",
      );
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
