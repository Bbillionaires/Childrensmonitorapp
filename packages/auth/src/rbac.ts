import type { ChildSessionClaims, ParentSessionClaims, SessionClaims } from "@app/types";

/**
 * Framework-agnostic RBAC assertions, shared by every route in services/api so the
 * parent/child boundary is enforced in exactly one place — see ARCHITECTURE.md's AuthN/AuthZ
 * model. Ownership checks that require a database lookup (e.g. "does this childId belong to
 * this parent's account") happen in the API's service layer, which must call these first and
 * then verify ownership before touching any data.
 */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertParentSession(claims: SessionClaims): asserts claims is ParentSessionClaims {
  if (claims.role !== "PARENT") {
    throw new ForbiddenError("This action requires a parent session");
  }
}

export function assertChildSession(claims: SessionClaims): asserts claims is ChildSessionClaims {
  if (claims.role !== "CHILD") {
    throw new ForbiddenError("This action requires a child session");
  }
}

/**
 * A child session is scoped to exactly one childId. This is what makes "a child cannot
 * access another child's content" true at the API layer rather than just in the UI.
 */
export function assertChildMatches(claims: ChildSessionClaims, childId: string): void {
  if (claims.childId !== childId) {
    throw new ForbiddenError("This session is not authorized for the requested child");
  }
}
