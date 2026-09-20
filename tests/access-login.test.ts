import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  valid: true,
  allowed: true,
  configured: true,
  eq: vi.fn(),
  mint: vi.fn(),
  verify: vi.fn(),
  slot: vi.fn(),
  slotProfile: vi.fn(),
}));
vi.mock("../lib/server/access-slots", () => ({
  configuredSlot: mocks.slot,
  slotProfile: mocks.slotProfile,
}));
vi.mock("../lib/server/db", () => ({
  configured: () => mocks.configured,
  rpc: async () => mocks.allowed,
  unwrap: (result: { data: unknown }) => result.data,
  db: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => {
          mocks.eq(...args);
          return chain;
        },
        maybeSingle: async () => ({
          data: mocks.valid
            ? { profile_id: "test-profile", expires_at: null }
            : null,
          error: null,
        }),
        single: async () => ({
          data:
            table === "profiles"
              ? { email: "provisioned@seeded.invalid" }
              : null,
          error: null,
        }),
      };
      return chain;
    },
    auth: { admin: { generateLink: mocks.mint } },
  }),
  authClient: async () => ({ auth: { verifyOtp: mocks.verify } }),
}));
import { POST } from "../app/api/auth/code/route";
const code = "test-access-code-0000000000000000000000000000";
function request(body: unknown = { code }, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/auth/code", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.slot.mockReturnValue(null);
  mocks.slotProfile.mockResolvedValue(null);
  mocks.valid = true;
  mocks.allowed = true;
  mocks.configured = true;
  mocks.mint.mockResolvedValue({
    data: { properties: { hashed_token: "one-time-hash" } },
    error: null,
  });
  mocks.verify.mockResolvedValue({ error: null });
});
describe("Server-side code login", () => {
  it("exchanges a valid code for a server-side session without returning token or code", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.mint).toHaveBeenCalledWith({
      type: "magiclink",
      email: "provisioned@seeded.invalid",
    });
    expect(mocks.verify).toHaveBeenCalledWith({
      token_hash: "one-time-hash",
      type: "magiclink",
    });
    expect(JSON.stringify(mocks.eq.mock.calls)).not.toContain(code);
  });
  it("does not mint a session for invalid credentials", async () => {
    mocks.valid = false;
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.mint).not.toHaveBeenCalled();
  });
  it("enforces the persisted login rate limit before looking up a credential", async () => {
    mocks.allowed = false;
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(mocks.eq).not.toHaveBeenCalled();
    expect(mocks.mint).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests and caller-provided roles", async () => {
    expect(
      (await POST(request({ code }, "https://attacker.test"))).status,
    ).toBe(403);
    expect((await POST(request({ code, role: "admin" }))).status).toBe(400);
    expect(mocks.mint).not.toHaveBeenCalled();
  });
  it("reports setup requirements without creating identities", async () => {
    mocks.configured = false;
    expect((await POST(request())).status).toBe(503);
    expect(mocks.mint).not.toHaveBeenCalled();
  });
});

it("asks for names for an unclaimed configured code without creating a session", async () => {
  mocks.slot.mockReturnValue(1);
  const response = await POST(request());
  expect(await response.json()).toEqual({ needsName: true });
  expect(mocks.mint).not.toHaveBeenCalled();
});
it("saves names for the configured slot and logs in", async () => {
  mocks.slot.mockReturnValue(2);
  mocks.slotProfile.mockResolvedValue("saved-profile");
  const response = await POST(
    request({ code, firstName: " Ada ", lastName: "Lovelace" }),
  );
  expect(response.status).toBe(200);
  expect(mocks.slotProfile).toHaveBeenCalledWith(2, "Ada", "Lovelace");
  expect(mocks.eq).toHaveBeenCalledWith("id", "saved-profile");
});
it("logs a returning configured code into its existing identity without asking for names", async () => {
  mocks.slot.mockReturnValue(1);
  mocks.slotProfile.mockResolvedValue("saved-profile");
  expect(await (await POST(request())).json()).toEqual({ ok: true });
});
it("rejects blank names", async () => {
  expect(
    (await POST(request({ code, firstName: " ", lastName: "Person" }))).status,
  ).toBe(400);
});
