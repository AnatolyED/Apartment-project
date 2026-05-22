import { desc, inArray, like, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLogs, type AuditLog, type UserRole } from '@/lib/db/schema';
import { assertRole } from '@/lib/auth/session';

interface AuditLogResult {
  success: boolean;
  logs?: AuditLog[];
  error?: string;
}

interface WriteAuditLogInput {
  actorUserId?: string | null;
  actorLogin: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: Record<string, unknown> | null;
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  try {
    await db.insert(auditLogs).values({
      actorUserId: input.actorUserId ?? null,
      actorLogin: input.actorLogin,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      details: input.details ?? null,
    });
  } catch (error) {
    console.error('Write audit log error:', error);
  }
}

export async function getAuditLogsAction(limit = 100): Promise<AuditLogResult> {
  try {
    await assertRole(['admin']);

    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(safeLimit);

    return {
      success: true,
      logs,
    };
  } catch (error) {
    console.error('Get audit logs error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить журнал действий',
    };
  }
}

export async function getSecurityLogsAction(limit = 100): Promise<AuditLogResult> {
  try {
    await assertRole(['admin']);

    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        or(
          like(auditLogs.action, 'auth.%'),
          inArray(auditLogs.action, ['user.blocked', 'user.unblocked'])
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(safeLimit);

    return {
      success: true,
      logs,
    };
  } catch (error) {
    console.error('Get security logs error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить журнал безопасности',
    };
  }
}
