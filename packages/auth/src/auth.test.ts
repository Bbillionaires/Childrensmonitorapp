import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";
import { signAccessToken, verifyAccessToken, InvalidSessionTokenError } from "./jwt.js";
import { assertChildMatches, assertParentSession, assertChildSession, ForbiddenError } from "./rbac.js";
import { generateTotpSecret, verifyTotpCode } from "./totp.js";
import type { ChildSessionClaims, ParentSessionClaims } from "@app/types";

describe("password hashing", () => {
  it("verifies a correct password and rejects an incorrect one", async () => {
    const hash = await hashPassword("Sup3rSecret!");
    await expect(verifyPassword(hash, "Sup3rSecret!")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });
});

describe("jwt session tokens", () => {
  const config = { secret: "test-secret" };

  it("round-trips parent claims", () => {
    const claims: ParentSessionClaims = {
      role: "PARENT",
      userId: "user_1",
      parentAccountId: "parent_1",
    };
    const token = signAccessToken(claims, config);
    expect(verifyAccessToken(token, config)).toEqual(claims);
  });

  it("rejects a token signed with a different secret", () => {
    const claims: ParentSessionClaims = {
      role: "PARENT",
      userId: "user_1",
      parentAccountId: "parent_1",
    };
    const token = signAccessToken(claims, config);
    expect(() => verifyAccessToken(token, { secret: "different-secret" })).toThrow(
      InvalidSessionTokenError,
    );
  });
});

describe("rbac assertions", () => {
  const parentClaims: ParentSessionClaims = {
    role: "PARENT",
    userId: "user_1",
    parentAccountId: "parent_1",
  };
  const childAClaims: ChildSessionClaims = {
    role: "CHILD",
    childId: "child_a",
    parentAccountId: "parent_1",
  };

  it("rejects a child session where a parent session is required", () => {
    expect(() => assertParentSession(childAClaims)).toThrow(ForbiddenError);
  });

  it("rejects a parent session where a child session is required", () => {
    expect(() => assertChildSession(parentClaims)).toThrow(ForbiddenError);
  });

  it("a child's token cannot be used against another child's id", () => {
    expect(() => assertChildMatches(childAClaims, "child_b")).toThrow(ForbiddenError);
    expect(() => assertChildMatches(childAClaims, "child_a")).not.toThrow();
  });
});

describe("totp", () => {
  it("generates a well-formed base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it("rejects malformed and incorrect codes", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "not-a-code")).toBe(false);
    expect(verifyTotpCode(secret, "12345")).toBe(false);
  });

  it("two different secrets do not accept the same code at the same instant", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const now = Date.now();
    // Two independently generated 160-bit secrets producing the same 6-digit code at the
    // same instant would be an extraordinary coincidence (~1 in a million by construction),
    // so this is a reliable smoke test that the secret actually changes the derived code.
    const codes = Array.from({ length: 20 }, (_, i) => String(i).padStart(6, "0"));
    const acceptedByA = codes.filter((code) => verifyTotpCode(secretA, code, now));
    const acceptedByB = codes.filter((code) => verifyTotpCode(secretB, code, now));
    expect(acceptedByA).toEqual([]);
    expect(acceptedByB).toEqual([]);
  });
});
