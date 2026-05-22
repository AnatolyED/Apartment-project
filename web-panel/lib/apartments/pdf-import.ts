import { createHash, randomUUID } from 'crypto';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { normalizeImportedLocation } from '@/lib/apartments/location-normalization';
import { FINISHING_OPTIONS, type ApartmentFormData } from '@/lib/validators';

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 150;
const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;
const PAGE_SEPARATOR_PREFIX = '\n\n---PDF_IMPORT_PAGE:';

export type ImportRowStatus = 'ready' | 'warning' | 'error' | 'duplicate';
export type ApartmentPdfImportMode = 'rules' | 'hybrid';

export interface ApartmentPdfParserProvider {
  id: string;
  mode: ApartmentPdfImportMode;
  parse(source: ApartmentPdfInput, sourceName?: string): Promise<ApartmentPdfParseResult>;
}

export interface ApartmentPdfPreviewRow {
  rowId: string;
  pageNumber: number;
  sourceId?: string;
  sourceTitle?: string;
  name: string;
  rooms: string;
  area: number | null;
  floor: number | null;
  price: number | null;
  finishing: ApartmentFormData['finishing'] | null;
  apartmentNumber?: string;
  building?: string;
  section?: string;
  completionDate?: string;
  residentialComplex?: string;
  address?: string;
  cityName?: string;
  districtName?: string;
  pricePerSquareMeter?: number;
  basePrice?: number;
  livingArea?: number;
  kitchenArea?: number;
  ceilingHeight?: number;
  rawText: string;
  hasLayoutImage: boolean;
  hasLocationImage: boolean;
  warnings: string[];
  errors: string[];
  status: ImportRowStatus;
}

export interface ApartmentPdfParseResult {
  fileName: string;
  fileHash: string;
  pageCount: number;
  rows: ApartmentPdfPreviewRow[];
  summary: {
    total: number;
    ready: number;
    warnings: number;
    errors: number;
    withLayoutImages: number;
    withLocationImages: number;
  };
}

interface ParsedPdfPage {
  pageNumber: number;
  text: string;
}

interface ResidentialComplexInfo {
  name: string;
  address?: string;
  cityName?: string;
  districtName?: string;
  districtNameWasInferred?: boolean;
  localityName?: string;
}

export type ApartmentPdfInput = File | Buffer | ArrayBuffer | Uint8Array;

export interface ExtractedApartmentPdfImages {
  layoutImage: Buffer | null;
  locationImage: Buffer | null;
}

interface NormalizedPdfInput {
  buffer: Buffer;
  fileName: string;
}

export function assertPdfFile(file: File) {
  if (!file || file.size === 0) {
    throw new Error('Загрузите PDF-файл');
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error('PDF больше 20 МБ');
  }

  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Загрузите файл в формате PDF');
  }
}

export async function parseApartmentPdf(
  source: ApartmentPdfInput,
  sourceName?: string
): Promise<ApartmentPdfParseResult> {
  return rulesApartmentPdfParserProvider.parse(source, sourceName);
}

export function getApartmentPdfParserProvider(
  mode: ApartmentPdfImportMode = 'rules'
): ApartmentPdfParserProvider {
  if (mode === 'hybrid') {
    return hybridApartmentPdfParserProvider;
  }

  return rulesApartmentPdfParserProvider;
}

const rulesApartmentPdfParserProvider: ApartmentPdfParserProvider = {
  id: 'rules',
  mode: 'rules',
  parse: parseApartmentPdfWithRules,
};

const hybridApartmentPdfParserProvider: ApartmentPdfParserProvider = {
  id: 'hybrid-placeholder',
  mode: 'hybrid',
  parse: parseApartmentPdfWithRules,
};

