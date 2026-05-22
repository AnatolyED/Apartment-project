declare module 'pdf-parse/lib/pdf-parse.js' {
  import type { Buffer } from 'node:buffer';

  type PdfParseVersion = 'default' | 'v1.9.426' | 'v1.10.100' | 'v1.10.88' | 'v2.0.550';

  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: PdfParseVersion;
    text: string;
  }

  interface PdfTextContent {
    items: Array<{ str?: string }>;
  }

  interface PdfPageData {
    getTextContent: (options?: {
      normalizeWhitespace?: boolean;
      disableCombineTextItems?: boolean;
    }) => Promise<PdfTextContent>;
  }

  interface PdfParseOptions {
    pagerender?: (pageData: PdfPageData) => string | Promise<string>;
    max?: number;
    version?: PdfParseVersion;
  }

  export default function pdfParse(
    dataBuffer: Buffer,
    options?: PdfParseOptions
  ): Promise<PdfParseResult>;
}
