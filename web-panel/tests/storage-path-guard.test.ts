import { mkdir, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteFile, getEntityDir } from '@/lib/storage';

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));

const mkdirMock = vi.mocked(mkdir);
const unlinkMock = vi.mocked(unlink);

describe('storage path guard', () => {
  beforeEach(() => {
    mkdirMock.mockReset();
    unlinkMock.mockReset();
  });

  it('creates entity directories only inside public uploads', async () => {
    const entityDir = await getEntityDir({
      entityType: 'apartments',
      entityId: '11111111-1111-1111-1111-111111111111',
    });

    expect(entityDir).toBe(
      resolve(
        process.cwd(),
        'public',
        'uploads',
        'apartments',
        '11111111-1111-1111-1111-111111111111'
      )
    );
    expect(mkdirMock).toHaveBeenCalledWith(entityDir, { recursive: true });
  });

  it('rejects entity directory traversal before touching the filesystem', async () => {
    await expect(
      getEntityDir({ entityType: 'apartments', entityId: '..\\..\\outside' })
    ).rejects.toThrow('Unsafe upload path');

    expect(mkdirMock).not.toHaveBeenCalled();
  });

  it('rejects delete paths outside public uploads before unlinking', async () => {
    await expect(deleteFile('/../package.json')).rejects.toThrow(
      'Unsafe upload path'
    );

    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it('accepts delete paths under uploads', async () => {
    await deleteFile('/uploads/apartments/id/photo.jpg');

    expect(unlinkMock).toHaveBeenCalledWith(
      join(process.cwd(), 'public', 'uploads', 'apartments', 'id', 'photo.jpg')
    );
  });
});
