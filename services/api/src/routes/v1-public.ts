import type { FastifyInstance } from "fastify";
import { apiClientSignupRequestSchema } from "@app/types";
import type { Env } from "@app/config";
import type { StripeBillingClient } from "@app/billing";
import { parseOrReject } from "../lib/validate.js";
import { BillingNotConfiguredError, getApiClientKeyStatus, signUpApiClient } from "../services/billing-service.js";

const SIGNUP_RATE_LIMIT = { max: 10, timeWindow: "1 hour" };

/**
 * No authentication — a business signing up has no API key yet (that's what this issues,
 * once payment succeeds). Public by necessity, same as /api/auth/register.
 */
export default async function v1PublicRoutes(
  fastify: FastifyInstance,
  opts: { env: Env; billingClient: StripeBillingClient | undefined },
) {
  const { env, billingClient } = opts;

  fastify.post("/clients", { config: { rateLimit: SIGNUP_RATE_LIMIT } }, async (request, reply) => {
    const body = parseOrReject(apiClientSignupRequestSchema, request.body, reply);
    if (!body) return;

    try {
      const result = await signUpApiClient(env, billingClient, body.name, body.contactEmail);
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof BillingNotConfiguredError) {
        return reply.code(503).send({ error: error.message });
      }
      throw error;
    }
  });

  fastify.get<{ Params: { apiClientId: string } }>("/clients/:apiClientId/key-status", async (request, reply) => {
    const status = await getApiClientKeyStatus(request.params.apiClientId);
    if (!status) return reply.code(404).send({ error: "No such API client" });
    return reply.send(status);
  });
}
