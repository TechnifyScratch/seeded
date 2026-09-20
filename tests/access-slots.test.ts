import { afterEach, expect, it, vi } from "vitest";
import { configuredSlot } from "../lib/server/access-slots";
afterEach(() => vi.unstubAllEnvs());
it("matches each configured code and rejects a replaced code", () => {
  vi.stubEnv("SEEDED_ACCESS_CODE_1", "first-private-code-123456");
  vi.stubEnv("SEEDED_ACCESS_CODE_2", "second-private-code-123456");
  expect(configuredSlot("first-private-code-123456")).toBe(1);
  expect(configuredSlot("second-private-code-123456")).toBe(2);
  expect(configuredSlot("unrecognized-code-123456")).toBeNull();
  vi.stubEnv("SEEDED_ACCESS_CODE_1", "replacement-code-123456");
  expect(configuredSlot("first-private-code-123456")).toBeNull();
  expect(configuredSlot("replacement-code-123456")).toBe(1);
});
it("rejects duplicate codes rather than choosing an identity", () => {
  vi.stubEnv("SEEDED_ACCESS_CODE_1", "same-private-code-123456");
  vi.stubEnv("SEEDED_ACCESS_CODE_2", "same-private-code-123456");
  expect(() => configuredSlot("same-private-code-123456")).toThrow(
    "must be different",
  );
});
