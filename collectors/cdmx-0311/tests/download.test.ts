import { describe, expect, it, afterEach } from "vitest";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { downloadToFile } from "../src/adapters/download.js";
import { HttpClient, type HttpClientOptions } from "../src/lib/http.js";
import { sha256String } from "../src/lib/hash.js";
import { cleanupDir, makeTempDir } from "./helpers.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(cleanupDir));
});

function clientWith(fetchImpl: typeof fetch, overrides: Partial<HttpClientOptions> = {}): HttpClient {
  return new HttpClient({
    userAgent: "test-agent",
    timeoutMs: 2_000,
    retries: 2,
    minIntervalMs: 0,
    fetchImpl,
    sleep: async () => undefined,
    ...overrides,
  });
}

describe("streaming download", () => {
  it("writes a file and returns a SHA-256 checksum", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const body = "folio,alcaldia\n1,Cuauhtémoc\n";
    const client = clientWith(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "text/csv", etag: '"v1"' },
    }));
    const result = await downloadToFile({ client, url: "https://example.test/data.csv", destination: path.join(dir, "data.csv") });
    expect(result.status).toBe("downloaded");
    expect(result.sha256).toBe(sha256String(body));
    expect(result.etag).toBe('"v1"');
    expect(await readFile(path.join(dir, "data.csv"), "utf8")).toBe(body);
  });

  it("returns not_modified for HTTP 304", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const client = clientWith(async () => new Response(null, { status: 304 }));
    const result = await downloadToFile({ client, url: "https://example.test/data.csv", destination: path.join(dir, "data.csv"), etag: '"v1"' });
    expect(result.status).toBe("not_modified");
  });

  it("rejects an HTML error page instead of parsing it as CSV", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const client = clientWith(async () => new Response("<!doctype html><html><body>Blocked</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    await expect(downloadToFile({ client, url: "https://example.test/data.csv", destination: path.join(dir, "data.csv") }))
      .rejects.toMatchObject({ code: "DOWNLOAD_CONTENT_INVALID" });
  });

  it("retries transient 5xx responses", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    let attempts = 0;
    const client = clientWith(async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("temporary", { status: 503 })
        : new Response("ok", { status: 200, headers: { "content-type": "text/csv" } });
    });
    const result = await downloadToFile({ client, url: "https://example.test/data.csv", destination: path.join(dir, "data.csv") });
    expect(attempts).toBe(2);
    expect(result.status).toBe("downloaded");
  });

  it("enforces maxBytes while streaming", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const client = clientWith(async () => new Response("x".repeat(100), { status: 200 }));
    await expect(downloadToFile({ client, url: "https://example.test/data.csv", destination: path.join(dir, "data.csv"), maxBytes: 10 }))
      .rejects.toMatchObject({ code: "DOWNLOAD_TOO_LARGE" });
  });
});
