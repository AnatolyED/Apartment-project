import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBotDiagnosticsSummary } from '@/lib/system/health';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.BOT_DIAGNOSTICS_URL = ORIGINAL_ENV.BOT_DIAGNOSTICS_URL;
  process.env.DIAGNOSTICS_TOKEN = ORIGINAL_ENV.DIAGNOSTICS_TOKEN;
});

describe('getBotDiagnosticsSummary', () => {
  it('reports bot diagnostics as unavailable on non-2xx responses', async () => {
    process.env.BOT_DIAGNOSTICS_URL = 'http://bot.internal';
    process.env.DIAGNOSTICS_TOKEN = 'diagnostics-token';
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getBotDiagnosticsSummary();

    expect(result).toMatchObject({
      status: 'error',
      message: expect.stringContaining('HTTP 503'),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://bot.internal/diagnostics/summary',
      expect.objectContaining({
        cache: 'no-store',
        headers: { 'X-Diagnostics-Token': 'diagnostics-token' },
      })
    );
  });

  it('keeps the health page path resilient when the bot host is unreachable', async () => {
    process.env.BOT_DIAGNOSTICS_URL = 'http://bot.internal';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(getBotDiagnosticsSummary()).resolves.toMatchObject({
      status: 'error',
      message: expect.any(String),
    });
  });

  it('returns a timeout-specific message when bot diagnostics exceed the timeout', async () => {
    const timeoutError = new Error('timeout');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));

    await expect(getBotDiagnosticsSummary()).resolves.toMatchObject({
      status: 'error',
      message: expect.stringContaining('4'),
    });
  });
});
