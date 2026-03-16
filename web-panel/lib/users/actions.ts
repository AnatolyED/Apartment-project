'use server';

import { z } from 'zod';
import { and, asc, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { users, type User } from '@/lib/db/schema';
import {
  assertRole,
  deleteAllUserSessions,
  deleteSession,
  hashPassword,
} from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/actions';
import { createUserSchema, updateUserSchema } from '@/lib/validators';

interface UsersResult {
  success: boolean;
  users?: User[];
  total?: number;
  error?: string;
}

interface UserActionResult {
  success: boolean;
  user?: User;
  error?: string;
  completedAt?: number;
  redirectUrl?: string;
}

function getValidationError(error: z.ZodError) {
  return error.issues[0]?.message || 'Проверьте корректность введённых данных';
}

export async function getUsersAction(): Promise<UsersResult> {
  try {
    await assertRole(['admin']);

    const result = await db
      .select()
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.isProtected), asc(users.role), asc(users.login));

    return {
      success: true,
      users: result,
      total: result.length,
    };
  } catch (error) {
    console.error('Get users error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить список пользователей',
    };
  }
}

export async function getUserByIdAction(userId: string): Promise<UserActionResult> {
  try {
    await assertRole(['admin']);

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
      return {
        success: false,
        error: 'Пользователь не найден',
      };
    }

    return {
      success: true,
      user,
    };
  } catch (error) {
    console.error('Get user by id error:', error);
    return {
      success: false,
      error: 'Не удалось загрузить пользователя',
    };
  }
}

export async function createUserAction(formData: FormData): Promise<UserActionResult> {
  try {
    const currentSession = await assertRole(['admin']);
    const rawData = Object.fromEntries(formData.entries());
    const validatedData = createUserSchema.parse(rawData);
    const passwordHashValue = await hashPassword(validatedData.password);

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.login, validatedData.login))
      .limit(1);

    if (existingUser) {
      if (!existingUser.isActive) {
        await db
          .update(users)
          .set({
            passwordHash: passwordHashValue,
            role: 'moderator',
            isActive: true,
            isProtected: false,
            isBlocked: false,
            mustChangePassword: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id));

        await deleteAllUserSessions(existingUser.id);
        revalidatePath('/dashboard/users');

        await writeAuditLog({
          actorUserId: currentSession.userId,
          actorLogin: currentSession.login,
          actorRole: currentSession.role,
          action: 'user.reactivated',
          entityType: 'user',
          entityId: existingUser.id,
          entityLabel: validatedData.login,
          details: {
            role: 'moderator',
            mustChangePassword: true,
          },
        });

        return {
          success: true,
          completedAt: Date.now(),
        };
      }

      return {
        success: false,
        error: 'Пользователь с таким логином уже существует',
        completedAt: Date.now(),
      };
    }

    const [createdUser] = await db
      .insert(users)
      .values({
        login: validatedData.login,
        passwordHash: passwordHashValue,
        role: 'moderator',
        isActive: true,
        isProtected: false,
        isBlocked: false,
        mustChangePassword: true,
      })
      .returning();

    revalidatePath('/dashboard/users');

    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'user.created',
      entityType: 'user',
      entityId: createdUser.id,
      entityLabel: createdUser.login,
      details: {
        role: createdUser.role,
        mustChangePassword: true,
      },
    });

    return {
      success: true,
      completedAt: Date.now(),
    };
  } catch (error) {
    console.error('Create user error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: getValidationError(error),
        completedAt: Date.now(),
      };
    }

    if (error instanceof Error && error.message === 'Недостаточно прав') {
      return {
        success: false,
        error: error.message,
        completedAt: Date.now(),
      };
    }

    return {
      success: false,
      error: 'Произошла ошибка при создании пользователя',
      completedAt: Date.now(),
    };
  }
}

