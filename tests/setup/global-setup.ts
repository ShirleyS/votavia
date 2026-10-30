import { readdirSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export default function teardown() {
  const root = os.tmpdir();
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (entry.startsWith("votavia-qa-")) {
      try {
        rmSync(path.join(root, entry), { recursive: true, force: true });
      } catch {
        // Best effort cleanup only.
      }
    }
  }
}