async function parseApartmentPdfWithRules(
  source: ApartmentPdfInput,
  sourceName?: string
): Promise<ApartmentPdfParseResult> {
  const { buffer, fileName } = await normalizePdfInput(source, sourceName);

  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const pages = await extractTextPages(buffer);

  if (pages.length > MAX_PDF_PAGES) {
    throw new Error(`PDF содержит слишком много страниц: ${pages.length}. Максимум ${MAX_PDF_PAGES}.`);
  }

  const totalTextLength = pages.reduce((sum, page) => sum + page.text.length, 0);
  if (totalTextLength > MAX_EXTRACTED_TEXT_CHARS) {
    throw new Error('PDF содержит слишком много текста для безопасной обработки');
  }

  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const layoutPages = findPagesWithLayoutImages(pdfDoc, pages.length);
  const locationPages = findPagesWithLocationImages(pdfDoc, pages.length);
  const residentialComplexes = extractResidentialComplexInfos(pages);
  const rows = applyDominantCityFallback(pages
    .filter((page) => isApartmentPage(page.text))
    .map((page) =>
      parseApartmentPage(
        page,
        layoutPages.has(page.pageNumber),
        locationPages.has(page.pageNumber),
        residentialComplexes
      )
    ));

  if (rows.length === 0) {
    throw new Error('Не удалось найти карточки квартир в PDF');
  }

  return {
    fileName,
    fileHash,
    pageCount: pages.length,
    rows,
    summary: buildSummary(rows),
  };
}

export async function extractLayoutImageForPage(
  file: File,
  pageNumber: number
): Promise<Buffer | null> {
  assertPdfFile(file);
  const buffer = normalizePdfBuffer(Buffer.from(await file.arrayBuffer()));
  return extractLayoutImageForPageFromBuffer(buffer, pageNumber);
}

export async function extractLayoutImageForPageFromBuffer(
  buffer: Buffer,
  pageNumber: number
): Promise<Buffer | null> {
  return extractFirstJpegImage(normalizePdfBuffer(buffer), pageNumber);
}

export async function extractLocationImageForPageFromBuffer(
  buffer: Buffer,
  pageNumber: number
): Promise<Buffer | null> {
  const pdfDoc = await PDFDocument.load(normalizePdfBuffer(buffer), { ignoreEncryption: true });
  return extractLocationImageForApartmentPage(pdfDoc, pageNumber);
}

export async function extractApartmentPdfImagesForPageFromBuffer(
  buffer: Buffer,
  pageNumber: number
): Promise<ExtractedApartmentPdfImages> {
  const pdfDoc = await PDFDocument.load(normalizePdfBuffer(buffer), { ignoreEncryption: true });
  return {
    layoutImage: extractFirstJpegImageFromPage(pdfDoc, pageNumber),
    locationImage: extractLocationImageForApartmentPage(pdfDoc, pageNumber),
  };
}

async function normalizePdfInput(
  source: ApartmentPdfInput,
  sourceName?: string
): Promise<NormalizedPdfInput> {
  if (source instanceof File) {
    assertPdfFile(source);

    return {
      buffer: normalizePdfBuffer(Buffer.from(await source.arrayBuffer())),
      fileName: sanitizeFileName(sourceName || source.name || 'apartments.pdf'),
    };
  }

  const buffer =
    source instanceof ArrayBuffer
      ? Buffer.from(source)
      : Buffer.from(source);

  if (buffer.length === 0) {
    throw new Error('PDF-файл пустой');
  }

  if (buffer.length > MAX_PDF_SIZE_BYTES) {
    throw new Error('PDF больше 20 МБ');
  }

  return {
    buffer: normalizePdfBuffer(buffer),
    fileName: sanitizeFileName(sourceName || 'apartments.pdf'),
  };
}

function normalizePdfBuffer(buffer: Buffer) {
  const headerIndex = buffer.indexOf('%PDF-');

  if (headerIndex < 0 || headerIndex > 1024) {
    throw new Error('Файл не похож на PDF');
  }

  return headerIndex === 0 ? buffer : buffer.subarray(headerIndex);
}

