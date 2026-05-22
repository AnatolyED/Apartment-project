import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

const BOT_API_TOKEN_HEADER = 'x-bot-api-token';
const ALLOW_UNAUTHENTICATED_BOT_API =
  process.env.NODE_ENV !== 'production' &&
  process.env.ALLOW_UNAUTHENTICATED_BOT_API === 'true';

function tokensMatch(providedToken: string, expectedToken: string) {
  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

export function requireBotApiToken(request: NextRequest): NextResponse | null {
  const expectedToken = process.env.BOT_API_TOKEN?.trim();

  if (!expectedToken) {
    if (ALLOW_UNAUTHENTICATED_BOT_API) {
      return null;
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BOT_API_TOKEN_NOT_CONFIGURED',
          message: 'Bot API token is not configured',
        },
      },
      { status: 503 }
    );
  }

  const providedToken = request.headers.get(BOT_API_TOKEN_HEADER)?.trim();
  if (providedToken && tokensMatch(providedToken, expectedToken)) {
    return null;
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Bot API token is required',
      },
    },
    { status: 401 }
  );
}
