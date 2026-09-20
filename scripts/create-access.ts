import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { hashAccessCode } from "../lib/domain/access-code";
const role = z.enum(["admin", "observer"]).parse(process.argv[2] ?? "admin");
const label =
  process.argv[3] ??
  (role === "admin" ? "Research administrator" : "Research observer");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("Set Supabase credentials in .env.local first.");
const codeHash = process.env.SEEDED_ACCESS_CODE
  ? hashAccessCode(
      z.string().min(32).max(256).parse(process.env.SEEDED_ACCESS_CODE),
    )
  : z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(process.env.SEEDED_ACCESS_CODE_SHA256);
const client = createClient(url, key, { auth: { persistSession: false } });
const existing = await client
  .from("access_codes")
  .select("profile_id")
  .eq("code_hash", codeHash)
  .maybeSingle();
if (existing.error) throw existing.error;
if (existing.data) throw new Error("This code has already been provisioned.");
const email = `${randomUUID()}@seeded.invalid`;
const { data, error } = await client.auth.admin.createUser({
  email,
  password: randomBytes(48).toString("base64url"),
  email_confirm: true,
});
if (error) throw error;
try {
  const profile = await client
    .from("profiles")
    .insert({ id: data.user.id, email, role });
  if (profile.error) throw profile.error;
  const access = await client
    .from("access_codes")
    .insert({ profile_id: data.user.id, code_hash: codeHash, label });
  if (access.error) throw access.error;
} catch (error) {
  await client.auth.admin.deleteUser(data.user.id);
  throw error;
}
console.log(
  `Provisioned ${role} access: ${label}\nProfile ID: ${data.user.id}\nThe raw code was not stored. Observers need experiment membership in Settings.`,
);
