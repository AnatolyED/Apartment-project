import { describe, expect, it } from 'vitest';
import { normalizeImportedLocation } from '@/lib/apartments/location-normalization';

describe('normalizeImportedLocation', () => {
  it('maps Shushary to Saint Petersburg and Pushkinsky district', () => {
    const result = normalizeImportedLocation({
      cityName: 'Шушары',
    });

    expect(result.cityName).toBe('Санкт-Петербург');
    expect(result.districtName).toBe('Пушкинский район');
    expect(result.localityName).toBe('Шушары');
  });

  it('keeps ambiguous locality district unresolved for manual review', () => {
    const result = normalizeImportedLocation({
      cityName: 'Купчино',
    });

    expect(result.cityName).toBe('Санкт-Петербург');
    expect(result.districtName).toBeUndefined();
    expect(result.localityName).toBe('Купчино');
  });

  it('normalizes residential complex aliases from the sample PDF', () => {
    const result = normalizeImportedLocation({
      residentialComplex: 'ЖК Астра Континенталь',
    });

    expect(result.cityName).toBe('Санкт-Петербург');
    expect(result.districtName).toBe('Невский район');
    expect(result.isDistrictInferred).toBe(true);
  });
});
