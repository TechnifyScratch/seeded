import { timingSafeEqual } from "node:crypto";
import { db, unwrap } from "@/lib/server/db";
import { runCycle } from "@/lib/server/engine";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    secret.length < 32 ||
    given.length !== expected.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const experiments =
      unwrap(
        await db()
          .from("experiments")
          .select("id")
          .in("status", ["running", "reflecting"])
          .eq("is_demo", false)
          .order("updated_at")
          .limit(4),
      ) ?? [];
    const results = await Promise.all(experiments.map((e) => runCycle(e.id)));
    return Response.json({ results });
  } catch {
    return Response.json({ error: "Worker unavailable" }, { status: 503 });
  }
}
