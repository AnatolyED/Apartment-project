type LocationAliasConfidence = 'alias' | 'ambiguous';

interface LocationAliasEntry {
  aliases: string[];
  cityName: string;
  districtName?: string;
  localityName?: string;
  confidence?: LocationAliasConfidence;
  match?: 'exact' | 'contains';
}

interface NormalizeImportedLocationInput {
  address?: string;
  cityName?: string;
  districtName?: string;
  residentialComplex?: string;
}

export interface NormalizedImportedLocation {
  cityName?: string;
  districtName?: string;
  localityName?: string;
  matchedAlias?: string;
  isDistrictInferred: boolean;
}

const CITY_ALIASES: LocationAliasEntry[] = [
  {
    aliases: ['санкт-петербург', 'санкт петербург', 'спб', 'петербург'],
    cityName: 'Санкт-Петербург',
  },
  {
    aliases: ['москва', 'г москва', 'мск'],
    cityName: 'Москва',
  },
];

const DISTRICT_ALIASES: LocationAliasEntry[] = [
  {
    aliases: ['во', 'в о'],
    cityName: 'Санкт-Петербург',
    districtName: 'Василеостровский район',
  },
  {
    aliases: ['петроградка'],
    cityName: 'Санкт-Петербург',
    districtName: 'Петроградский район',
  },
  {
    aliases: ['петергофский', 'петродворецкий'],
    cityName: 'Санкт-Петербург',
    districtName: 'Петродворцовый район',
  },
  ...buildDistrictEntries('Санкт-Петербург', [
    'Адмиралтейский район',
    'Василеостровский район',
    'Выборгский район',
    'Калининский район',
    'Кировский район',
    'Колпинский район',
    'Красногвардейский район',
    'Красносельский район',
    'Кронштадтский район',
    'Курортный район',
    'Московский район',
    'Невский район',
    'Петроградский район',
    'Петродворцовый район',
    'Приморский район',
    'Пушкинский район',
    'Фрунзенский район',
    'Центральный район',
  ]),
  ...buildDistrictEntries('Москва', [
    'район Бекасово',
    'район Внуково',
    'район Вороново',
    'район Коммунарка',
    'район Краснопахорский',
    'район Троицк',
    'район Филимонковский',
    'район Щербинка',
  ]),
];

