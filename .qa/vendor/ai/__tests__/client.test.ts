import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createDeepSeekClient, extractJsonObject } from "../client";

const schema = z.object({ ok: z.boolean() });

function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const baseOptions = {
  apiKey: "sk-test-secret-123",
  baseUrl: "https://api.deepseek.test",
  model: "deepseek-test",
  sleep: async () => {},
  now: () => 1_000,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DeepSeek client", () => {
  it("returns a safe missing_key error without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const client = createDeepSeekClient({ apiKey: "", fetchImpl: fetchImpl as never });
    const result = await client.completeJson({ system: "s", user: "u" }, schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("missing_key");
    expect(result.error.retryable).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("parses fenced JSON and validates it with Zod", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(completion("```json\n{\"ok\":true}\n```")));
    const client = createDeepSeekClient({ ...baseOptions, fetchImpl: fetchImpl as never });
    const result = await client.completeJson({ system: "s", user: "u" }, schema);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.ok).toBe(true);
    expect(result.model).toBe("deepseek-test");
    const init = (fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("deepseek-test");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect((init.headers as Record<string, string>).Authorization).toContain("sk-test-secret-123");
  });

  it("retries bounded 5xx errors and succeeds on the next attempt", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) return jsonResponse({ error: "overloaded" }, 503);
      return jsonResponse(completion('{"ok":true}'));
    });
    const client = createDeepSeekClient({
      ...baseOptions,
      maxAttempts: 3,
      fetchImpl: fetchImpl as never,
    });
    const result = await client.completeJson({ system: "s", user: "u" }, schema);
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry 401 and never leaks the API key in the message", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "invalid key sk-test-secret-123" }, 401),
    );
    const client = createDeepSeekClient({ ...baseOptions, fetchImpl: fetchImpl as never });
    const result = await client.completeJson({ system: "s", user: "u" }, schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("http_error");
    expect(result.error.retryable).toBe(false);
    expect(result.error.message).not.toContain("sk-test-secret-123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps request timeouts to a timeout error", async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    });
    const client = createDeepSeekClient({
      ...baseOptions,
      maxAttempts: 1,
      fetchImpl: fetchImpl as never,
    });
    const result = await client.completeJson({ system: "s", user: "u" }, schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("timeout");
  });

  it("rejects non-JSON content", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(completion("esto no es json")));
    const client = createDeepSeekClient({
      ...baseOptions,
      maxAttempts: 1,
      fetchImpl: fetchImpl as never,
    });
    const result = await client.completeJson({ system: "s", user: "u" }, schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_json");
  });

  it("rejects output that fails schema validation", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(completion('{"ok":"sí"}')));
    const client = createDeepSeekClient({
      ...baseOptions,
      maxAttempts: 1,
      fetchImpl: fetchImpl as never,
    });
    const result = await client.completeJson({ system: "s", user: "u" }, schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("schema_validation");
  });

  it("caches identical successful requests", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(completion('{"ok":true}')));
    const client = createDeepSeekClient({ ...baseOptions, fetchImpl: fetchImpl as never });
    const first = await client.completeJson({ system: "s", user: "u" }, schema);
    const second = await client.completeJson({ system: "s", user: "u" }, schema);
    expect(first.ok && first.cached).toBe(false);
    expect(second.ok && second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized prompts before calling fetch", async () => {
    const fetchImpl = vi.fn();
    const client = createDeepSeekClient({ ...baseOptions, fetchImpl: fetchImpl as never });
    const result = await client.completeJson(
      { system: "x".repeat(50_000), user: "u" },
      schema,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("too_large");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("extractJsonObject", () => {
  it("extracts an object surrounded by prose", () => {
    expect(extractJsonObject('Claro: {"ok":true} listo')).toEqual({ ok: true });
  });

  it("returns null for unparseable content", () => {
    expect(extractJsonObject("sin llaves")).toBeNull();
  });
});
