import { z } from "zod";
import {
  requireAccess,
  sameOrigin,
  errorResponse,
  readBody,
} from "@/lib/server/auth";
import { rpc } from "@/lib/server/db";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const b = z
      .strictObject({
        experiment_id: z.uuid(),
        content: z.string().trim().min(1).max(2000),
      })
      .parse(await readBody(request));
    const user = await requireAccess(b.experiment_id);
    await rpc("send_observer_message", {
      p_actor: user.id,
      p_experiment: b.experiment_id,
      p_content: b.content,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
