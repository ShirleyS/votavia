#!/usr/bin/env node
import { createHmac, randomUUID } from "node:crypto";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const url = argument("url", "http://localhost:3000/api/whatsapp/webhook");
const secret = argument("secret", process.env.WHATSAPP_APP_SECRET ?? "");
const from = argument("from", "5215500000001");
const text = argument("text", "Hay un bache en Roma Norte");

if (!secret) {
  console.error("Falta --secret o WHATSAPP_APP_SECRET.");
  process.exit(1);
}

const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "smoke-entry",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "000", phone_number_id: "smoke" },
            messages: [
              {
                id: `wamid.smoke.${randomUUID()}`,
                from,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
});

const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Hub-Signature-256": signature,
  },
  body,
});

const responseText = await response.text();
console.log(`HTTP ${response.status}`);
console.log(responseText.slice(0, 500));
if (!response.ok) process.exit(1);
