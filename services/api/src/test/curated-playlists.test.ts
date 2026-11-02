import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@app/database";

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://app:app@localhost:5432/childrensmonitorapp";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
process.env.WEB_APP_ORIGIN ??= "http://localhost:3000";
delete process.env.RESEND_API_KEY;
// Deliberately unset — a curated playlist import from a YouTube URL must still fail honestly
// (503) without a key, same discipline as every other provider-backed path in this app.
delete process.env.YOUTUBE_API_KEY;

const { buildApp } = await import("../app.js");
const { prisma } = (await import("@app/database")) as { prisma: PrismaClient };
const { hashPassword } = await import("@app/auth");
const { registerParent, createChild, cookieHeader, jarFromInjectResponse } = await import("./helpers.js");

async function createAdminJar(app: FastifyInstance, email: string) {
  await prisma.user.create({ data: { email, passwordHash: await hashPassword("AdminPassw0rd!"), role: "ADMIN" } });
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/login",
    payload: { email, password: "AdminPassw0rd!" },
  });
  expect(response.statusCode).toBe(200);
  return jarFromInjectResponse(response.cookies);
}

describe("Milestone 12: curated playlist marketplace", () => {
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
    await prisma.curatedPlaylist.deleteMany();
  });

  it("creates a curated playlist, adds a video, and re-adding the same URL updates rather than duplicates the item", async () => {
    const adminJar = await createAdminJar(app, "curator@example.com");

    const create = await app.inject({
      method: "POST",
      url: "/api/admin/curated-playlists",
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { title: "Science for kids" },
    });
    expect(create.statusCode).toBe(201);
    const playlistId = create.json().playlist.id as string;

    const addOnce = await app.inject({
      method: "POST",
      url: `/api/admin/curated-playlists/${playlistId}/videos`,
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { url: "https://example.com/video-1" },
    });
    expect(addOnce.statusCode).toBe(201);
    expect(addOnce.json().playlist.items).toHaveLength(1);

    // Same URL added a second time (mirrors a source playlist listing the same video twice,
    // which is what crashed playlist-service.ts's importPlaylist before it was fixed to
    // upsert rather than create) — must update the existing item, not add a duplicate.
    const addAgain = await app.inject({
      method: "POST",
      url: `/api/admin/curated-playlists/${playlistId}/videos`,
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { url: "https://example.com/video-1" },
    });
    expect(addAgain.statusCode).toBe(201);
    expect(addAgain.json().playlist.items).toHaveLength(1);
  });

  it("an unpublished curated playlist never appears in the parent marketplace; publishing it does", async () => {
    const adminJar = await createAdminJar(app, "curator2@example.com");
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/curated-playlists",
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { title: "Draft playlist" },
    });
    const playlistId = create.json().playlist.id as string;

    const parentJar = await registerParent(app, "browsing-parent@example.com");

    const beforePublish = await app.inject({
      method: "GET",
      url: "/api/parents/marketplace",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(beforePublish.json().playlists).toHaveLength(0);

    const publish = await app.inject({
      method: "PATCH",
      url: `/api/admin/curated-playlists/${playlistId}/publish`,
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { published: true },
    });
    expect(publish.statusCode).toBe(200);

    const afterPublish = await app.inject({
      method: "GET",
      url: "/api/parents/marketplace",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(afterPublish.json().playlists).toHaveLength(1);
    expect(afterPublish.json().playlists[0]).toMatchObject({ id: playlistId, title: "Draft playlist" });
  });

  it("a parent adding a marketplace playlist clones it into their own library and it enters their child's review queue; re-adding is idempotent", async () => {
    const adminJar = await createAdminJar(app, "curator3@example.com");
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/curated-playlists",
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { title: "Marketplace playlist" },
    });
    const playlistId = create.json().playlist.id as string;
    await app.inject({
      method: "POST",
      url: `/api/admin/curated-playlists/${playlistId}/videos`,
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { url: "https://example.com/curated-video" },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/admin/curated-playlists/${playlistId}/publish`,
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { published: true },
    });

    const parentJar = await registerParent(app, "adds-marketplace@example.com");
    const childId = await createChild(app, parentJar, "Marketplace Kid");

    const add = await app.inject({
      method: "POST",
      url: `/api/parents/marketplace/${playlistId}/add`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().playlist.items).toHaveLength(1);

    const queue = await app.inject({
      method: "GET",
      url: `/api/parents/children/${childId}/queue?filter=PENDING`,
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(queue.json().items).toHaveLength(1);
    expect(queue.json().items[0].content.title).toBeTruthy();

    // Adding the same marketplace playlist again must update the existing clone (keyed by
    // (ownerParentAccountId, sourceCuratedPlaylistId)), not create a second Playlist row.
    const addAgain = await app.inject({
      method: "POST",
      url: `/api/parents/marketplace/${playlistId}/add`,
      headers: { cookie: cookieHeader(parentJar), "x-csrf-token": parentJar.csrfToken! },
    });
    expect(addAgain.statusCode).toBe(201);

    const playlists = await app.inject({
      method: "GET",
      url: "/api/parents/playlists",
      headers: { cookie: cookieHeader(parentJar) },
    });
    expect(playlists.json().playlists).toHaveLength(1);
    expect(playlists.json().playlists[0].items).toHaveLength(1);
  });

  it("importing a curated playlist from a YouTube URL without YOUTUBE_API_KEY fails honestly", async () => {
    const adminJar = await createAdminJar(app, "curator4@example.com");
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/curated-playlists",
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { title: "Needs a real key" },
    });
    const playlistId = create.json().playlist.id as string;

    const response = await app.inject({
      method: "POST",
      url: `/api/admin/curated-playlists/${playlistId}/import`,
      headers: { cookie: cookieHeader(adminJar), "x-csrf-token": adminJar.csrfToken! },
      payload: { url: "https://www.youtube.com/playlist?list=PLabcdefghijklmnopqrstuv" },
    });
    expect(response.statusCode).toBe(503);
  });
});
