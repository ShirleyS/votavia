import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { CsvParseError } from "../errors.js";
import { ensureDir, readHead } from "../lib/fs.js";
import { createDecoder, detectEncoding, type SupportedEncoding } from "./encoding.js";

export interface CsvRow {
  /** 1-based row number, excluding the header row. */
  row_number: number;
  values: string[];
}

export interface CsvOptions {
  delimiter?: string;
  maxFieldChars?: number;
  /** Safety valve for fixtures; production import uses streaming without this. */
  maxRows?: number;
}

export interface CsvReader {
  headers: string[];
  delimiter: string;
  encoding: SupportedEncoding;
  rows: AsyncGenerator<CsvRow>;
}

const DEFAULT_MAX_FIELD_CHARS = 1_000_000;

export async function openCsvFromText(text: string, options: CsvOptions = {}): Promise<CsvReader> {
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return openCsvFromChunks(singleChunk(cleaned), "utf-8", options);
}

export async function openCsvFromFile(filePath: string, options: CsvOptions = {}): Promise<CsvReader> {
  const head = await readHead(filePath, 4);
  const gzipped = head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;
  const raw = createReadStream(filePath);
  const stream = gzipped ? raw.pipe(createGunzip()) : raw;
  const chunks = stream[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  const prefix: Buffer[] = [];
  let prefixLength = 0;
  while (prefixLength < 65_536) {
    const next = await chunks.next();
    if (next.done) break;
    prefix.push(next.value);
    prefixLength += next.value.length;
  }
  const sample = Buffer.concat(prefix);
  const detection = detectEncoding(sample);
  const decoder = createDecoder(detection.encoding);
  const decoded = (async function* (): AsyncGenerator<string> {
    for (const chunk of prefix) yield decoder.decode(chunk, { stream: true });
    for (;;) {
      const next = await chunks.next();
      if (next.done) break;
      yield decoder.decode(next.value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  })();
  return openCsvFromChunks(decoded, detection.encoding, options, detection.bom);
}

async function openCsvFromChunks(
  chunks: AsyncIterable<string>,
  encoding: SupportedEncoding,
  options: CsvOptions,
  stripBom = false,
): Promise<CsvReader> {
  const iterator = chunks[Symbol.asyncIterator]();
  let buffered: string | null = null;
  const first = await iterator.next();
  let firstChunk = first.done ? "" : first.value;
  if (stripBom && firstChunk.charCodeAt(0) === 0xfeff) firstChunk = firstChunk.slice(1);
  buffered = firstChunk;
  const delimiter = options.delimiter ?? sniffDelimiter(buffered);
  const combined = (async function* (): AsyncGenerator<string> {
    if (buffered !== null) yield buffered;
    buffered = null;
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      yield next.value;
    }
  })();
  const generator = csvRows(combined, { ...options, delimiter });
  const headerRow = await generator.next();
  if (headerRow.done) throw new CsvParseError("CSV file is empty");
  const headers = headerRow.value.values.map((header) => header.replace(/^\uFEFF/, "").trim());
  if (headers.every((header) => header.length === 0)) {
    throw new CsvParseError("CSV header row is empty");
  }
  return {
    headers,
    delimiter,
    encoding,
    rows: generator as AsyncGenerator<CsvRow>,
  };
}

export async function* csvRows(chunks: AsyncIterable<string>, options: CsvOptions & { delimiter: string }): AsyncGenerator<CsvRow> {
  const delimiter = options.delimiter;
  const maxFieldChars = options.maxFieldChars ?? DEFAULT_MAX_FIELD_CHARS;
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let rowNumber = 0;
  let physicalLine = 1;
  let fieldStartLine = 1;
  let sawAnyCharacter = false;
  let pendingCarriageReturn = false;
  let emitted = 0;

  const finishField = (): void => {
    if (field.length > maxFieldChars) {
      throw new CsvParseError(`CSV field exceeds ${maxFieldChars} characters at line ${fieldStartLine}`);
    }
    row.push(field);
    field = "";
  };

  const finishRow = (): CsvRow | null => {
    finishField();
    const values = row;
    row = [];
    if (values.every((value) => value.trim() === "")) {
      sawAnyCharacter = false;
      return null;
    }
    rowNumber += 1;
    if (rowNumber > maxRows) return null;
    emitted += 1;
    sawAnyCharacter = false;
    return { row_number: rowNumber, values };
  };

  for await (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index] as string;
      if (pendingCarriageReturn) {
        pendingCarriageReturn = false;
        if (char === "\n") continue;
      }
      if (inQuotes) {
        if (char === '"') {
          if (chunk[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
          if (char === "\n") physicalLine += 1;
        }
        if (field.length > maxFieldChars) {
          throw new CsvParseError(`CSV field exceeds ${maxFieldChars} characters at line ${fieldStartLine}`);
        }
        continue;
      }
      if (char === '"' && field.length === 0) {
        inQuotes = true;
        sawAnyCharacter = true;
        continue;
      }
      if (char === delimiter) {
        finishField();
        sawAnyCharacter = true;
        continue;
      }
      if (char === "\n" || char === "\r") {
        if (char === "\r") pendingCarriageReturn = true;
        const finished = finishRow();
        physicalLine += 1;
        fieldStartLine = physicalLine;
        if (finished) {
          yield finished;
          if (emitted >= maxRows) return;
        }
        continue;
      }
      field += char;
      if (!sawAnyCharacter && !/\s/.test(char)) sawAnyCharacter = true;
      if (field.length > maxFieldChars) {
        throw new CsvParseError(`CSV field exceeds ${maxFieldChars} characters at line ${fieldStartLine}`);
      }
    }
  }
  if (inQuotes) {
    throw new CsvParseError(`Unterminated quoted CSV field starting at line ${fieldStartLine}`);
  }
  if (field.length > 0 || row.length > 0) {
    const finished = finishRow();
    if (finished) yield finished;
  }
}

/** Counts delimiters in the first logical CSV line, ignoring quoted regions. */
export function sniffDelimiter(sample: string): string {
  const candidates = [",", ";", "\t", "|"];
  const counts = new Map<string, number>(candidates.map((candidate) => [candidate, 0]));
  let inQuotes = false;
  for (let index = 0; index < sample.length; index += 1) {
    const char = sample[index] as string;
    if (char === '"') {
      if (inQuotes && sample[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) break;
    if (!inQuotes && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = counts.get(candidate) ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

async function* singleChunk(text: string): AsyncGenerator<string> {
  yield text;
}

export async function readAllCsvFromText(text: string, options: CsvOptions = {}): Promise<{ headers: string[]; rows: CsvRow[]; delimiter: string }> {
  const reader = await openCsvFromText(text, options);
  const rows: CsvRow[] = [];
  for await (const row of reader.rows) rows.push(row);
  return { headers: reader.headers, rows, delimiter: reader.delimiter };
}

export async function writeCsvFixture(filePath: string, text: string): Promise<void> {
  await ensureDir(filePath.replace(/\/[^/]+$/, ""));
  await import("node:fs/promises").then(({ writeFile }) => writeFile(filePath, text, "utf8"));
}

export async function openCsvFromReadable(readable: Readable, options: CsvOptions = {}): Promise<CsvReader> {
  const chunks = (async function* (): AsyncGenerator<string> {
    for await (const chunk of readable) yield String(chunk);
  })();
  return openCsvFromChunks(chunks, "utf-8", options);
}
