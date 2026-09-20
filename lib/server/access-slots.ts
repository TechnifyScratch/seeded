import "server-only";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { hashAccessCode } from "@/lib/domain/access-code";
import { db, rpc, unwrap } from "./db";
import { HttpError } from "./auth";

export function configuredSlot(code: string): number | null {
  const codes = [
    process.env.SEEDED_ACCESS_CODE_1,
    process.env.SEEDED_ACCESS_CODE_2,
  ];
  const hashes = codes.map((value) => (value ? hashAccessCode(value) : null));
  if (hashes[0] && hashes[0] === hashes[1])
    throw new HttpError(
      503,
      "The two configured access codes must be different.",
    );
  const supplied = Buffer.from(hashAccessCode(code), "hex");
  const index = hashes.findIndex(
    (hash) => hash && timingSafeEqual(supplied, Buffer.from(hash, "hex")),
  );
  return index < 0 ? null : index + 1;
}

export async function slotProfile(
  slot: number,
  firstName?: string,
  lastName?: string,
): Promise<string | null> {
  const client = db();
  const existing = unwrap(
    await client
      .from("access_slots")
      .select("profile_id")
      .eq("slot", slot)
      .maybeSingle(),
  ) as { profile_id: string } | null;
  if (existing) return existing.profile_id;
  if (!firstName || !lastName) return null;
  const email = `${randomUUID()}@seeded.invalid`;
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: randomBytes(48).toString("base64url"),
    email_confirm: true,
  });
  if (error || !data.user)
    throw new HttpError(503, "Unable to register. Please try again.");
  // The transaction chooses one winner if two people claim the same slot together.
  // Do not delete on an ambiguous RPC failure: the transaction may have committed.
  const profileId = (await rpc("claim_access_slot", {
    p_slot: slot,
    p_user: data.user.id,
    p_email: email,
    p_first: firstName,
    p_last: lastName,
  })) as string;
  if (profileId !== data.user.id)
    await client.auth.admin.deleteUser(data.user.id);
  return profileId;
}
