import type { ZodType } from "zod";
import type {
  AIClient,
  AIClientRequest,
  AIClientResult,
  AISafeError,
} from "../client";

export interface MockClient extends AIClient {
  calls: AIClientRequest[];
}

export function createMockClient(
  options: {
    response?: unknown;
    responses?: unknown[];
    fail?: AISafeError;
    configured?: boolean;
    model?: string;
    cached?: boolean;
  } = {},
): MockClient {
  const calls: AIClientRequest[] = [];
  const model = options.model ?? "mock-model";
  let index = 0;

  return {
    model,
    configured: options.configured ?? true,
    calls,
    async completeJson<T>(
      request: AIClientRequest,
      schema: ZodType<T>,
    ): Promise<AIClientResult<T>> {
      calls.push(request);
      if (options.fail) {
        return { ok: false, error: options.fail, model, latency_ms: 1 };
      }
      const raw = options.responses ? options.responses[index++] : options.response;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: "schema_validation",
            message: "respuesta simulada inválida",
            retryable: false,
          },
          model,
          latency_ms: 1,
        };
      }
      return {
        ok: true,
        data: parsed.data,
        model,
        latency_ms: 1,
        cached: options.cached ?? false,
      };
    },
  };
}

export const missingKeyError: AISafeError = {
  code: "missing_key",
  message: "El servicio de IA no está configurado.",
  retryable: false,
};

export function daysAgo(days: number, now: string): string {
  return new Date(Date.parse(now) - days * 86_400_000).toISOString();
}
