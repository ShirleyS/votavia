import { createReadStream } from "node:fs";
import { appendFile, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { CsvParseError } from "../errors.js";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function atomicWriteFile(filePath: string, data: string | Uint8Array): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, data);
  await rename(temp, filePath);
}

export async function atomicWriteJson(filePath: string, value: unknown, pretty = true): Promise<void> {
  const text = pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value);
  await atomicWriteFile(filePath, text);
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function appendJsonlMany(filePath: string, values: readonly unknown[]): Promise<void> {
  if (values.length === 0) return;
  await ensureDir(path.dirname(filePath));
  await appendFile(filePath, values.map((value) => JSON.stringify(value)).join("\n") + "\n", "utf8");
}

export interface JsonlWriter {
  /** Buffers a line; flushes automatically once the buffer is large enough. */
  write(value: unknown): Promise<void>;
  close(): Promise<void>;
}

/** Batching writer for large streaming imports. Creates no file until a line exists. */
export function createJsonlWriter(filePath: string, flushBytes = 64 * 1024): JsonlWriter {
  let buffer = "";
  let closed = false;
  const flush = async (): Promise<void> => {
    if (!buffer) return;
    const payload = buffer;
    buffer = "";
    await appendFile(filePath, payload, "utf8");
  };
  return {
    async write(value: unknown): Promise<void> {
      if (closed) throw new Error(`JSONL writer is closed: ${filePath}`);
      buffer += `${JSON.stringify(value)}\n`;
      if (buffer.length >= flushBytes) await flush();
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await flush();
    },
  };
}

export async function* readJsonl<T>(filePath: string): AsyncGenerator<T> {
  const file = await open(filePath, "r");
  try {
    let buffer = "";
    const chunks = file.createReadStream({ encoding: "utf8" });
    for await (const chunk of chunks) {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) yield parseJsonLine<T>(line, filePath);
        index = buffer.indexOf("\n");
      }
    }
    const last = buffer.trim();
    if (last) yield parseJsonLine<T>(last, filePath);
  } finally {
    // FileHandle is closed by its stream; keeping this block explicit avoids
    // leaking descriptors if parsing throws before the stream starts.
  }
}

function parseJsonLine<T>(line: string, filePath: string): T {
  try {
    return JSON.parse(line) as T;
  } catch (error) {
    throw new CsvParseError(`Invalid JSONL in ${filePath}: ${(error as Error).message}`);
  }
}

export async function countFileLines(filePath: string): Promise<number> {
  let lines = 0;
  const stream = createReadStream(filePath, { encoding: "utf8" });
  let sawContent = false;
  for await (const chunk of stream) {
    const text = chunk as string;
    if (text.length > 0) sawContent = true;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "\n") lines += 1;
    }
  }
  if (sawContent && !(await fileEndsWithNewline(filePath))) lines += 1;
  return lines;
}

async function fileEndsWithNewline(filePath: string): Promise<boolean> {
  const file = await open(filePath, "r");
  try {
    const size = (await file.stat()).size;
    if (size === 0) return true;
    const buffer = Buffer.alloc(1);
    await file.read(buffer, 0, 1, size - 1);
    return buffer[0] === 0x0a;
  } finally {
    await file.close();
  }
}

export function safeFilename(value: string, fallback = "file"): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
  return cleaned || fallback;
}

export async function readHead(filePath: string, bytes: number): Promise<Buffer> {
  const file = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await file.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}
