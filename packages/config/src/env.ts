import { z } from "zod";

/**
 * Validated once at process boot in services/api. Failing fast on a missing/malformed
 * secret is deliberate — see SECURITY_AND_PRIVACY.md's secrets-handling section: we would
 * rather crash on startup than run with an undefined JWT secret.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_APP_ORIGIN: z.string().url().default("http://localhost:3000"),

  // Optional — required only once the corresponding milestone's feature is exercised.
  // Left unset in Milestone 1; see IMPLEMENTATION_PLAN.md for what each unlocks.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),

  // Milestone 10 — commercial Supervision Score API + parent subscriptions, both billed
  // through Stripe. STRIPE_WEBHOOK_SECRET verifies that webhook requests genuinely came from
  // Stripe (see packages/billing) — without it, anyone could POST a fake "subscription
  // active" event. The two price IDs point at Price objects created in the operator's own
  // Stripe Dashboard; no dollar amount is ever hardcoded in this codebase.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PARENT_PRICE_ID: z.string().optional(),
  STRIPE_API_CLIENT_PRICE_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cachedEnv = result.data;
  return cachedEnv;
}
