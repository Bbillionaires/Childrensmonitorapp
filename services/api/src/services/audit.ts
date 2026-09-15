import type { Prisma, PrismaClient } from "@app/database";

export interface AuditEntry {
  actorUserId?: string;
  actorRole: "PARENT" | "CHILD" | "SYSTEM";
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Every sensitive parent action writes exactly one row here — see SECURITY_AND_PRIVACY.md's
 * audit-logging section. Never include secrets (tokens, password hashes) in `metadata`.
 */
export async function writeAuditLog(prisma: PrismaClient, entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
