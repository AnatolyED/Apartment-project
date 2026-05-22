import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { requireBotApiToken } from '@/lib/api/bot-auth';

const ORIGINAL_ENV = { ...process.env };

function makeRequest(token?: string) {
  const headers = new Headers();
  if (token !== undefined) {
    headers.set('x-bot-api-token', token);
  }

  return new NextRequest('http://localhost/api/apartments', { headers });
}

async function readJson(response: Response) {
  return response.json() as Promise<{
    success: boolean;
    error?: { code: string; message: string };
  }>;
}

afterEach(() => {
  process.env.BOT_API_TOKEN = ORIGINAL_ENV.BOT_API_TOKEN;
  process.env.ALLOW_UNAUTHENTICATED_BOT_API =
    ORIGINAL_ENV.ALLOW_UNAUTHENTICATED_BOT_API;
});

describe('requireBotApiToken', () => {
  it('allows requests with the configured bot API token', () => {
    process.env.BOT_API_TOKEN = 'secret-token';

    expect(requireBotApiToken(makeRequest('secret-token'))).toBeNull();
  });

  it('rejects requests without a matching token', async () => {
    process.env.BOT_API_TOKEN = 'secret-token';

    const response = requireBotApiToken(makeRequest('wrong-token'));

    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    await expect(readJson(response!)).resolves.toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('fails closed when the expected token is not configured', async () => {
    delete process.env.BOT_API_TOKEN;
    delete process.env.ALLOW_UNAUTHENTICATED_BOT_API;

    const response = requireBotApiToken(makeRequest());

    expect(response).not.toBeNull();
    expect(response?.status).toBe(503);
    await expect(readJson(response!)).resolves.toMatchObject({
      success: false,
      error: { code: 'BOT_API_TOKEN_NOT_CONFIGURED' },
    });
  });
});
