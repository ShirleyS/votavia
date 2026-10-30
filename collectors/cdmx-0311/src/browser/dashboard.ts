import path from "node:path";
import { atomicWriteJson, ensureDir } from "../lib/fs.js";
import { CollectorError } from "../errors.js";
import type { Logger } from "../lib/log.js";
import { assertBrowserCollectionApproved, isBrowserCollectionApproved, type CollectorConfig } from "../config.js";

/* Structural Playwright types keep the CSV collector runnable when the
 * optional browser dependency is not installed. */
interface PageLike {
  on(event: string, handler: (...args: any[]) => void): void;
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
  waitForTimeout(ms: number): Promise<void>;
  waitForEvent(event: string, options?: Record<string, unknown>): Promise<any>;
  screenshot(options?: Record<string, unknown>): Promise<unknown>;
  evaluate<T>(fn: (...args: any[]) => T, arg?: unknown): Promise<T>;
  close(): Promise<void>;
}

interface ContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
  setDefaultTimeout?(ms: number): void;
}

interface BrowserLike {
  newContext(options?: Record<string, unknown>): Promise<ContextLike>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium: { launch(options?: Record<string, unknown>): Promise<BrowserLike> };
}

export interface CapturedRequest {
  url: string;
  method: string;
  resource_type: string;
  at: string;
}

export interface CapturedResponse {
  url: string;
  status: number;
  content_type: string | null;
  method: string | null;
  at: string;
}

export interface DashboardControls {
  title: string;
  selects: Array<{ label: string | null; name: string | null; id: string | null; options: Array<{ value: string; text: string }> }>;
  buttons: Array<{ text: string; aria_label: string | null; title: string | null }>;
  export_candidates: Array<{ text: string; href: string | null }>;
  table_count: number;
  iframes: string[];
  body_text_excerpt: string;
}

export interface DashboardDiscoveryResult {
  skipped: boolean;
  reason: string | null;
  url: string;
  final_url: string | null;
  title: string | null;
  http_status: number | null;
  auth_or_captcha_detected: boolean;
  controls: DashboardControls | null;
  requests: CapturedRequest[];
  responses: CapturedResponse[];
  downloads: string[];
  screenshot_path: string | null;
  notes: string[];
}

export interface DashboardDiscoveryOptions {
  url: string;
  outDir: string;
  allowBrowser: boolean;
  allowExport?: boolean;
  timeoutMs?: number;
  userAgent?: string;
  logger: Logger;
}

