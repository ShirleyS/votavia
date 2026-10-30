import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import * as route from "@/app/api/whatsapp/simulate/route";

function req(body: unknown) {
  return new NextRequest("http://localhost:3000/api/whatsapp/simulate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/whatsapp/simulate", () => {
  it("accepts the documented demo payload and returns a reply", async () => {
    const res = await route.POST(
      req({ sessionId: "demo-session-1", kind: "text", text: "Hay un bache enorme en la esquina." }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBeGreaterThan(0);
    expect(typeof body.state).toBe("string");
  });

  it("rejects a missing or malformed sessionId", async () => {
    const missing = await route.POST(req({ kind: "text", text: "hola" }));
    expect(missing.status).toBe(422);

    const bad = await route.POST(req({ sessionId: "x", kind: "text", text: "hola" }));
    expect(bad.status).toBe(422);
  });

  it("rejects an unsupported message kind", async () => {
    const res = await route.POST(req({ sessionId: "demo-session-2", kind: "sticker" }));
    expect(res.status).toBe(422);
  });

  it("handles the voice path with a supplied transcript", async () => {
    const res = await route.POST(
      req({
        sessionId: "demo-session-3",
        kind: "voice",
        transcript: "Se cayó un árbol y bloquea la banqueta.",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcriptionUnavailable).toBeFalsy();
  });

  it("reports its capabilities", async () => {
    const res = await route.GET();
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.live_whatsapp_configured).toBe(false);
    expect(body.transcription_provider).toBeDefined();
  });
});
