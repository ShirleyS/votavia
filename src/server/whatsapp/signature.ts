import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's `X-Hub-Signature-256` against the exact raw request body.
 * The comparison is constant-time for equal-length digests.
 */
export function verifyWhatsAppSignature(input: {
  rawBody: string | Uint8Array;
  signatureHeader: string | null;
  appSecret: string;
}): boolean {
  const secret = input.appSecret.trim();
  const header = input.signatureHeader?.trim() ?? "";
  if (!secret || !header.startsWith("sha256=")) return false;

  const provided = header.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(provided)) return false;

  const digest = createHmac("sha256", secret)
    .update(typeof input.rawBody === "string" ? Buffer.from(input.rawBody, "utf8") : input.rawBody)
    .digest();
  const expected = Buffer.from(provided, "hex");
  return expected.length === digest.length && timingSafeEqual(expected, digest);
}

/** Constant-time token comparison for the webhook subscription handshake. */
export function verifyWebhookToken(provided: string | null, expected: string): boolean {
  const a = Buffer.from(provided ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (!b.length) return false;
  if (a.length !== b.length) {
    // Still perform one comparison to avoid an obvious early-exit oracle.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