const LOCALITY_ALIASES: LocationAliasEntry[] = [
  locality(['Левашово'], 'Санкт-Петербург', 'Выборгский район'),
  locality(['Парголово'], 'Санкт-Петербург', 'Выборгский район'),
  locality(['Горелово'], 'Санкт-Петербург', 'Красносельский район'),
  locality(['Красное Село'], 'Санкт-Петербург', 'Красносельский район'),
  locality(['Колпино'], 'Санкт-Петербург', 'Колпинский район'),
  locality(['Металлострой'], 'Санкт-Петербург', 'Колпинский район'),
  locality(['Петро-Славянка', 'Петрославянка'], 'Санкт-Петербург', 'Колпинский район'),
  locality(['Понтонный'], 'Санкт-Петербург', 'Колпинский район'),
  locality(['Саперный', 'Сапёрный'], 'Санкт-Петербург', 'Колпинский район'),
  locality(['Усть-Ижора'], 'Санкт-Петербург', 'Колпинский район'),
  locality(['Кронштадт'], 'Санкт-Петербург', 'Кронштадтский район'),
  locality(['Белоостров'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Зеленогорск'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Комарово'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Молодежное', 'Молодёжное'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Песочный'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Репино'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Серово'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Сестрорецк'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Смолячково'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Солнечное'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Ушково'], 'Санкт-Петербург', 'Курортный район'),
  locality(['Ломоносов'], 'Санкт-Петербург', 'Петродворцовый район'),
  locality(['Ораниенбаум'], 'Санкт-Петербург', 'Петродворцовый район'),
  locality(['Петергоф'], 'Санкт-Петербург', 'Петродворцовый район'),
  locality(['Петродворец'], 'Санкт-Петербург', 'Петродворцовый район'),
  locality(['Стрельна'], 'Санкт-Петербург', 'Петродворцовый район'),
  locality(['Лахта', 'Ольгино', 'Лахта-Ольгино'], 'Санкт-Петербург', 'Приморский район'),
  locality(['Лисий Нос'], 'Санкт-Петербург', 'Приморский район'),
  locality(['Александровская'], 'Санкт-Петербург', 'Пушкинский район'),
  locality(['Павловск'], 'Санкт-Петербург', 'Пушкинский район'),
  locality(['Пушкин'], 'Санкт-Петербург', 'Пушкинский район'),
  locality(['Царское Село'], 'Санкт-Петербург', 'Пушкинский район'),
  locality(['Тярлево'], 'Санкт-Петербург', 'Пушкинский район'),
  locality(['Шушары'], 'Санкт-Петербург', 'Пушкинский район'),
  locality(['Детскосельский', 'Ленсоветовский', 'Новая Ижора', 'Славянка'], 'Санкт-Петербург', 'Пушкинский район', 'ambiguous'),
  locality(['Автово', 'Дачное', 'Княжево', 'Ульянка'], 'Санкт-Петербург', 'Кировский район', 'ambiguous'),
  locality(['Большая Охта', 'Малая Охта', 'Полюстрово', 'Пороховые', 'Ржевка'], 'Санкт-Петербург', 'Красногвардейский район', 'ambiguous'),
  locality(['Обухово', 'Обуховский', 'Рыбацкое'], 'Санкт-Петербург', 'Невский район', 'ambiguous'),
  locality(['Коломяги', 'Комендантский аэродром', 'Озеро Долгое', 'Юнтолово'], 'Санкт-Петербург', 'Приморский район', 'ambiguous'),
  locality(['Купчино'], 'Санкт-Петербург', 'Фрунзенский район', 'ambiguous'),

  locality(['Бекасово', 'Бекасово-Сортировочное', 'Киевский', 'Новофедоровское', 'Новофёдоровское', 'Рассудово', 'Яковлевское'], 'Москва', 'район Бекасово'),
  locality(['Аэропорт Внуково', 'Внуково', 'Кокошкино', 'Крекшино', 'Крёкшино', 'Марушкино', 'совхоза Крекшино', 'совхоза Крёкшино', 'Толстопальцево'], 'Москва', 'район Внуково'),
  locality(['Васюнино', 'Вороново', 'Вороновское', 'Кленово', 'Клёново', 'Кленовское', 'Клёновское', 'ЛМС', 'Львово', 'Рогово', 'Роговское', 'Спас-Купля', 'Чернецкое', 'Юдановка', 'Ясенки'], 'Москва', 'район Вороново'),
  locality(['Коммунарка', 'АДЦ Коммунарка', 'Бачурино', 'Воскресенское', 'Газопровод', 'Летово', 'Мамыри', 'Мосрентген', 'Николо-Хованское', 'Прокшино', 'Сосенки', 'Сосенское', 'Столбово'], 'Москва', 'район Коммунарка'),
  locality(['Былово', 'Красная Пахра', 'Красное', 'Краснопахорское', 'Раево', 'Раёво', 'Шапово', 'Шишкин Лес', 'Щапово'], 'Москва', 'район Краснопахорский'),
  locality(['Ватутинки', 'Десна', 'Новые Ватутинки', 'Троицк'], 'Москва', 'район Троицк'),
  locality(['Московский', 'Большое Покровское', 'Валуево', 'Град Московский', 'Марьино', 'Мешково', 'Первый Московский', 'Первомайское', 'Птичное', 'Рогозинино', 'Староселье', 'Филимонки', 'Филимонковское'], 'Москва', 'район Филимонковский'),
  locality(['Алхимово', 'Знамя Октября', 'Остафьево', 'Рязановское', 'Фабрики имени 1 Мая', 'Щербинка'], 'Москва', 'район Щербинка'),
];

const ADDRESS_DISTRICT_ALIASES: LocationAliasEntry[] = [
  addressAlias(['Астра Континенталь', 'Обуховской Обороны'], 'Санкт-Петербург', 'Невский район'),
  addressAlias(['STAVNI Обводный', 'Обводного канала', 'Обводного кан'], 'Санкт-Петербург', 'Адмиралтейский район'),
  addressAlias(['Фонтанка 130'], 'Санкт-Петербург', 'Адмиралтейский район'),
  addressAlias(['Остров Первых', 'Перевозная'], 'Санкт-Петербург', 'Адмиралтейский район'),
  addressAlias(['Гранат', 'Фучика'], 'Санкт-Петербург', 'Фрунзенский район'),
  addressAlias(['СветЛО', 'Всеволожск'], 'Всеволожск', 'Всеволожский район'),
  addressAlias(['Аквилон РекаПарк', 'Новосергиевка'], 'Новосергиевка', 'Всеволожский район'),
  addressAlias(['Имена', 'Новосаратовка'], 'Новосаратовка', 'Всеволожский район'),
];

