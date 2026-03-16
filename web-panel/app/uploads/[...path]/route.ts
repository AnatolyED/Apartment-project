import { readFile } from 'fs/promises';
import { join, normalize } from 'path';
import { NextResponse } from 'next/server';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;

  if (!path?.length) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const normalizedPath = normalize(path.join('/')).replace(/^(\.\.(\/|\\|$))+/, '');
  const absolutePath = join(process.cwd(), 'public', 'uploads', normalizedPath);

  try {
    const fileBuffer = await readFile(absolutePath);
    const extension = normalizedPath.slice(normalizedPath.lastIndexOf('.')).toLowerCase();
    const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
