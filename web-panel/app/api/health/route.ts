import { NextResponse } from 'next/server';
import { getWebPanelHealthStatus } from '@/lib/system/health';

export async function GET() {
  const status = await getWebPanelHealthStatus();

  return NextResponse.json(status, {
    status: status.status === 'ok' ? 200 : 503,
  });
}
