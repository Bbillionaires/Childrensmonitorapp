import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
process.env.STRIPE_PARENT_PRICE_ID = "price_parent_fake";
delete process.env.RESEND_API_KEY;
delete process.env.YOUTUBE_API_KEY;

// Same package-boundary mock as billing.test.ts — mocking "stripe" directly doesn't reliably
// intercept a dependency-of-a-dependency across this pnpm workspace.
const createCheckoutSessionMock = vi.fn();

vi.mock("@app/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/billing")>();
  return {
    ...actual,
    createBillingClient: vi.fn((secretKey: string | undefined) =>
      secretKey ? { createCheckoutSession: createCheckoutSessionMock } : undefined,
    ),
  };
});

const { buildApp } = await import("../app.js");
const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };
const { hashPassword } = await import("@app/auth");
const { registerParent, createChild, cookieHeader, jarFromInjectResponse } = await import("./helpers.js");

async function createAdmin(email: string, password = "AdminPassw0rd!"): Promise<void> {
  await prisma.user.create({ data: { email, passwordHash: await hashPassword(password), role: "ADMIN" } });
}

async function loginAdmin(app: FastifyInstance, email: string, password = "AdminPassw0rd!") {
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/login",
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return jarFromInjectResponse(response.cookies);
}

describe("Milestone 12: admin console", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    createCheckoutSessionMock.mockReset();
    await prisma.user.deleteMany();
  });

  it("logs an admin in, but rejects a parent's credentials against the admin login", async () => {
    await createAdmin("root@example.com");
    const jar = await loginAdmin(app, "root@example.com");
    expect(jar.accessToken).toBeTruthy();

    const me = await app.inject({ method: "GET", url: "/api/admin/me", headers: { cookie: cookieHeader(jar) } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ id: expect.any(String), email: "root@example.com" });

    await registerParent(app, "parent@example.com");
    const wrongRole = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { email: "parent@example.com", password: "Str0ngPassw0rd!" },
    });
    expect(wrongRole.statusCode).toBe(401);
  });

  it("rejects a parent session (and no session at all) from every /api/admin route", async () => {
    const parentJar = await registerParent(app, "parent2@example.com");

    const noSession = await app.inject({ method: "GET", url: "/api/admin/subscribers" });
    expect(noSession.statusCode).toBe(401);

    const wrongSession = await app.inject({
      method: "GET",
      url: "/api/admin/subscribers",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(wrongSession.statusCode).toBe(401);
  });

  it("creates a subscriber with no password ever exposed, and sends a set-password reset token", async () => {
    await createAdmin("root2@example.com");
    const adminJar = await loginAdmin(app, "root2@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/subscribers",
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { displayName: "New Parent", email: "new-parent@example.com" },
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.stringify(response.json())).not.toMatch(/password/i);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "new-parent@example.com" },
      include: { parentAccount: true },
    });
    expect(user.role).toBe("PARENT");
    expect(user.parentAccount).not.toBeNull();

    const resetTokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(resetTokens).toHaveLength(1);

    const list = await app.inject({
      method: "GET",
      url: "/api/admin/subscribers",
      headers: { cookie: cookieHeader(adminJar) },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().subscribers).toHaveLength(1);
    expect(list.json().subscribers[0]).toMatchObject({ email: "new-parent@example.com", childCount: 0 });
  });

  it("sends a Stripe payment link for a subscriber without ever collecting a card itself", async () => {
    await createAdmin("root3@example.com");
    const adminJar = await loginAdmin(app, "root3@example.com");
    const parentJar = await registerParent(app, "needs-payment@example.com");
    void parentJar;

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "needs-payment@example.com" },
      include: { parentAccount: true },
    });

    createCheckoutSessionMock.mockResolvedValueOnce({ id: "cs_test_1", url: "https://checkout.stripe.com/test" });

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/subscribers/${user.parentAccount!.id}/payment-link`,
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerKind: "parent", ownerId: user.parentAccount!.id }),
    );
  });

  it("scopes every subscriber-acting action to the parentAccountId in the URL — mismatched ids 404 rather than leaking across accounts", async () => {
    await createAdmin("root4@example.com");
    const adminJar = await loginAdmin(app, "root4@example.com");

    const parentAJar = await registerParent(app, "parent-a@example.com");
    const childAId = await createChild(app, parentAJar, "Kid A");
    const parentBUser = await (async () => {
      await registerParent(app, "parent-b@example.com");
      return prisma.user.findUniqueOrThrow({ where: { email: "parent-b@example.com" }, include: { parentAccount: true } });
    })();

    // Decisioning on child A, but naming parent B's account in the URL — assertOwnedChild
    // inside decideApproval must reject this as "child not found", not silently decide it.
    const decide = await app.inject({
      method: "POST",
      url: `/api/admin/subscribers/${parentBUser.parentAccount!.id}/children/${childAId}/decisions`,
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { contentId: "nonexistent-content-id", decision: "APPROVED" },
    });
    expect(decide.statusCode).toBe(404);

    // Same for removing a playlist item: a playlistId/itemId that belongs to nobody (or to a
    // different account than the one named) must 404, not succeed.
    const removeItem = await app.inject({
      method: "DELETE",
      url: `/api/admin/subscribers/${parentBUser.parentAccount!.id}/playlists/nonexistent-playlist/items/nonexistent-item`,
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
    });
    expect(removeItem.statusCode).toBe(404);
  });
});
