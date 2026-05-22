import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { loginAttempts, userSessions, users, type UserRole } from '@/lib/db/schema';

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = 'panel_session';
const SESSION_DURATION_HOURS = 24;

function getPositiveIntEnv(name: string, fallback: number) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const LOGIN_ATTEMPTS_LIMIT = getPositiveIntEnv('AUTH_LOGIN_ATTEMPTS_LIMIT', 5);
const LOGIN_LOCK_MINUTES = getPositiveIntEnv('AUTH_LOGIN_LOCK_MINUTES', 15);

export interface SessionData {
  isAuthenticated: true;
  userId: string;
  login: string;
  role: UserRole;
  mustChangePassword: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface LoginThrottleState {
  isLocked: boolean;
  retryAfterSeconds: number;
}

let ensureAuthPromise: Promise<void> | null = null;

function getSessionDurationMs() {
  return SESSION_DURATION_HOURS * 60 * 60 * 1000;
}

function getLockDurationMs() {
  return LOGIN_LOCK_MINUTES * 60 * 1000;
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeLogin(login: string) {
  return login.trim();
}

function normalizeIpAddress(ipAddress: string) {
  return ipAddress.trim() || 'unknown';
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, storedHash] = passwordHash.split(':');
  if (algorithm !== 'scrypt' || !salt || !storedHash) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedKey);
}

async function ensureAuthInfrastructure() {
  if (!ensureAuthPromise) {
    ensureAuthPromise = (async () => {
      const adminLogin = process.env.ADMIN_LOGIN?.trim();
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminLogin || !adminPassword) {
        return;
      }

      const [protectedAdmin] = await db
        .select()
        .from(users)
        .where(eq(users.isProtected, true))
        .limit(1);

      if (protectedAdmin) {
        return;
      }

      const [existingAdmin] = await db
        .select()
        .from(users)
        .where(eq(users.login, adminLogin))
        .limit(1);

      if (existingAdmin) {
        await db
          .update(users)
          .set({
            role: 'admin',
            isActive: true,
            isProtected: true,
            isBlocked: false,
            mustChangePassword: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingAdmin.id));
        return;
      }

      const passwordHashValue = await hashPassword(adminPassword);

      await db.insert(users).values({
        login: adminLogin,
        passwordHash: passwordHashValue,
        role: 'admin',
        isProtected: true,
        isBlocked: false,
        mustChangePassword: false,
        isActive: true,
      });
    })().catch((error) => {
      ensureAuthPromise = null;
      throw error;
    });
  }

  await ensureAuthPromise;
}

export async function verifyCredentials(login: string, password: string) {
  await ensureAuthInfrastructure();

  const normalizedLogin = normalizeLogin(login);
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.login, normalizedLogin), eq(users.isActive, true)))
    .limit(1);

  if (!user) {
    return null;
  }

  if (user.isBlocked) {
    return null;
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return null;
  }

  return user;
}

export async function getLoginThrottleState(
  login: string,
  ipAddress: string
): Promise<LoginThrottleState> {
  await ensureAuthInfrastructure();

  const normalizedLogin = normalizeLogin(login);
  const normalizedIpAddress = normalizeIpAddress(ipAddress);
  const now = new Date();

  const [attempt] = await db
    .select()
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.login, normalizedLogin),
        eq(loginAttempts.ipAddress, normalizedIpAddress)
      )
    )
    .limit(1);

  if (!attempt?.lockedUntil || attempt.lockedUntil <= now) {
    return {
      isLocked: false,
      retryAfterSeconds: 0,
    };
  }

  return {
    isLocked: true,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / 1000)
    ),
  };
}

