import { z } from "zod";
import {
  requireAccess,
  sameOrigin,
  errorResponse,
  readBody,
} from "@/lib/server/auth";
import { runCycle } from "@/lib/server/engine";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const b = z
      .strictObject({ experiment_id: z.uuid() })
      .parse(await readBody(request));
    await requireAccess(b.experiment_id, true);
    return Response.json(await runCycle(b.experiment_id));
  } catch (e) {
    return errorResponse(e);
  }
}