export async function updateUserAction(
  userId: string,
  formData: FormData
): Promise<UserActionResult> {
  try {
    const currentSession = await assertRole(['admin']);
    const rawData = Object.fromEntries(formData.entries());
    const validatedData = updateUserSchema.parse(rawData);

    const [targetUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1);

    if (!targetUser) {
      return {
        success: false,
        error: 'Пользователь не найден',
        completedAt: Date.now(),
      };
    }

    const [existingWithSameLogin] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.login, validatedData.login),
          eq(users.isActive, true),
          ne(users.id, userId)
        )
      )
      .limit(1);

    if (existingWithSameLogin) {
      return {
        success: false,
        error: 'Пользователь с таким логином уже существует',
        completedAt: Date.now(),
      };
    }

    const loginChanged = validatedData.login !== targetUser.login;
    const nextPassword = validatedData.password?.trim();
    const passwordChanged = Boolean(nextPassword);
    const editingSelf = currentSession.userId === userId;
    const forcePasswordChange = passwordChanged ? !editingSelf : targetUser.mustChangePassword;

    const updatePayload: Partial<typeof users.$inferInsert> = {
      login: validatedData.login,
      mustChangePassword: forcePasswordChange,
      updatedAt: new Date(),
    };

    if (nextPassword) {
      updatePayload.passwordHash = await hashPassword(nextPassword);
    }

    const [updatedUser] = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, userId))
      .returning();

    if (loginChanged || passwordChanged) {
      await deleteAllUserSessions(userId);
    }

    revalidatePath('/dashboard/users');
    revalidatePath(`/dashboard/users/${userId}/edit`);

    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'user.updated',
      entityType: 'user',
      entityId: updatedUser.id,
      entityLabel: updatedUser.login,
      details: {
        loginChanged,
        passwordChanged,
        blocked: updatedUser.isBlocked,
        protected: updatedUser.isProtected,
        mustChangePassword: updatedUser.mustChangePassword,
      },
    });

    if (editingSelf && (loginChanged || passwordChanged)) {
      await deleteSession();
    }

    return {
      success: true,
      completedAt: Date.now(),
      redirectUrl: editingSelf && (loginChanged || passwordChanged) ? '/login' : '/dashboard/users',
    };
  } catch (error) {
    console.error('Update user error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: getValidationError(error),
        completedAt: Date.now(),
      };
    }

    if (error instanceof Error && error.message === 'Недостаточно прав') {
      return {
        success: false,
        error: error.message,
        completedAt: Date.now(),
      };
    }

    return {
      success: false,
      error: 'Произошла ошибка при обновлении пользователя',
      completedAt: Date.now(),
    };
  }
}

export async function deleteUserAction(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentSession = await assertRole(['admin']);

    if (currentSession.userId === userId) {
      return {
        success: false,
        error: 'Нельзя удалить текущего авторизованного пользователя',
      };
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1);

    if (!targetUser) {
      return {
        success: false,
        error: 'Пользователь не найден',
      };
    }

    if (targetUser.isProtected) {
      return {
        success: false,
        error: 'Системного администратора нельзя удалить',
      };
    }

    await db
      .update(users)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await deleteAllUserSessions(userId);
    revalidatePath('/dashboard/users');

    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: 'user.deleted',
      entityType: 'user',
      entityId: targetUser.id,
      entityLabel: targetUser.login,
      details: {
        role: targetUser.role,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Delete user error:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Произошла ошибка при удалении пользователя',
    };
  }
}

export async function toggleUserBlockedAction(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentSession = await assertRole(['admin']);

    if (currentSession.userId === userId) {
      return {
        success: false,
        error: 'Нельзя заблокировать текущего авторизованного пользователя',
      };
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1);

    if (!targetUser) {
      return {
        success: false,
        error: 'Пользователь не найден',
      };
    }

    if (targetUser.isProtected) {
      return {
        success: false,
        error: 'Системного администратора нельзя блокировать',
      };
    }

    const nextBlockedState = !targetUser.isBlocked;

    await db
      .update(users)
      .set({
        isBlocked: nextBlockedState,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await deleteAllUserSessions(userId);
    revalidatePath('/dashboard/users');
    revalidatePath(`/dashboard/users/${userId}/edit`);

    await writeAuditLog({
      actorUserId: currentSession.userId,
      actorLogin: currentSession.login,
      actorRole: currentSession.role,
      action: nextBlockedState ? 'user.blocked' : 'user.unblocked',
      entityType: 'user',
      entityId: targetUser.id,
      entityLabel: targetUser.login,
      details: {
        role: targetUser.role,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Toggle user blocked error:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Произошла ошибка при изменении статуса блокировки пользователя',
    };
  }
}
