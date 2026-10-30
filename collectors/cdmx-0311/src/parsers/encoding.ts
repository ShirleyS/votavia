export type SupportedEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

export interface EncodingDetection {
  encoding: SupportedEncoding;
  bom: boolean;
  hadUtf8Errors: boolean;
}

/**
 * Detects the encodings that CDMX open-data files realistically use. If a
 * sample is not valid UTF-8, Windows-1252 is the safest Superset fallback for
 * Spanish text; bytes outside that range decode with replacement characters.
 */
export function detectEncoding(buffer: Uint8Array): EncodingDetection {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: "utf-8", bom: true, hadUtf8Errors: false };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { encoding: "utf-16le", bom: true, hadUtf8Errors: false };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { encoding: "utf-16be", bom: true, hadUtf8Errors: false };
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { encoding: "utf-8", bom: false, hadUtf8Errors: false };
  } catch {
    return { encoding: "windows-1252", bom: false, hadUtf8Errors: true };
  }
}

export function createDecoder(encoding: SupportedEncoding): TextDecoder {
  return new TextDecoder(encoding, { fatal: false });
}

export function decodeBuffer(buffer: Uint8Array, encoding?: SupportedEncoding): string {
  return createDecoder(encoding ?? detectEncoding(buffer).encoding).decode(buffer);
}

export function containsReplacementCharacter(value: string): boolean {
  return value.includes("\uFFFD");
}
