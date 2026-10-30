import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createDeepSeekClient } from "../client";

/**
 * Live provider check. Never runs in the normal suite and never runs in CI
 * without a key:
 *
 *   RUN_LIVE_AI_TESTS=1 DEEPSEEK_API_KEY=... npm test
 */
const enabled =
  process.env.RUN_LIVE_AI_TESTS === "1" && Boolean(process.env.DEEPSEEK_API_KEY);

const schema = z.object({
  category: z.string().min(1),
  title: z.string().min(1),
});

describe.skipIf(!enabled)("DeepSeek live integration", () => {
  it(
    "returns JSON that satisfies the schema",
    async () => {
      const client = createDeepSeekClient({ maxAttempts: 1, timeoutMs: 30_000 });
      const result = await client.completeJson(
        {
          system:
            'Clasifica un reporte de infraestructura urbana. Responde solo JSON: {"category":"<categoría>","title":"<título breve>"}.',
          user: "El semáforo de la esquina no sirve y ayer casi atropellan a una señora.",
          cacheable: false,
          maxTokens: 120,
        },
        schema,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.category.length).toBeGreaterThan(0);
      expect(result.data.title.length).toBeGreaterThan(0);
      expect(result.model).toBeTruthy();
    },
    45_000,
  );
});
