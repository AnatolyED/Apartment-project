import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';
import { parseApartmentPdf } from '../lib/apartments/pdf-import';

interface CliOptions {
  dir: string;
  limit: number;
  out?: string;
  allowRowErrors: boolean;
}

interface PdfReportEntry {
  fileName: string;
  filePath: string;
  ok: boolean;
  durationMs: number;
  pageCount?: number;
  fileHash?: string;
  rows?: number;
  ready?: number;
  warnings?: number;
  errors?: number;
  withLayoutImages?: number;
  withLocationImages?: number;
  issueSummary?: string[];
  error?: string;
}

interface BatchReport {
  mode: 'analyze-only';
  generatedAt: string;
  inputDir: string;
  limit: number;
  discoveredPdfCount: number;
  analyzedPdfCount: number;
  skippedPdfCount: number;
  totals: {
    okFiles: number;
    failedFiles: number;
    rows: number;
    ready: number;
    warnings: number;
    errors: number;
    withLayoutImages: number;
    withLocationImages: number;
  };
  files: PdfReportEntry[];
}

function parseArgs(argv: string[]): CliOptions {
  let dir = '';
  let limit = 10;
  let out: string | undefined;
  let allowRowErrors = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dir') {
      dir = argv[++index] ?? '';
    } else if (arg === '--limit') {
      limit = Number.parseInt(argv[++index] ?? '', 10);
    } else if (arg === '--out') {
      out = argv[++index];
    } else if (arg === '--allow-row-errors') {
      allowRowErrors = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('--') && !dir) {
      dir = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!dir) {
    throw new Error('Provide a PDF folder with --dir <path> or as the first positional argument.');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('--limit must be an integer from 1 to 10.');
  }

  return {
    dir: path.resolve(dir),
    limit,
    out: out ? path.resolve(out) : undefined,
    allowRowErrors,
  };
}

function printUsage() {
  console.log(`Analyze 1-10 apartment PDF files without importing anything into the database.

Usage:
  npx tsx scripts/analyze-pdf-batch.ts --dir "C:\\path\\to\\client-pdfs" --limit 10 --out ".\\reports\\pdf-import-analysis.json"

Options:
  --dir <path>           Folder with PDF files. Can also be the first positional argument.
  --limit <1-10>         Maximum files to analyze. Defaults to 10.
  --out <path>           Optional JSON report output path.
  --allow-row-errors     Exit 0 even if parsed rows contain validation errors.
  --help                 Show this help.

Safety:
  This runner calls parseApartmentPdf directly. It does not create import preview cache,
  does not call confirm actions, and does not write to the database.`);
}

async function findPdfFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name);

      if (entry.isDirectory()) {
        return findPdfFiles(fullPath);
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        return [fullPath];
      }

      return [];
    })
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}

function summarizeIssues(rows: Awaited<ReturnType<typeof parseApartmentPdf>>['rows']) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const issue of [...row.errors, ...row.warnings]) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([message, count]) => `${message} (${count})`);
}

async function analyzeFile(filePath: string): Promise<PdfReportEntry> {
  const startedAt = performance.now();
  const fileName = path.basename(filePath);

  try {
    const buffer = await readFile(filePath);
    const parsed = await parseApartmentPdf(buffer, fileName);

    return {
      fileName,
      filePath,
      ok: parsed.summary.errors === 0,
      durationMs: Math.round(performance.now() - startedAt),
      pageCount: parsed.pageCount,
      fileHash: parsed.fileHash,
      rows: parsed.summary.total,
      ready: parsed.summary.ready,
      warnings: parsed.summary.warnings,
      errors: parsed.summary.errors,
      withLayoutImages: parsed.summary.withLayoutImages,
      withLocationImages: parsed.summary.withLocationImages,
      issueSummary: summarizeIssues(parsed.rows),
    };
  } catch (error) {
    return {
      fileName,
      filePath,
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildReport(options: CliOptions, discoveredCount: number, files: PdfReportEntry[]): BatchReport {
  return {
    mode: 'analyze-only',
    generatedAt: new Date().toISOString(),
    inputDir: options.dir,
    limit: options.limit,
    discoveredPdfCount: discoveredCount,
    analyzedPdfCount: files.length,
    skippedPdfCount: Math.max(0, discoveredCount - files.length),
    totals: {
      okFiles: files.filter((file) => file.ok).length,
      failedFiles: files.filter((file) => !file.ok).length,
      rows: sum(files, 'rows'),
      ready: sum(files, 'ready'),
      warnings: sum(files, 'warnings'),
      errors: sum(files, 'errors'),
      withLayoutImages: sum(files, 'withLayoutImages'),
      withLocationImages: sum(files, 'withLocationImages'),
    },
    files,
  };
}

function sum(
  files: PdfReportEntry[],
  key: 'rows' | 'ready' | 'warnings' | 'errors' | 'withLayoutImages' | 'withLocationImages'
) {
  return files.reduce((total, file) => total + (file[key] ?? 0), 0);
}

function printReport(report: BatchReport) {
  console.log(`PDF import analyze-only report`);
  console.log(`Input: ${report.inputDir}`);
  console.log(
    `Analyzed: ${report.analyzedPdfCount}/${report.discoveredPdfCount}; skipped by limit: ${report.skippedPdfCount}`
  );
  console.log(
    `Rows: ${report.totals.rows}; ready: ${report.totals.ready}; warnings: ${report.totals.warnings}; errors: ${report.totals.errors}; layout images: ${report.totals.withLayoutImages}; location images: ${report.totals.withLocationImages}`
  );
  console.log('');

  for (const file of report.files) {
    const status = file.ok ? 'OK' : 'FAIL';
    const rowSummary =
      file.rows === undefined
        ? file.error ?? 'unknown error'
        : `pages=${file.pageCount}, rows=${file.rows}, ready=${file.ready}, warnings=${file.warnings}, errors=${file.errors}, layouts=${file.withLayoutImages}, locations=${file.withLocationImages}`;

    console.log(`[${status}] ${file.fileName}: ${rowSummary}`);

    if (file.issueSummary?.length) {
      for (const issue of file.issueSummary.slice(0, 3)) {
        console.log(`  - ${issue}`);
      }
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const discoveredFiles = await findPdfFiles(options.dir);
  const selectedFiles = discoveredFiles.slice(0, options.limit);
  const files: PdfReportEntry[] = [];

  for (const filePath of selectedFiles) {
    files.push(await analyzeFile(filePath));
  }

  const report = buildReport(options, discoveredFiles.length, files);
  printReport(report);

  if (options.out) {
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\nJSON report written to ${options.out}`);
  }

  const hasParseFailures = report.files.some((file) => file.error);
  const hasRowErrors = report.totals.errors > 0;

  if (hasParseFailures || (hasRowErrors && !options.allowRowErrors)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
