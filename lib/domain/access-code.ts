import { createHash } from "node:crypto";
// Accept the escaped @ notation used when pasting a code from Markdown.
export function hashAccessCode(code: string) {
  return createHash("sha256")
    .update(code.trim().replace(/\\@/g, "@"))
    .digest("hex");
}