export async function registerFailedLoginAttempt(login: string, ipAddress: string) {
  await ensureAuthInfrastructure();

  const normalizedLogin = normalizeLogin(login);
  const normalizedIpAddress = normalizeIpAddress(ipAddress);
  const now = new Date();

  const [attempt] = await db
    .select()
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.login, normalizedLogin),
        eq(loginAttempts.ipAddress, normalizedIpAddress)
      )
    )
    .limit(1);

  const nextFailedCount = (attempt?.failedCount || 0) + 1;
  const shouldLock = nextFailedCount >= LOGIN_ATTEMPTS_LIMIT;
  const lockedUntil = shouldLock ? new Date(now.getTime() + getLockDurationMs()) : null;

  if (attempt) {
    await db
      .update(loginAttempts)
      .set({
        failedCount: nextFailedCount,
        lockedUntil,
        lastFailedAt: now,
        updatedAt: now,
      })
      .where(eq(loginAttempts.id, attempt.id));
  } else {
    await db.insert(loginAttempts).values({
      login: normalizedLogin,
      ipAddress: normalizedIpAddress,
      failedCount: nextFailedCount,
      lockedUntil,
      lastFailedAt: now,
    });
  }

  return {
    isLocked: shouldLock,
    retryAfterSeconds: shouldLock ? Math.ceil(getLockDurationMs() / 1000) : 0,
  };
}

export async function resetLoginAttempts(login: string, ipAddress: string) {
  await ensureAuthInfrastructure();

  const normalizedLogin = normalizeLogin(login);
  const normalizedIpAddress = normalizeIpAddress(ipAddress);

  await db
    .delete(loginAttempts)
    .where(
      and(
        eq(loginAttempts.login, normalizedLogin),
        eq(loginAttempts.ipAddress, normalizedIpAddress)
      )
    );
}

export async function createSession(user: { id: string; login: string }) {
  await ensureAuthInfrastructure();

  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get('x-forwarded-proto');
  const isHttps = process.env.NODE_ENV === 'production' || forwardedProto === 'https';

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + getSessionDurationMs());

  await db.insert(userSessions).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  await db
    .update(users)
    .set({
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    maxAge: SESSION_DURATION_HOURS * 60 * 60,
    path: '/',
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
  });
}

export async function deleteSession() {
  await ensureAuthInfrastructure();

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (sessionCookie?.value) {
    const tokenHash = hashSessionToken(sessionCookie.value);
    await db.delete(userSessions).where(eq(userSessions.tokenHash, tokenHash));
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function deleteAllUserSessions(userId: string) {
  await ensureAuthInfrastructure();
  await db.delete(userSessions).where(eq(userSessions.userId, userId));
}

export async function getSession(): Promise<SessionData | null> {
  await ensureAuthInfrastructure();

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  const tokenHash = hashSessionToken(sessionCookie.value);
  const now = new Date();

  const [session] = await db
    .select({
      userId: users.id,
      login: users.login,
      role: users.role,
      isBlocked: users.isBlocked,
      mustChangePassword: users.mustChangePassword,
      expiresAt: userSessions.expiresAt,
      createdAt: userSessions.createdAt,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(
      and(
        eq(userSessions.tokenHash, tokenHash),
        eq(users.isActive, true),
        eq(users.isBlocked, false),
        gt(userSessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!session) {
    return null;
  }

  await db
    .update(userSessions)
    .set({ lastSeenAt: now })
    .where(eq(userSessions.tokenHash, tokenHash));

  return {
    isAuthenticated: true,
    userId: session.userId,
    login: session.login,
    role: session.role,
    mustChangePassword: session.mustChangePassword,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
}

export async function isAuthenticated() {
  const session = await getSession();
  return session?.isAuthenticated === true;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

export async function requirePageRole(roles: UserRole[]) {
  const session = await requireSession();

  if (session.mustChangePassword) {
    redirect('/change-password');
  }

  if (!roles.includes(session.role)) {
    redirect('/dashboard');
  }

  return session;
}

export async function assertRole(roles: UserRole[]) {
  const session = await getSession();
  if (!session) {
    throw new Error('Требуется авторизация');
  }

  if (session.mustChangePassword) {
    throw new Error('Необходимо сменить пароль');
  }

  if (!roles.includes(session.role)) {
    throw new Error('Недостаточно прав');
  }

  return session;
}
