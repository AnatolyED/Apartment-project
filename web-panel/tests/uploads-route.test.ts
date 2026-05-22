import { readFile } from 'fs/promises';
import { join, normalize } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/uploads/[...path]/route';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

const readFileMock = vi.mocked(readFile);

function makeContext(path: string[]) {
  return {
    params: Promise.resolve({ path }),
  };
}

describe('uploads route', () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  it('serves files from public uploads with an image content type', async () => {
    readFileMock.mockResolvedValue(Buffer.from('image-bytes'));

    const response = await GET(
      new Request('http://localhost/uploads/apartments/id/photo.jpg'),
      makeContext(['apartments', 'id', 'photo.jpg'])
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(readFileMock).toHaveBeenCalledWith(
      join(process.cwd(), 'public', 'uploads', normalize('apartments/id/photo.jpg'))
    );
    await expect(response.arrayBuffer()).resolves.toHaveProperty('byteLength', 11);
  });

  it('does not read traversal requests outside public uploads', async () => {
    readFileMock.mockRejectedValue(new Error('missing'));

    const response = await GET(
      new Request('http://localhost/uploads/../../package.json'),
      makeContext(['..', '..', 'package.json'])
    );

    const attemptedPath = readFileMock.mock.calls[0]?.[0]?.toString();

    expect(response.status).toBe(404);
    expect(attemptedPath).toBe(join(process.cwd(), 'public', 'uploads', 'package.json'));
    expect(attemptedPath).not.toContain('..');
  });
});
