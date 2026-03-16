'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { writeAuditLog } from '@/lib/audit/actions';
import { forcePasswordChangeSchema, loginSchema } from '@/lib/validators';
import {
  createSession,
  deleteAllUserSessions,
  deleteSession,
  getLoginThrottleState,
  getSession,
  hashPassword,
  registerFailedLoginAttempt,
  resetLoginAttempts,
  verifyCredentials,
} from '@/lib/auth/session';

interface LoginResult {
  success: boolean;
  error?: string;
  redirectUrl?: string;
}

interface ChangePasswordResult {
  success: boolean;
  error?: string;
  redirectUrl?: string;
}

function formatRetryMessage(retryAfterSeconds: number) {
  const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);
  return `Слишком много неудачных попыток входа. Попробуйте снова через ${retryAfterMinutes} мин.`;
}

async function getClientIpAddress() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const realIp = requestHeaders.get('x-real-ip');

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  if (realIp) {
    return realIp.trim();
  }

  return 'unknown';
}

async function getUserByLogin(login: string) {
  const normalizedLogin = login.trim();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.login, normalizedLogin), eq(users.isActive, true)))
    .limit(1);

  return user ?? null;
}

export async function loginAction(formData: FormData): Promise<LoginResult> {
  try {
    const rawData = Object.fromEntries(formData.entries());
    const validatedData = loginSchema.parse(rawData);
    const { login, password } = validatedData;
    const callbackUrl =
      typeof rawData.callbackUrl === 'string' && rawData.callbackUrl.startsWith('/')
        ? rawData.callbackUrl
        : '/dashboard';
    const ipAddress = await getClientIpAddress();

    const throttleState = await getLoginThrottleState(login, ipAddress);
    if (throttleState.isLocked) {
      await writeAuditLog({
        actorUserId: null,
        actorLogin: login,
        actorRole: 'moderator',
        action: 'auth.login_locked',
        entityType: 'security',
        entityLabel: login,
        details: {
          ipAddress,
          retryAfterSeconds: throttleState.retryAfterSeconds,
        },
      });

      return {
        success: false,
        error: formatRetryMessage(throttleState.retryAfterSeconds),
      };
    }

    const knownUser = await getUserByLogin(login);
    const user = await verifyCredentials(login, password);

    if (!user) {
      const failedState = await registerFailedLoginAttempt(login, ipAddress);

      const action = knownUser?.isBlocked
        ? 'auth.login_blocked_user'
        : failedState.isLocked
          ? 'auth.login_failed_locked'
          : 'auth.login_failed';

      await writeAuditLog({
        actorUserId: knownUser?.id ?? null,
        actorLogin: login,
        actorRole: knownUser?.role ?? 'moderator',
        action,
        entityType: 'security',
        entityId: knownUser?.id ?? null,
        entityLabel: login,
        details: {
          ipAddress,
          retryAfterSeconds: failedState.retryAfterSeconds,
          blocked: knownUser?.isBlocked ?? false,
        },
      });

      return {
        success: false,
        error: failedState.isLocked
          ? formatRetryMessage(failedState.retryAfterSeconds)
          : knownUser?.isBlocked
            ? 'Доступ к учётной записи временно заблокирован администратором'
            : 'Неверный логин или пароль',
      };
    }

    await resetLoginAttempts(login, ipAddress);
    await createSession(user);
    revalidatePath('/');

    await writeAuditLog({
      actorUserId: user.id,
      actorLogin: user.login,
      actorRole: user.role,
      action: 'auth.login_success',
      entityType: 'security',
      entityId: user.id,
      entityLabel: user.login,
      details: {
        ipAddress,
        mustChangePassword: user.mustChangePassword,
      },
    });

    if (user.mustChangePassword) {
      await writeAuditLog({
        actorUserId: user.id,
        actorLogin: user.login,
        actorRole: user.role,
        action: 'auth.password_change_required',
        entityType: 'security',
        entityId: user.id,
        entityLabel: user.login,
        details: {
          ipAddress,
        },
      });
    }

    return {
      success: true,
      redirectUrl: user.mustChangePassword ? '/change-password' : callbackUrl,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Ошибка валидации данных',
      };
    }

    console.error('Login error:', error);
    return {
      success: false,
      error: 'Произошла ошибка при входе. Попробуйте позже.',
    };
  }
}

export async function changeOwnPasswordAction(
  formData: FormData
): Promise<ChangePasswordResult> {
  try {
    const session = await getSession();
    if (!session) {
      return {
        success: false,
        error: 'Требуется авторизация',
        redirectUrl: '/login',
      };
    }

    if (!session.mustChangePassword) {
      return {
        success: false,
        error: 'Для вашего аккаунта принудительная смена пароля не требуется',
        redirectUrl: '/dashboard',
      };
    }

    const rawData = Object.fromEntries(formData.entries());
    const validatedData = forcePasswordChangeSchema.parse(rawData);
    const passwordHash = await hashPassword(validatedData.password);

    await db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    await deleteAllUserSessions(session.userId);
    await createSession({
      id: session.userId,
      login: session.login,
    });

    await writeAuditLog({
      actorUserId: session.userId,
      actorLogin: session.login,
      actorRole: session.role,
      action: 'auth.password_changed',
      entityType: 'security',
      entityId: session.userId,
      entityLabel: session.login,
      details: {
        forcedChangeCompleted: true,
      },
    });

    revalidatePath('/');

    return {
      success: true,
      redirectUrl: '/dashboard',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Ошибка валидации данных',
      };
    }

    console.error('Change own password error:', error);
    return {
      success: false,
      error: 'Не удалось обновить пароль. Попробуйте ещё раз.',
    };
  }
}

export async function logoutAction(): Promise<{ redirectUrl: string }> {
  await deleteSession();
  revalidatePath('/');
  return { redirectUrl: '/login' };
}
