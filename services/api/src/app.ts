import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "@app/config";
import { createBillingClient } from "@app/billing";
import authPlugin from "./plugins/auth.js";
import apiKeyAuthPlugin from "./plugins/api-key-auth.js";
import subscriptionGatePlugin from "./plugins/subscription-gate.js";
import authRoutes from "./routes/auth.js";
import parentRoutes from "./routes/parents.js";
import contentRoutes from "./routes/content.js";
import playlistRoutes from "./routes/playlists.js";
import discoverRoutes from "./routes/discover.js";
import scoresRoutes from "./routes/scores.js";
import activityRoutes from "./routes/activity.js";
import alertsRoutes from "./routes/alerts.js";
import reportsRoutes from "./routes/reports.js";
import childRoutes from "./routes/child.js";
import { billingCheckoutRoutes, billingWebhookRoutes } from "./routes/billing.js";
import v1PublicRoutes from "./routes/v1-public.js";
import v1AnalyzeRoutes from "./routes/v1-analyze.js";
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
  await app.register(apiKeyAuthPlugin);
  await app.register(subscriptionGatePlugin);

  const emailSender = createEmailSender(env);
  // undefined when STRIPE_SECRET_KEY isn't configured — every billing/commercial-API route
  // fails honestly (503) rather than fabricating a checkout, the same discipline
  // createDiscoveryTranslator follows when no AI provider key is configured.
  const billingClient = createBillingClient(env.STRIPE_SECRET_KEY);

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
      // Gates everything below on an active subscription — GET /me is its one exemption, so
      // a parent who hasn't paid yet can still see the dashboard shell and a "Subscribe"
      // prompt. See plugins/subscription-gate.ts.
      instance.addHook("preHandler", instance.requireActiveSubscription);
      await parentRoutes(instance, { env });
      await contentRoutes(instance, { env });
      await playlistRoutes(instance, { env });
      await discoverRoutes(instance, { env });
      await scoresRoutes(instance, { env });
      await activityRoutes(instance, { env });
      await alertsRoutes(instance, { env });
      await reportsRoutes(instance, { env });
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

  // A parent starting/resuming their own subscription — kept outside the gated group above
  // specifically so it stays reachable before a subscription exists (see billing.ts).
  await app.register(
    async (instance) => {
      await billingCheckoutRoutes(instance, { env, billingClient });
    },
    { prefix: "/api/billing" },
  );

  // Stripe calls this directly: no parent/child session, and the exact raw request bytes
  // (not Fastify's parsed JSON) are required to verify the webhook signature — registered in
  // its own encapsulated context so this raw-body parser never affects any other route.
  await app.register(
    async (instance) => {
      instance.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
        done(null, body);
      });
      await billingWebhookRoutes(instance, { env, billingClient, emailSender });
    },
    { prefix: "/api/billing" },
  );

  // The commercial Supervision Score API (Milestone 10) — see COMMERCIAL_API.md. A completely
  // separate identity space from parent/child sessions: /clients (signup) is public, since a
  // business has no API key until payment succeeds; /analyze requires one.
  await app.register(
    async (instance) => {
      await v1PublicRoutes(instance, { env, billingClient });
    },
    { prefix: "/api/v1" },
  );

  await app.register(
    async (instance) => {
      instance.addHook("preHandler", instance.requireApiKey);
      await v1AnalyzeRoutes(instance, { env });
    },
    { prefix: "/api/v1" },
  );

  return app;
}
