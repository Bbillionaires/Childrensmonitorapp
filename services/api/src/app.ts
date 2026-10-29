import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "@app/config";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import parentRoutes from "./routes/parents.js";
import contentRoutes from "./routes/content.js";
import playlistRoutes from "./routes/playlists.js";
import childRoutes from "./routes/child.js";
import { createEmailSender } from "./services/email.js";

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({ logger: env.NODE_ENV !== "test" });

  // Credentials must be sent (cookies) so `credentials: true` is required alongside a
  // specific origin — never a wildcard `*` with credentialed requests.
  await app.register(cors, { origin: env.WEB_APP_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 200, timeWindow: "1 minute" });
  await app.register(authPlugin, { env });

  const emailSender = createEmailSender(env);

  app.get("/health", async () => ({ ok: true }));

  await app.register(
    async (instance) => {
      await authRoutes(instance, { env, emailSender });
    },
    { prefix: "/api/auth" },
  );

  await app.register(
    async (instance) => {
      instance.addHook("preHandler", instance.requireParentSession);
      await parentRoutes(instance, { env });
      await contentRoutes(instance, { env });
      await playlistRoutes(instance, { env });
    },
    { prefix: "/api/parents" },
  );

  await app.register(
    async (instance) => {
      instance.addHook("preHandler", instance.requireChildSession);
      await childRoutes(instance, { env });
    },
    { prefix: "/api/child" },
  );

  return app;
}
