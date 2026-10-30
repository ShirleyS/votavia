import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { stat, rename } from "node:fs/promises";
import { Readable } from "node:stream";
import { once } from "node:events";
import path from "node:path";
import { CollectorError } from "../errors.js";
import { ensureDir, readHead, removeIfExists } from "../lib/fs.js";
import type { HttpClient } from "../lib/http.js";

export interface DownloadOptions {
  client: HttpClient;
  url: string;
  destination: string;
  etag?: string | null;
  lastModified?: string | null;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface DownloadResult {
  status: "downloaded" | "not_modified";
  path: string;
  sha256: string | null;
  bytes: number | null;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
}

export async function downloadToFile(options: DownloadOptions): Promise<DownloadResult> {
  await ensureDir(path.dirname(options.destination));
  const headers: Record<string, string> = {
    accept: "text/csv, application/json, application/octet-stream, */*",
  };
  if (options.etag) headers["if-none-match"] = options.etag;
  if (options.lastModified) headers["if-modified-since"] = options.lastModified;
  const response = await options.client.fetch(
    options.url,
    { headers },
    { fetchImpl: options.fetchImpl, sleep: options.sleep },
  );
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  const contentType = response.headers.get("content-type");
  if (response.status === 304) {
    return {
      status: "not_modified",
      path: options.destination,
      sha256: null,
      bytes: null,
      etag,
      lastModified,
      contentType,
    };
  }
  if (!response.body) {
    throw new CollectorError("DOWNLOAD_FAILED", `Empty response body for ${options.url}`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (options.maxBytes && Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
    throw new CollectorError("DOWNLOAD_TOO_LARGE", `Response declares ${declaredLength} bytes, above ${options.maxBytes}`, {
      details: { url: options.url, declaredLength, maxBytes: options.maxBytes },
    });
  }

  const partPath = `${options.destination}.part-${process.pid}-${Date.now()}`;
  const hash = createHash("sha256");
  let bytes = 0;
  const output = createWriteStream(partPath, { flags: "w" });
  try {
    const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    for await (const chunk of body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      bytes += buffer.length;
      if (options.maxBytes && bytes > options.maxBytes) {
        throw new CollectorError("DOWNLOAD_TOO_LARGE", `Download exceeded ${options.maxBytes} bytes`, {
          details: { url: options.url, bytes, maxBytes: options.maxBytes },
        });
      }
      hash.update(buffer);
      if (!output.write(buffer)) await once(output, "drain");
    }
    output.end();
    await once(output, "finish");
    const head = await readHead(partPath, 512);
    if (isHtmlErrorPage(head, contentType)) {
      throw new CollectorError("DOWNLOAD_CONTENT_INVALID", `Expected data file but received an HTML page from ${options.url}`, {
        details: { contentType, preview: head.toString("utf8", 0, 120) },
      });
    }
    await rename(partPath, options.destination);
    const fileStat = await stat(options.destination);
    return {
      status: "downloaded",
      path: options.destination,
      sha256: hash.digest("hex"),
      bytes: fileStat.size,
      etag,
      lastModified,
      contentType,
    };
  } catch (error) {
    output.destroy();
    await removeIfExists(partPath);
    if (error instanceof CollectorError) throw error;
    throw new CollectorError("DOWNLOAD_FAILED", `Failed to download ${options.url}: ${(error as Error).message}`, {
      cause: error,
      details: { url: options.url },
    });
  }
}

export function isHtmlErrorPage(head: Uint8Array, contentType: string | null): boolean {
  if (contentType && /\btext\/html\b/i.test(contentType)) return true;
  const text = Buffer.from(head).toString("utf8", 0, Math.min(head.length, 256)).trimStart().toLowerCase();
  return text.startsWith("<!doctype html") || text.startsWith("<html") || text.includes("<title>just a moment");
}