export function normalizeImportedLocation(
  input: NormalizeImportedLocationInput
): NormalizedImportedLocation {
  const explicitDistrictMatch = findAliasMatch(input.districtName, DISTRICT_ALIASES);
  if (explicitDistrictMatch) {
    return {
      cityName: explicitDistrictMatch.cityName,
      districtName: explicitDistrictMatch.districtName,
      localityName: explicitDistrictMatch.localityName,
      matchedAlias: input.districtName,
      isDistrictInferred: false,
    };
  }

  const localityMatch = findLocalityMatch(input);
  if (localityMatch) {
    const shouldUseDistrict = localityMatch.confidence !== 'ambiguous';

    return {
      cityName: localityMatch.cityName,
      districtName: shouldUseDistrict ? localityMatch.districtName : undefined,
      localityName: localityMatch.localityName,
      matchedAlias: localityMatch.matchedAlias,
      isDistrictInferred: shouldUseDistrict && !!localityMatch.districtName,
    };
  }

  const addressDistrictMatch = findAddressDistrictMatch(input);
  if (addressDistrictMatch) {
    return {
      cityName: addressDistrictMatch.cityName,
      districtName: addressDistrictMatch.districtName,
      localityName: addressDistrictMatch.localityName,
      matchedAlias: addressDistrictMatch.matchedAlias,
      isDistrictInferred: true,
    };
  }

  const cityMatch = findAliasMatch(input.cityName, CITY_ALIASES);
  return {
    cityName: cityMatch?.cityName ?? input.cityName,
    districtName: input.districtName,
    isDistrictInferred: false,
  };
}

function buildDistrictEntries(cityName: string, districtNames: string[]): LocationAliasEntry[] {
  return districtNames.map((districtName) => ({
    aliases: [districtName, districtName.replace(/\s+район$/i, ''), districtName.replace(/^район\s+/i, '')],
    cityName,
    districtName,
  }));
}

function locality(
  aliases: string[],
  cityName: string,
  districtName: string,
  confidence: LocationAliasConfidence = 'alias'
): LocationAliasEntry {
  return {
    aliases,
    cityName,
    districtName,
    localityName: aliases[0],
    confidence,
  };
}

function addressAlias(
  aliases: string[],
  cityName: string,
  districtName: string
): LocationAliasEntry {
  return {
    aliases,
    cityName,
    districtName,
    match: 'contains',
  };
}

function findLocalityMatch(input: NormalizeImportedLocationInput) {
  const candidates = [
    input.cityName,
    ...splitAddressCandidates(input.address),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = findAliasMatch(candidate, LOCALITY_ALIASES);
    if (match) {
      return {
        ...match,
        matchedAlias: candidate,
      };
    }
  }

  return null;
}

function findAddressDistrictMatch(input: NormalizeImportedLocationInput) {
  const candidates = [
    input.residentialComplex,
    input.address,
    ...splitAddressCandidates(input.address),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = findAliasMatch(candidate, ADDRESS_DISTRICT_ALIASES);
    if (match) {
      return {
        ...match,
        matchedAlias: candidate,
      };
    }
  }

  return null;
}

function findAliasMatch(value: string | undefined, entries: LocationAliasEntry[]) {
  const normalizedValue = normalizeLocationKey(value);
  if (!normalizedValue) {
    return null;
  }

  return (
    entries.find((entry) => {
      const normalizedAliases = entry.aliases
        .map((alias) => normalizeLocationKey(alias))
        .filter((alias): alias is string => Boolean(alias));

      return normalizedAliases.some((alias) =>
        entry.match === 'contains'
          ? normalizedValue.includes(alias) || alias.includes(normalizedValue)
          : alias === normalizedValue
      );
    }) ?? null
  );
}

function splitAddressCandidates(address?: string) {
  return (
    address
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean) ?? []
  );
}

function normalizeLocationKey(value?: string) {
  return value
    ?.toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"']/g, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:г|город|п|пос|поселок|деревня|д)\.?\s+/i, '')
    .replace(/\s+(?:г|п|пос|поселок|деревня|д)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