async function extractTextPages(buffer: Buffer): Promise<ParsedPdfPage[]> {
  let pageCounter = 0;
  const parsed = await pdfParse(buffer, {
    pagerender: async (pageData: {
      getTextContent: (options?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }) => Promise<{
        items: Array<{ str?: string }>;
      }>;
    }) => {
      pageCounter += 1;
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      const text = textContent.items.map((item) => item.str ?? '').join('\n');
      return `${PAGE_SEPARATOR_PREFIX}${pageCounter}---\n${text}`;
    },
  });

  const parts = parsed.text
    .split(PAGE_SEPARATOR_PREFIX)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts
    .map((part, index) => {
      const markerMatch = part.match(/^(\d+)---\n?/);
      const pageNumber = markerMatch ? Number.parseInt(markerMatch[1], 10) : index + 1;
      const text = markerMatch ? part.slice(markerMatch[0].length).trim() : part;
      return { pageNumber, text: normalizeExtractedText(text) };
    })
    .filter((page) => page.text.length > 0);
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isApartmentPage(text: string) {
  return /\bID:\s*\d+/i.test(text) && /Информация о квартире/i.test(text);
}

function parseApartmentPage(
  page: ParsedPdfPage,
  hasLayoutImage: boolean,
  hasLocationImage: boolean,
  residentialComplexes: Map<string, ResidentialComplexInfo>
): ApartmentPdfPreviewRow {
  const compact = page.text.replace(/\s+/g, ' ').trim();
  const sourceId = matchFirst(compact, /\bID:\s*(\d+)/i);
  const title = extractTitle(compact, sourceId);
  const residentialComplex = extractResidentialComplexName(title) ?? extractResidentialComplexName(compact);
  const residentialComplexInfo = residentialComplex
    ? residentialComplexes.get(normalizeLookupKey(residentialComplex))
    : undefined;
  const apartmentNumber = matchFirst(compact, /Номер квартиры\s*([A-Za-zА-Яа-я0-9.-]+)/i);
  const area = parseDecimal(matchFirst(compact, /Общая площадь\s*([\d.,]+)/i));
  const floor = parseFloor(compact);
  const price = parseMoney(matchFirst(compact, /Цена при 100% оплате\s*([\d\s.,]+)/i));
  const pricePerSquareMeter = parseMoney(matchFirst(compact, /Цена за кв\.?\s*м\s*([\d\s.,]+)/i));
  const basePrice = parseMoney(matchFirst(compact, /Базовая цена\s*([\d\s.,]+)/i));
  const livingArea = parseDecimal(matchFirst(compact, /Жилая площадь\s*([\d.,]+)/i));
  const kitchenArea = parseDecimal(matchFirst(compact, /Площадь кухни\s*([\d.,]+)/i));
  const ceilingHeight = parseDecimal(matchFirst(compact, /Высота потолков\s*([\d.,]+)/i));
  const finishingText = matchFirst(compact, /Отделка\s*([А-Яа-яA-Za-z ]+?)(?=\s+Корпус|\s+Срок сдачи|\s+Секция|$)/i);
  const finishing = mapFinishing(finishingText);
  const building = matchFirst(compact, /Корпус\s*([A-Za-zА-Яа-я0-9.-]+)/i);
  const section = matchFirst(compact, /Секция\s*([A-Za-zА-Яа-я0-9.-]+)/i);
  const completionDate = matchFirst(compact, /Срок сдачи\s*([^|]+?)(?=\s+Выдача ключей|\s+Секция|$)/i)?.trim();
  const rooms = parseRooms(title, compact);
  const name = buildApartmentName(rooms);

  const warnings: string[] = [];
  const errors: string[] = [];

  if (!sourceId) warnings.push('Не найден ID квартиры');
  if (!hasLayoutImage) warnings.push('Планировка не найдена');
  if (!hasLocationImage) warnings.push('Геолокация не найдена');
  if (residentialComplexInfo?.districtNameWasInferred) {
    warnings.push('Район определён по справочнику локаций, проверьте перед импортом');
  }
  if (!name) errors.push('Не найдено название');
  if (!rooms) errors.push('Не найдено количество комнат');
  if (area === null || area <= 0) errors.push('Площадь должна быть больше 0');
  if (floor === null || !Number.isInteger(floor)) errors.push('Этаж должен быть целым числом');
  if (price === null || price <= 0) errors.push('Цена должна быть целым числом в рублях');
  if (!finishing) errors.push('Не удалось определить отделку');

  return {
    rowId: `${page.pageNumber}-${sourceId || randomUUID()}`,
    pageNumber: page.pageNumber,
    sourceId,
    sourceTitle: title,
    name,
    rooms,
    area,
    floor,
    price,
    finishing,
    apartmentNumber,
    building,
    section,
    completionDate,
    residentialComplex: residentialComplex ?? undefined,
    address: residentialComplexInfo?.address,
    cityName: residentialComplexInfo?.cityName,
    districtName: residentialComplexInfo?.districtName,
    pricePerSquareMeter: pricePerSquareMeter ?? undefined,
    basePrice: basePrice ?? undefined,
    livingArea: livingArea ?? undefined,
    kitchenArea: kitchenArea ?? undefined,
    ceilingHeight: ceilingHeight ?? undefined,
    rawText: compact.slice(0, 2500),
    hasLayoutImage,
    hasLocationImage,
    warnings,
    errors,
    status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ready',
  };
}

