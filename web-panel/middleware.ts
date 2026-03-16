import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'panel_session';
const PUBLIC_PATHS = ['/', '/login'];
const STATIC_PATHS = ['/_next', '/uploads', '/favicon.ico', '/icon.ico'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  const isPublic = PUBLIC_PATHS.some((path) =>
    path === '/'
      ? pathname === '/'
      : pathname === path || pathname.startsWith(`${path}/`)
  );
  const isStatic = STATIC_PATHS.some((path) => pathname.startsWith(path));

  if (isStatic) {
    return NextResponse.next();
  }

  if (isPublic) {
    return NextResponse.next();
  }

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|uploads|favicon.ico|icon.ico).*)',
  ],
};
