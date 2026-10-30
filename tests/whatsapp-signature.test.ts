import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookToken, verifyWhatsAppSignature } from "@/server/whatsapp/signature";

describe("WhatsApp webhook authentication", () => {
  const secret = "test-app-secret";
  const body = JSON.stringify({ entry: [] });

  it("accepts a valid sha256 signature over the raw body", () => {
    const digest = createHmac("sha256", secret).update(body).digest("hex");
    expect(
      verifyWhatsAppSignature({
        rawBody: body,
        signatureHeader: `sha256=${digest}`,
        appSecret: secret,
      }),
    ).toBe(true);
  });

  it("rejects a modified body, wrong secret and malformed header", () => {
    const digest = createHmac("sha256", secret).update(body).digest("hex");
    expect(
      verifyWhatsAppSignature({
        rawBody: `${body} `,
        signatureHeader: `sha256=${digest}`,
        appSecret: secret,
      }),
    ).toBe(false);
    expect(
      verifyWhatsAppSignature({
        rawBody: body,
        signatureHeader: `sha256=${digest}`,
        appSecret: "other",
      }),
    ).toBe(false);
    expect(
      verifyWhatsAppSignature({
        rawBody: body,
        signatureHeader: "sha1=abc",
        appSecret: secret,
      }),
    ).toBe(false);
    expect(
      verifyWhatsAppSignature({ rawBody: body, signatureHeader: null, appSecret: secret }),
    ).toBe(false);
  });

  it("compares the subscription token without accepting prefixes", () => {
    expect(verifyWebhookToken("correct-token", "correct-token")).toBe(true);
    expect(verifyWebhookToken("correct", "correct-token")).toBe(false);
    expect(verifyWebhookToken(null, "correct-token")).toBe(false);
    expect(verifyWebhookToken("anything", "")).toBe(false);
  });
});