function extractResidentialComplexInfos(pages: ParsedPdfPage[]) {
  const complexes = new Map<string, ResidentialComplexInfo>();

  for (const page of pages) {
    const compact = page.text.replace(/\s+/g, ' ').trim();
    const complexName = matchFirst(compact, /Информация о ЖК\s+«([^»]+)»/i);
    if (!complexName) {
      continue;
    }

    const address = normalizeAddress(
      matchFirst(compact, /Адрес\s+(.+?)(?=\s+Застройщик|\s+Класс жилья|\s+Отделка|\s+Оплата|$)/i)
    );
    const location = parseAddressLocation(address, complexName);

    complexes.set(normalizeLookupKey(complexName), {
      name: complexName,
      address,
      cityName: location.cityName,
      districtName: location.districtName,
      districtNameWasInferred: Boolean(location.districtNameWasInferred),
      localityName: location.localityName,
    });
  }

  return complexes;
}

function applyDominantCityFallback(rows: ApartmentPdfPreviewRow[]) {
  const cityCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.cityName) {
      continue;
    }

    cityCounts.set(row.cityName, (cityCounts.get(row.cityName) ?? 0) + 1);
  }

  const [dominantCity, dominantCount] =
    [...cityCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
  if (!dominantCity || !dominantCount || dominantCount < 2) {
    return rows;
  }

  return rows.map((row) => {
    if (row.cityName) {
      return row;
    }

    return {
      ...row,
      cityName: dominantCity,
      warnings: [...row.warnings, `Город не найден в PDF, подставлен самый частый город: ${dominantCity}`],
      status: row.status === 'ready' ? 'warning' : row.status,
    };
  });
}

function extractResidentialComplexName(value: string) {
  return matchFirst(value, /ЖК\s+«([^»]+)»/i);
}

