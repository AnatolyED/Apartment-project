import { desc, inArray, like, or, sql } from 'drizzle-orm';
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

let ensureAuditPromise: Promise<void> | null = null;

async function ensureAuditInfrastructure() {
  if (!ensureAuditPromise) {
    ensureAuditPromise = (async () => {
      await db.execute(
        sql.raw(`
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_login varchar(100) NOT NULL,
  actor_role user_role NOT NULL,
  action varchar(100) NOT NULL,
  entity_type varchar(100) NOT NULL,
  entity_id varchar(100),
  entity_label text,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
`)
      );
    })().catch((error) => {
      ensureAuditPromise = null;
      throw error;
    });
  }

  await ensureAuditPromise;
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  try {
    await ensureAuditInfrastructure();

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
    await ensureAuditInfrastructure();

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
    await ensureAuditInfrastructure();

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
