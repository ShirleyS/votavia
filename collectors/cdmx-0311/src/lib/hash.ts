import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256String(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Deterministic JSON used for hashes, never for user-facing storage. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const item = record[key];
      if (item !== undefined) output[key] = sortValue(item);
    }
    return output;
  }
  return value;
}

export function shortHash(hash: string, length = 12): string {
  return hash.slice(0, length);
}