function normalizeAddress(value?: string) {
  return value
    ?.replace(/\s*-\s+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function parseAddressLocation(
  address?: string,
  residentialComplex?: string
): Pick<ResidentialComplexInfo, 'cityName' | 'districtName' | 'districtNameWasInferred' | 'localityName'> {
  if (!address && !residentialComplex) {
    return {};
  }

  let cityName: string | undefined;
  if (address && /Санкт[-\s]?Петербург/i.test(address)) {
    cityName = 'Санкт-Петербург';
  } else if (address && /(^|,\s*)Москва(\s+г\.|,|$)/i.test(address)) {
    cityName = 'Москва';
  } else if (address) {
    cityName =
      matchFirst(address, /^([А-ЯЁ][А-Яа-яЁё -]+?)\s+г\./i) ??
      matchFirst(address, /^([А-ЯЁ][А-Яа-яЁё -]+?)\s+(?:д|п|пос|посёлок|с|деревня)\./i) ??
      matchFirst(address, /(?:^|,\s*)г\.\s*([А-ЯЁ][А-Яа-яЁё -]+?)(?=,|$)/i) ??
      matchFirst(address, /(?:^|,\s*)([А-ЯЁ][А-Яа-яЁё -]+?)\s+(?:д|п|пос|посёлок|с|деревня)\.(?=,|$)/i) ??
      matchFirst(address, /^([А-ЯЁ][А-Яа-яЁё -]+?)(?=,)/i);
  }

  const districtBase = address
    ? matchFirst(address, /(?:^|,\s*)район\s+([А-ЯЁ][А-Яа-яЁё -]+?)(?=,|\s|$)/i) ??
      matchFirst(address, /([А-ЯЁ][А-Яа-яЁё -]+?)\s*(?:р-н|район)(?=,|\s|$)/i)
    : undefined;
  const normalizedDistrictBase = districtBase?.replace(/\s+/g, ' ').trim();
  const districtName = normalizedDistrictBase
    ? cityName === 'Москва'
      ? `район ${normalizedDistrictBase}`
      : `${normalizedDistrictBase} район`
    : undefined;
  const normalizedLocation = normalizeImportedLocation({
    address,
    cityName,
    districtName,
    residentialComplex,
  });

  return {
    cityName: normalizedLocation.cityName?.replace(/\s+/g, ' ').trim(),
    districtName: normalizedLocation.districtName,
    districtNameWasInferred: normalizedLocation.isDistrictInferred,
    localityName: normalizedLocation.localityName,
  };
}

function normalizeLookupKey(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function extractTitle(text: string, sourceId?: string) {
  if (!sourceId) {
    return '';
  }

  const beforeId = text.slice(0, text.indexOf(`ID: ${sourceId}`)).trim();
  const titleMatch = beforeId.match(
    /((?:Студия|\d+\s*(?:[-–]\s*)?(?:комнат[а-я]*|ккв)|Евро[^\s]*)[^|]*?ЖК\s+«[^»]+»)/i
  );
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }

  const fallback = beforeId.split(' E-mail ').pop() || beforeId.split('Ваш агент').pop() || beforeId;
  return fallback.trim();
}

function buildApartmentName(rooms: string) {
  if (/студ/i.test(rooms)) {
    return 'Студия';
  }

  const roomCount = parseInteger(rooms);
  if (roomCount !== null && roomCount > 0) {
    return `${roomCount}-комнатная`;
  }

  return '';
}

function parseRooms(title: string, text = '') {
  const source = `${title} ${text}`;

  if (/студ/i.test(source)) {
    return 'Студия';
  }

  const patterns = [
    /(\d+)\s*(?:[-–]\s*)?комнат/i,
    /(\d+)\s*ккв/i,
    /евро\s*[-–]?\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return '';
}

function mapFinishing(value?: string): ApartmentFormData['finishing'] | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  const direct = FINISHING_OPTIONS.find(
    (option) =>
      option.value.toLowerCase() === normalized ||
      option.label.toLowerCase() === normalized
  );
  if (direct) {
    return direct.value;
  }

  if (normalized.includes('подчист') || normalized.includes('white') || normalized.includes('вайт')) {
    return FINISHING_OPTIONS.find((option) => option.label.toLowerCase().includes('подчист'))?.value ?? null;
  }

  if (normalized.includes('чистов')) {
    return FINISHING_OPTIONS.find((option) => option.label.toLowerCase().includes('чистов'))?.value ?? null;
  }

  if (normalized.includes('без')) {
    return FINISHING_OPTIONS.find((option) => option.label.toLowerCase().includes('без'))?.value ?? null;
  }

  return null;
}

function parseDecimal(value?: string): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloor(text: string): number | null {
  const patterns = [
    /(?:^|\s)Этаж\s*(-?\d{1,3})\s*(?:\/\s*\d{1,3})?/i,
    /(?:^|\s)(-?\d{1,3})\s*\/\s*\d{1,3}\s*(?=Номер квартиры|Отделка|Корпус|Секция|$)/i,
  ];

  for (const pattern of patterns) {
    const floor = parseInteger(matchFirst(text, pattern));

    if (floor !== null && floor >= -10 && floor <= 200) {
      return floor;
    }
  }

  return null;
}

function parseMoney(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchFirst(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[1]?.trim();
}

function buildSummary(rows: ApartmentPdfPreviewRow[]): ApartmentPdfParseResult['summary'] {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.status === 'ready').length,
    warnings: rows.filter((row) => row.status === 'warning').length,
    errors: rows.filter((row) => row.status === 'error').length,
    withLayoutImages: rows.filter((row) => row.hasLayoutImage).length,
    withLocationImages: rows.filter((row) => row.hasLocationImage).length,
  };
}

function findPagesWithLayoutImages(pdfDoc: PDFDocument, pageCount: number) {
  const pages = new Set<number>();

  for (let index = 0; index < Math.min(pageCount, pdfDoc.getPageCount()); index += 1) {
    const image = extractFirstJpegImageFromPage(pdfDoc, index + 1);
    if (image) {
      pages.add(index + 1);
    }
  }

  return pages;
}

function findPagesWithLocationImages(pdfDoc: PDFDocument, pageCount: number) {
  const pages = new Set<number>();

  for (let index = 0; index < Math.min(pageCount, pdfDoc.getPageCount()); index += 1) {
    const image = extractLocationImageForApartmentPage(pdfDoc, index + 1);
    if (image) {
      pages.add(index + 1);
    }
  }

  return pages;
}

async function extractFirstJpegImage(buffer: Buffer, pageNumber: number): Promise<Buffer | null> {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return extractFirstJpegImageFromPage(pdfDoc, pageNumber);
}

interface PdfJpegImage {
  buffer: Buffer;
  width: number;
  height: number;
  area: number;
  ratio: number;
}

function extractFirstJpegImageFromPage(
  pdfDoc: PDFDocument,
  pageNumber: number
): Buffer | null {
  return listJpegImagesFromPage(pdfDoc, pageNumber)[0]?.buffer ?? null;
}

function extractLocationImageForApartmentPage(
  pdfDoc: PDFDocument,
  apartmentPageNumber: number
): Buffer | null {
  const locationPageNumber = apartmentPageNumber + 1;
  const images = listJpegImagesFromPage(pdfDoc, locationPageNumber);
  if (images.length === 0) {
    return null;
  }

  const largeImages = images.filter((image) => image.width >= 400 && image.height >= 250);
  const candidates = largeImages.length > 0 ? largeImages : images;
  return candidates
    .map((image) => ({
      image,
      score: scoreLocationImageCandidate(image),
    }))
    .sort((left, right) => right.score - left.score)[0]?.image.buffer ?? null;
}

function listJpegImagesFromPage(
  pdfDoc: PDFDocument,
  pageNumber: number
): PdfJpegImage[] {
  if (pageNumber < 1 || pageNumber > pdfDoc.getPageCount()) {
    return [];
  }

  const page = pdfDoc.getPage(pageNumber - 1);
  const resources = page.node.Resources();
  const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);

  if (!xObjects) {
    return [];
  }

  const images: PdfJpegImage[] = [];
  for (const key of xObjects.keys()) {
    const object = xObjects.lookup(key);
    if (!(object instanceof PDFRawStream)) {
      continue;
    }

    const subtype = object.dict.get(PDFName.of('Subtype'));
    if (subtype?.toString() !== '/Image') {
      continue;
    }

    if (!hasDctFilter(object.dict.get(PDFName.of('Filter')))) {
      continue;
    }

    const width = Number(object.dict.get(PDFName.of('Width'))?.toString());
    const height = Number(object.dict.get(PDFName.of('Height'))?.toString());
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      continue;
    }

    images.push({
      buffer: Buffer.from(object.contents),
      width,
      height,
      area: width * height,
      ratio: width / height,
    });
  }

  return images;
}

function scoreLocationImageCandidate(image: PdfJpegImage) {
  const targetMapRatio = 1.68;
  const ratioDistance = Math.abs(image.ratio - targetMapRatio);
  const ratioScore = Math.max(0, 50 - ratioDistance * 60);
  const sizeScore = Math.min(image.area / 300_000, 1) * 20;
  const isLandscapeMap = image.ratio >= 1.35 && image.ratio <= 2.1 ? 100 : 0;
  const isLargeEnough = image.width >= 500 && image.height >= 300 ? 100 : 0;

  return isLargeEnough + isLandscapeMap + ratioScore + sizeScore;
}

function hasDctFilter(filter: unknown) {
  if (!filter) {
    return false;
  }

  if (filter instanceof PDFName) {
    return filter.toString() === '/DCTDecode';
  }

  if (filter instanceof PDFArray) {
    return filter.asArray().some((item) => item instanceof PDFName && item.toString() === '/DCTDecode');
  }

  return false;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\p{L}\p{N}_. -]/gu, '').slice(0, 120) || 'apartments.pdf';
}
