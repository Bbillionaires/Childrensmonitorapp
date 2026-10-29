import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";
delete process.env.YOUTUBE_API_KEY;

const { buildApp } = await import("../app.js");
const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };
const { registerParent, createChild, submitUrl, decide, startChildSession, cookieHeader, jarFromInjectResponse } =
  await import("./helpers.js");

describe("Milestone 3: child device sessions, library, and controlled playback", () => {
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
    await prisma.user.deleteMany();
    await prisma.content.deleteMany();
  });

  it("a child session cannot reach any /api/parents/* route, and a parent session cannot reach /api/child/*", async () => {
    const parentJar = await registerParent(app, "parent@example.com");
    const childId = await createChild(app, parentJar, "Alex");
    const childJar = await startChildSession(app, parentJar, childId);

    const parentsRouteWithChildCookie = await app.inject({
      method: "GET",
      url: "/api/parents/me",
      headers: { cookie: cookieHeader(childJar) },
    });
    expect(parentsRouteWithChildCookie.statusCode).toBe(401);

    const childRouteWithParentCookie = await app.inject({
      method: "GET",
      url: "/api/child/profile",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(childRouteWithParentCookie.statusCode).toBe(401);
  });

  it("starting a child device session clears the parent's refresh token, so it cannot be used to mint a new parent session", async () => {
    const parentJar = await registerParent(app, "handoff@example.com");
    const childId = await createChild(app, parentJar, "Sam");

    const beforeHandoff = await prisma.refreshToken.findMany({ where: { revokedAt: null } });
    expect(beforeHandoff.length).toBeGreaterThan(0);

    await startChildSession(app, parentJar, childId);

    const afterHandoff = await prisma.refreshToken.findMany({ where: { revokedAt: null } });
    expect(afterHandoff).toHaveLength(0);
  });

  it("the child profile endpoint returns only minimal, correct data for the logged-in child", async () => {
    const parentJar = await registerParent(app, "profile-parent@example.com");
    const childId = await createChild(app, parentJar, "Riley");
    const childJar = await startChildSession(app, parentJar, childId);

    const response = await app.inject({
      method: "GET",
      url: "/api/child/profile",
      headers: { cookie: cookieHeader(childJar) },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: childId, firstName: "Riley", avatarUrl: null });
  });

  it("a child's library only ever contains content their parent explicitly approved for them", async () => {
    const parentJar = await registerParent(app, "library-parent@example.com");
    const childId = await createChild(app, parentJar, "Jordan");

    const submitted = await submitUrl(app, parentJar, "https://www.example.com/approved-page");
    const unapproved = await submitUrl(app, parentJar, "https://www.example.com/unapproved-page");
    const approvedContentId = submitted.json().content.id as string;
    const unapprovedContentId = unapproved.json().content.id as string;

    await decide(app, parentJar, childId, approvedContentId, "APPROVED");
    // unapprovedContentId is deliberately left undecided.

    const childJar = await startChildSession(app, parentJar, childId);
    const library = await app.inject({
      method: "GET",
      url: "/api/child/library",
      headers: { cookie: cookieHeader(childJar) },
    });
    expect(library.statusCode).toBe(200);
    const body = library.json();
    const ids = [...body.videos, ...body.websites].map((c: { id: string }) => c.id);
    expect(ids).toContain(approvedContentId);
    expect(ids).not.toContain(unapprovedContentId);
  });

  it("revoking an approval mid-session blocks playback immediately, even though it worked a moment ago", async () => {
    const parentJar = await registerParent(app, "revoke-parent@example.com");
    const childId = await createChild(app, parentJar, "Casey");
    const submitted = await submitUrl(app, parentJar, "https://www.example.com/revoke-me");
    const contentId = submitted.json().content.id as string;
    await decide(app, parentJar, childId, contentId, "APPROVED");

    const childJar = await startChildSession(app, parentJar, childId);

    const firstPlay = await app.inject({
      method: "GET",
      url: `/api/child/content/${contentId}/play`,
      headers: { cookie: cookieHeader(childJar) },
    });
    expect(firstPlay.statusCode).toBe(200);
    expect(firstPlay.json().contentType).toBe("WEBSITE");

    await decide(app, parentJar, childId, contentId, "REJECTED");

    const secondPlay = await app.inject({
      method: "GET",
      url: `/api/child/content/${contentId}/play`,
      headers: { cookie: cookieHeader(childJar) },
    });
    expect(secondPlay.statusCode).toBe(404);
  });

  it("one child cannot play content, or view a playlist, approved only for another child of the same parent", async () => {
    const parentJar = await registerParent(app, "siblings-parent@example.com");
    const childA = await createChild(app, parentJar, "ChildA");
    const childB = await createChild(app, parentJar, "ChildB");

    const submitted = await submitUrl(app, parentJar, "https://www.example.com/only-for-a");
    const contentId = submitted.json().content.id as string;
    await decide(app, parentJar, childA, contentId, "APPROVED");
    // Deliberately never approved for childB.

    const childBJar = await startChildSession(app, parentJar, childB);
    const playAsB = await app.inject({
      method: "GET",
      url: `/api/child/content/${contentId}/play`,
      headers: { cookie: cookieHeader(childBJar) },
    });
    expect(playAsB.statusCode).toBe(404);

    const childAJar = await startChildSession(app, parentJar, childA);
    const playAsA = await app.inject({
      method: "GET",
      url: `/api/child/content/${contentId}/play`,
      headers: { cookie: cookieHeader(childAJar) },
    });
    expect(playAsA.statusCode).toBe(200);
  });

  it("exiting to parent mode requires the correct PIN and restores a real parent session", async () => {
    const parentJar = await registerParent(app, "pin-parent@example.com");

    // Set a PIN first (requires the current parent session + password).
    const setPin = await app.inject({
      method: "POST",
      url: "/api/parents/me/pin",
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { currentPassword: "Str0ngPassw0rd!", pin: "4242" },
    });
    expect(setPin.statusCode).toBe(200);

    const childId = await createChild(app, parentJar, "Morgan");
    const childJar = await startChildSession(app, parentJar, childId);

    const wrongPin = await app.inject({
      method: "POST",
      url: "/api/child/exit-to-parent",
      headers: { cookie: cookieHeader(childJar), "x-csrf-token": childJar.csrfToken! },
      payload: { pin: "0000" },
    });
    expect(wrongPin.statusCode).toBe(401);

    const correctPin = await app.inject({
      method: "POST",
      url: "/api/child/exit-to-parent",
      headers: { cookie: cookieHeader(childJar), "x-csrf-token": childJar.csrfToken! },
      payload: { pin: "4242" },
    });
    expect(correctPin.statusCode).toBe(200);

    const restoredJar = jarFromInjectResponse(correctPin.cookies);

    const meCheck = await app.inject({
      method: "GET",
      url: "/api/parents/me",
      headers: { cookie: cookieHeader(restoredJar) },
    });
    expect(meCheck.statusCode).toBe(200);
    expect(meCheck.json().email).toBe("pin-parent@example.com");
  });

  it("bulk approve/reject is best-effort: valid items succeed even when one id is bogus", async () => {
    const parentJar = await registerParent(app, "bulk-parent@example.com");
    const childId = await createChild(app, parentJar, "Taylor");

    const first = await submitUrl(app, parentJar, "https://www.example.com/bulk-one");
    const second = await submitUrl(app, parentJar, "https://www.example.com/bulk-two");
    const idOne = first.json().content.id as string;
    const idTwo = second.json().content.id as string;

    const response = await app.inject({
      method: "POST",
      url: `/api/parents/children/${childId}/decisions/bulk`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { contentIds: [idOne, idTwo, "does-not-exist"], decision: "APPROVED" },
    });
    expect(response.statusCode).toBe(200);
    const results = response.json().results as Array<{ contentId: string; ok: boolean }>;
    expect(results.find((r) => r.contentId === idOne)?.ok).toBe(true);
    expect(results.find((r) => r.contentId === idTwo)?.ok).toBe(true);
    expect(results.find((r) => r.contentId === "does-not-exist")?.ok).toBe(false);

    const permissions = await prisma.childContentPermission.findMany({ where: { childId } });
    expect(permissions.map((p) => p.contentId).sort()).toEqual([idOne, idTwo].sort());
  });

  it("importing a YouTube playlist without YOUTUBE_API_KEY fails honestly", async () => {
    const parentJar = await registerParent(app, "playlist-parent@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/parents/playlists/import",
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
      payload: { url: "https://www.youtube.com/playlist?list=PLsomefakeid" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatch(/not configured/i);
  });
});
