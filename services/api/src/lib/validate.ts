import type { FastifyReply } from "fastify";
import type { ZodType } from "zod";

/**
 * Every request body is validated at the boundary against a shared @app/types schema
 * before reaching business logic — see SECURITY_AND_PRIVACY.md's input-handling section.
 */
// The explicit `any, any` (Def, Input) parameters keep TypeScript from unifying T against
// a defaulted schema's Input shape (where fields with .default() are optional) instead of
// its Output shape (where they're filled in and required) — a real inference gotcha with
// zod's three-type-parameter ZodType when only the Output parameter is pinned.
export function parseOrReject<T>(schema: ZodType<T, any, any>, data: unknown, reply: FastifyReply): T | undefined {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.code(400).send({ error: "Validation failed", issues: result.error.issues });
    return undefined;
  }
  return result.data;
}