export async function discoverDashboard(options: DashboardDiscoveryOptions): Promise<DashboardDiscoveryResult> {
  if (!options.allowBrowser) {
    options.logger.info("Browser discovery skipped; pass --allow-browser to inspect the dashboard with Playwright.");
    return emptyDiscovery(options.url, "browser_discovery_disabled");
  }
  await ensureDir(options.outDir);
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const requests: CapturedRequest[] = [];
  const responses: CapturedResponse[] = [];
  const downloads: string[] = [];
  try {
    const context = await browser.newContext({
      userAgent: options.userAgent ?? "VotaVia-0311-collector/0.1 (dashboard discovery)",
      acceptDownloads: Boolean(options.allowExport),
    });
    context.setDefaultTimeout?.(options.timeoutMs ?? 45_000);
    const page = await context.newPage();
    const pending: Array<Promise<unknown>> = [];
    page.on("request", (request: any) => {
      requests.push({
        url: String(request.url()),
        method: String(request.method()),
        resource_type: String(request.resourceType?.() ?? ""),
        at: new Date().toISOString(),
      });
    });
    page.on("response", (response: any) => {
      responses.push({
        url: String(response.url()),
        status: Number(response.status()),
        content_type: response.headers?.()["content-type"] ?? null,
        method: response.request?.()?.method?.() ?? null,
        at: new Date().toISOString(),
      });
    });
    page.on("download", (download: any) => {
      if (!options.allowExport) return;
      const destination = path.join(options.outDir, "downloads", safeDownloadName(download.suggestedFilename?.() ?? `download-${Date.now()}`));
      pending.push(
        ensureDir(path.dirname(destination)).then(() => download.saveAs(destination)).then(() => {
          downloads.push(destination);
        }),
      );
    });

    let httpStatus: number | null = null;
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs ?? 45_000 });
    httpStatus = (response as { status?: () => number } | null)?.status?.() ?? null;
    await page.waitForTimeout(3_000);
    await Promise.allSettled(pending);
    const title = await page.title();
    const finalUrl = page.url();
    const controls = await page.evaluate(collectControls);
    const bodyText = controls.body_text_excerpt;
    const authOrCaptcha = /(iniciar sesi[oó]n|usuario|contrase[nñ]a|captcha|recaptcha|no soy un robot|access denied|forbidden)/i.test(bodyText);
    const screenshotPath = path.join(options.outDir, "dashboard.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.close();
    const result: DashboardDiscoveryResult = {
      skipped: false,
      reason: null,
      url: options.url,
      final_url: finalUrl,
      title,
      http_status: httpStatus,
      auth_or_captcha_detected: authOrCaptcha,
      controls,
      requests: dedupeRequests(requests),
      responses: dedupeResponses(responses),
      downloads,
      screenshot_path: screenshotPath,
      notes: [
        "Discovery records request metadata only; response bodies are not saved unless collection is explicitly configured.",
        "No login, CAPTCHA, rate limit or access restriction is bypassed.",
        "Export buttons are not clicked unless --allow-export is explicit.",
      ],
    };
    await atomicWriteJson(path.join(options.outDir, "discovery.json"), result);
    return result;
  } catch (error) {
    throw new CollectorError("BROWSER_DISCOVERY_FAILED", `Dashboard discovery failed: ${(error as Error).message}`, {
      cause: error,
      details: { url: options.url },
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export interface DashboardCollectionConfig {
  version: 1;
  reviewed_at: string;
  terms_verified: boolean;
  url?: string;
  alcaldia?: { selector?: string; option_text?: string };
  api_patterns?: string[];
  export?: { button_text: string; filename_prefix?: string };
  pagination?: { next_selector?: string; next_text?: string; max_pages?: number };
  payload_paths?: string[];
  notes?: string[];
}

export interface DashboardCollectionResult {
  run_id: string;
  captured_at: string;
  payloads: Array<{ url: string; file: string; records: number }>;
  downloads: string[];
  discovery: DashboardDiscoveryResult;
  warnings: string[];
}

export interface DashboardCollectionOptions {
  config: CollectorConfig;
  configPath: string;
  runId: string;
  outDir: string;
  allowBrowser: boolean;
  allowExport?: boolean;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
}

/** Two-key gate: CLI flag plus explicit environment approval plus verified config. */
export async function collectDashboard(options: DashboardCollectionOptions): Promise<DashboardCollectionResult> {
  if (!options.allowBrowser) {
    throw new CollectorError("BROWSER_COLLECTION_DISABLED", "Pass --allow-browser only after reviewing the dashboard discovery output and access terms.");
  }
  assertBrowserCollectionApproved(options.env ?? process.env);
  if (!isBrowserCollectionApproved(options.env ?? process.env)) {
    throw new CollectorError("BROWSER_COLLECTION_DISABLED", "Browser collection approval is missing.");
  }
  const config = await readDashboardConfig(options.configPath);
  if (config.terms_verified !== true) {
    throw new CollectorError("DASHBOARD_NOT_CONFIGURED", "Dashboard config must set terms_verified=true after a human has reviewed automated access and reuse terms.");
  }
  if (!config.reviewed_at || Number.isNaN(Date.parse(config.reviewed_at))) {
    throw new CollectorError("DASHBOARD_NOT_CONFIGURED", "Dashboard config must record an ISO reviewed_at timestamp.");
  }
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const payloads: Array<{ url: string; file: string; records: number }> = [];
  let payloadIndex = 0;
  const downloads: string[] = [];
  const warnings: string[] = [];
  const requests: CapturedRequest[] = [];
  const responses: CapturedResponse[] = [];
  const payloadDir = path.join(options.outDir, "responses");
  const downloadDir = path.join(options.outDir, "downloads");
  await ensureDir(payloadDir);
  await ensureDir(downloadDir);
  const patterns = (config.api_patterns ?? []).map((pattern) => {
    try {
      return new RegExp(pattern, "i");
    } catch {
      throw new CollectorError("DASHBOARD_NOT_CONFIGURED", `Invalid api_patterns regex: ${pattern}`);
    }
  });

  try {
    const context = await browser.newContext({
      userAgent: options.config.request.userAgent,
      acceptDownloads: Boolean(options.allowExport && config.export),
    });
    context.setDefaultTimeout?.(options.config.browser.timeoutMs);
    const page = await context.newPage();
    const pending: Array<Promise<unknown>> = [];
    page.on("request", (request: any) => {
      requests.push({ url: String(request.url()), method: String(request.method()), resource_type: String(request.resourceType?.() ?? ""), at: new Date().toISOString() });
    });
    page.on("response", (response: any) => {
      responses.push({
        url: String(response.url()),
        status: Number(response.status()),
        content_type: response.headers?.()["content-type"] ?? null,
        method: response.request?.()?.method?.() ?? null,
        at: new Date().toISOString(),
      });
      if (!patterns.some((pattern) => pattern.test(String(response.url())))) return;
      pending.push(
        (async () => {
          const contentType = String(response.headers?.()["content-type"] ?? "");
          if (!/json/i.test(contentType)) return;
          const body = await response.json();
          const records = countPayloadRecords(body, config.payload_paths);
          payloadIndex += 1;
          const file = path.join(payloadDir, `payload-${payloadIndex}.json`);
          await atomicWriteJson(file, body);
          payloads.push({ url: String(response.url()), file, records });
        })(),
      );
    });
    page.on("download", (download: any) => {
      if (!options.allowExport || !config.export) return;
      const prefix = config.export.filename_prefix ?? "dashboard-export";
      const destination = path.join(downloadDir, safeDownloadName(`${prefix}-${download.suggestedFilename?.() ?? Date.now()}`));
      pending.push(
        ensureDir(path.dirname(destination)).then(() => download.saveAs(destination)).then(() => {
          downloads.push(destination);
        }),
      );
    });

    const targetUrl = config.url || options.config.dashboardUrl;
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: options.config.browser.timeoutMs });
    await page.waitForTimeout(2_500);
    if (config.alcaldia?.selector) {
      const selected = await page.evaluate(({ selector, optionText }: { selector: string; optionText?: string }) => {
        const element = document.querySelector(selector) as HTMLSelectElement | null;
        if (!element) return false;
        const option = optionText
          ? [...element.options].find((item) => item.text.toLowerCase().includes(optionText.toLowerCase()))
          : undefined;
        if (option) element.value = option.value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }, { selector: config.alcaldia.selector, optionText: config.alcaldia.option_text });
      if (!selected) warnings.push(`Alcaldía selector not found: ${config.alcaldia.selector}`);
      await page.waitForTimeout(2_000);
    }

    if (config.pagination?.next_selector || config.pagination?.next_text) {
      const maxPages = Math.min(Math.max(config.pagination.max_pages ?? 1, 1), 100);
      for (let pageNumber = 1; pageNumber < maxPages; pageNumber += 1) {
        await page.waitForTimeout(1_000);
        const advanced = await page.evaluate(({ selector, text }: { selector?: string; text?: string }) => {
          const element = selector
            ? (document.querySelector(selector) as HTMLElement | null)
            : [...document.querySelectorAll("button, a")].find((item) => text && item.textContent?.toLowerCase().includes(text.toLowerCase())) as HTMLElement | undefined;
          if (!element || (element as HTMLButtonElement).disabled) return false;
          element.click();
          return true;
        }, { selector: config.pagination.next_selector, text: config.pagination.next_text });
        if (!advanced) break;
      }
    }

    if (options.allowExport && config.export) {
      const downloadPromise = page.waitForEvent("download", { timeout: options.config.browser.timeoutMs }).catch(() => null);
      const clicked = await page.evaluate(({ text }: { text: string }) => {
        const candidates = [...document.querySelectorAll("button, a")] as HTMLElement[];
        const element = candidates.find((item) => item.textContent?.toLowerCase().includes(text.toLowerCase()));
        if (!element) return false;
        element.click();
        return true;
      }, { text: config.export.button_text });
      if (!clicked) warnings.push(`Export control not found: ${config.export.button_text}`);
      await downloadPromise;
    }
    await page.waitForTimeout(1_500);
    await Promise.allSettled(pending);
    const finalUrl = page.url();
    const title = await page.title();
    const controls = await page.evaluate(collectControls);
    const screenshotPath = path.join(options.outDir, "collection.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.close();

    const discovery: DashboardDiscoveryResult = {
      skipped: false,
      reason: null,
      url: targetUrl,
      final_url: finalUrl,
      title,
      http_status: (response as any)?.status?.() ?? null,
      auth_or_captcha_detected: /(captcha|recaptcha|no soy un robot|iniciar sesi[oó]n|access denied)/i.test(controls.body_text_excerpt),
      controls,
      requests: dedupeRequests(requests),
      responses: dedupeResponses(responses),
      downloads,
      screenshot_path: screenshotPath,
      notes: ["Guarded browser collection; review outputs before import.", ...(config.notes ?? [])],
    };
    await atomicWriteJson(path.join(options.outDir, "discovery.json"), discovery);
    return {
      run_id: options.runId,
      captured_at: new Date().toISOString(),
      payloads,
      downloads,
      discovery,
      warnings,
    };
  } catch (error) {
    if (error instanceof CollectorError) throw error;
    throw new CollectorError("BROWSER_DISCOVERY_FAILED", `Dashboard collection failed: ${(error as Error).message}`, {
      cause: error,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function readDashboardConfig(filePath: string): Promise<DashboardCollectionConfig> {
  const { readFile } = await import("node:fs/promises");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new CollectorError("DASHBOARD_NOT_CONFIGURED", `Cannot read dashboard config ${filePath}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CollectorError("DASHBOARD_NOT_CONFIGURED", "Dashboard config must be a JSON object");
  }
  const value = parsed as Record<string, unknown>;
  if (value.version !== 1) {
    throw new CollectorError("DASHBOARD_NOT_CONFIGURED", "Dashboard config version must be 1");
  }
  return value as unknown as DashboardCollectionConfig;
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return (await import("playwright")) as unknown as PlaywrightModule;
  } catch (error) {
    throw new CollectorError("BROWSER_NOT_INSTALLED", "Playwright is not installed. Run `npm install` in collectors/cdmx-0311.", {
      cause: error,
    });
  }
}

function emptyDiscovery(url: string, reason: string): DashboardDiscoveryResult {
  return {
    skipped: true,
    reason,
    url,
    final_url: null,
    title: null,
    http_status: null,
    auth_or_captcha_detected: false,
    controls: null,
    requests: [],
    responses: [],
    downloads: [],
    screenshot_path: null,
    notes: [],
  };
}

function collectControls(): DashboardControls {
  const text = (element: Element | null): string => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
  const selects = [...document.querySelectorAll("select")].slice(0, 50).map((select) => ({
    label: select.getAttribute("aria-label") ?? select.getAttribute("name"),
    name: select.getAttribute("name"),
    id: select.getAttribute("id"),
    options: [...(select as HTMLSelectElement).options].slice(0, 50).map((option) => ({ value: option.value, text: option.text })),
  }));
  const buttons = [...document.querySelectorAll("button, [role=button]")].slice(0, 100).map((button) => ({
    text: text(button),
    aria_label: button.getAttribute("aria-label"),
    title: button.getAttribute("title"),
  }));
  const links = [...document.querySelectorAll("a")];
  const exportCandidates = links
    .filter((link) => /(csv|xlsx?|json|descarg|export)/i.test(`${text(link)} ${link.getAttribute("href") ?? ""}`))
    .slice(0, 50)
    .map((link) => ({ text: text(link), href: link.getAttribute("href") }));
  return {
    title: document.title,
    selects,
    buttons,
    export_candidates: exportCandidates,
    table_count: document.querySelectorAll("table").length,
    iframes: [...document.querySelectorAll("iframe")].slice(0, 30).map((frame) => frame.getAttribute("src") ?? ""),
    body_text_excerpt: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 2_000),
  };
}

function countPayloadRecords(payload: unknown, paths?: string[]): number {
  const candidates = paths && paths.length > 0 ? paths.map((path) => getPath(payload, path)) : [payload, getPath(payload, "result.records"), getPath(payload, "data"), getPath(payload, "records")];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.length;
    if (candidate && typeof candidate === "object") {
      for (const key of ["records", "data", "features", "rows"]) {
        const value = (candidate as Record<string, unknown>)[key];
        if (Array.isArray(value)) return value.length;
      }
    }
  }
  return 0;
}

function getPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function safeDownloadName(value: string): string {
  return value.replace(/[^\w.\-]+/g, "_").slice(0, 180) || "download";
}

function dedupeRequests(values: CapturedRequest[]): CapturedRequest[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.method} ${value.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeResponses(values: CapturedResponse[]): CapturedResponse[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.status} ${value.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
