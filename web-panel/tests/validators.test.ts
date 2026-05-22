import { describe, expect, it } from 'vitest';
import { FINISHING_OPTIONS, formatFinishingLabel } from '@/lib/validators';

describe('finishing validators', () => {
  it('uses readable UTF-8 finishing values', () => {
    expect(FINISHING_OPTIONS.map((option) => option.value)).toEqual([
      'Чистовая',
      'Вайт бокс',
      'Без отделки',
    ]);
  });

  it('formats finishing labels for CRM output', () => {
    expect(formatFinishingLabel('Вайт бокс')).toBe('Подчистовая');
    expect(formatFinishingLabel('Без отделки')).toBe('Без отделки');
  });
});
