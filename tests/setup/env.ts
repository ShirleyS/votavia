import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Each test file gets its own disposable data directory. No production data,
// no shared .data folder, and no Supabase credentials.
process.env.VOTAVIA_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "votavia-qa-"));
(process.env as Record<string, string>).NODE_ENV = "test";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VOTAVIA_GOVERNMENT_EMAILS;
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
