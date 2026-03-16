import { access, mkdir } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export interface DependencyStatus {
  status: 'ok' | 'error';
  message: string;
}

export interface WebPanelHealthStatus {
  status: 'ok' | 'error';
  timestampUtc: string;
  dependencies: {
    database: DependencyStatus;
    uploads: DependencyStatus;
  };
}

async function checkDatabase(): Promise<DependencyStatus> {
  try {
    await db.execute(sql`select 1`);
    return { status: 'ok', message: 'Подключение к PostgreSQL активно' };
  } catch (error) {
    console.error('Web-panel database health error:', error);
    return { status: 'error', message: 'Нет доступа к PostgreSQL' };
  }
}

async function checkUploadsDirectory(): Promise<DependencyStatus> {
  try {
    const uploadsPath = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsPath, { recursive: true });
    await access(uploadsPath, constants.R_OK | constants.W_OK);
    return { status: 'ok', message: 'Каталог uploads доступен для чтения и записи' };
  } catch (error) {
    console.error('Web-panel uploads health error:', error);
    return { status: 'error', message: 'Каталог uploads недоступен' };
  }
}

export async function getWebPanelHealthStatus(): Promise<WebPanelHealthStatus> {
  const [database, uploads] = await Promise.all([checkDatabase(), checkUploadsDirectory()]);

  return {
    status: database.status === 'ok' && uploads.status === 'ok' ? 'ok' : 'error',
    timestampUtc: new Date().toISOString(),
    dependencies: {
      database,
      uploads,
    },
  };
}

export async function getBotDiagnosticsSummary() {
  const baseUrl = process.env.BOT_DIAGNOSTICS_URL?.trim() || 'http://apartment-bot:8080';

  try {
    const response = await fetch(`${baseUrl}/diagnostics/summary`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      return {
        status: 'error' as const,
        message: `Бот недоступен: HTTP ${response.status}`,
      };
    }

    const payload = await response.json();

    return {
      status: 'ok' as const,
      message: 'Диагностика бота получена',
      payload,
    };
  } catch (error) {
    console.error('Bot diagnostics fetch error:', error);
    return {
      status: 'error' as const,
      message: 'Не удалось получить диагностику бота',
    };
  }
}
