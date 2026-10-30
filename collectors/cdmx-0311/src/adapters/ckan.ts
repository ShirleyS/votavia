import { CollectorError, HttpError } from "../errors.js";
import type { HttpClient } from "../lib/http.js";
import { safeFilename } from "../lib/fs.js";
import type { DatasetDescriptor, ResourceDescriptor } from "../types.js";

export interface CkanFetchOptions {
  client: HttpClient;
  baseUrl: string;
  apiPath?: string;
  datasetId: string;
  datasetUuid: string;
}

export interface CkanSnapshot {
  dataset: DatasetDescriptor;
  raw: unknown;
  source_url: string;
  fetched_at: string;
  retrieval: "api" | "html_fallback";
  warnings: string[];
}

export async function fetchCkanDataset(options: CkanFetchOptions): Promise<CkanSnapshot> {
  const apiPath = options.apiPath ?? "/api/3/action";
  const warnings: string[] = [];
  const ids = unique([options.datasetId, options.datasetUuid]);
  for (const id of ids) {
    const url = `${options.baseUrl}${apiPath}/package_show?id=${encodeURIComponent(id)}`;
    try {
      const { value } = await options.client.fetchJson<unknown>(url);
      const dataset = parseCkanPackage(value, { baseUrl: options.baseUrl, datasetName: options.datasetId });
      return {
        dataset,
        raw: value,
        source_url: url,
        fetched_at: new Date().toISOString(),
        retrieval: "api",
        warnings,
      };
    } catch (error) {
      warnings.push(`package_show(${id}) failed: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof HttpError && error.status !== 404 && error.status !== 400) {
        continue;
      }
    }
  }

  const pageUrl = datasetPageUrl(options.baseUrl, options.datasetId);
  const response = await options.client.fetch(pageUrl, { headers: { accept: "text/html" } });
  const html = await response.text();
  const dataset = parseCkanHtml(html, { baseUrl: options.baseUrl, datasetName: options.datasetId });
  warnings.push("CKAN API unavailable; parsed the dataset HTML page. Resource download URLs may need manual confirmation.");
  return {
    dataset,
    raw: { html_length: html.length },
    source_url: pageUrl,
    fetched_at: new Date().toISOString(),
    retrieval: "html_fallback",
    warnings,
  };
}

export interface CkanPackageOptions {
  baseUrl: string;
  datasetName?: string;
}

export function parseCkanPackage(payload: unknown, options: CkanPackageOptions): DatasetDescriptor {
  const envelope = asRecord(payload);
  if (envelope.success === false) {
    throw new CollectorError("CKAN_INVALID_RESPONSE", "CKAN returned success=false", {
      details: { error: envelope.error },
    });
  }
  const result = asRecord(envelope.result ?? payload);
  const name = stringValue(result.name) ?? options.datasetName ?? "0311";
  const id = stringValue(result.id) ?? options.datasetName ?? "0311";
  const organization = asRecord(result.organization);
  const rawResources = Array.isArray(result.resources) ? result.resources : [];
  if (rawResources.length === 0) {
    throw new CollectorError("CKAN_NO_RESOURCES", "CKAN dataset has no resources", { details: { dataset: name } });
  }
  const resources = rawResources
    .map((item) => parseResource(asRecord(item), { baseUrl: options.baseUrl, datasetName: name }))
    .filter((resource): resource is ResourceDescriptor => resource !== null);
  return {
    id,
    name,
    title: stringValue(result.title) ?? "Solicitudes *0311",
    organization: stringValue(organization.title) ?? stringValue(organization.name),
    license_id: stringValue(result.license_id),
    license_title: stringValue(result.license_title),
    license_url: stringValue(result.license_url),
    metadata_modified: stringValue(result.metadata_modified),
    resources,
    attribution: "Gobierno de la Ciudad de México — Portal de Datos Abiertos CDMX, conjunto «Solicitudes *0311».",
  };
}

export function parseResource(
  raw: Record<string, unknown>,
  options: { baseUrl: string; datasetName: string },
): ResourceDescriptor | null {
  const id = stringValue(raw.id);
  if (!id) return null;
  const name = stringValue(raw.name) ?? stringValue(raw.title) ?? `Solicitudes *0311 (${stringValue(raw.year) ?? "sin año"})`;
  const description = stringValue(raw.description) ?? stringValue(raw.notes);
  const url = stringValue(raw.url);
  const format = (stringValue(raw.format) ?? inferFormat(name, url) ?? "").toUpperCase();
  const pageUrl = resourcePageUrl(options.baseUrl, options.datasetName, id);
  const downloadUrl = deriveDownloadUrl({
    baseUrl: options.baseUrl,
    datasetName: options.datasetName,
    resourceId: id,
    resourceName: name,
    format,
    url,
  });
  const yearMatch =
    extractYear(name) ??
    extractYear(description) ??
    extractYear(url) ??
    extractYear(stringValue(raw.last_modified)) ??
    extractYear(stringValue(raw.created));
  const finalYear = yearMatch?.year ?? null;
  return {
    id,
    name,
    format,
    page_url: pageUrl,
    download_url: downloadUrl,
    year: finalYear,
    year_source: yearMatch?.source ?? "unknown",
    datastore_active: Boolean(raw.datastore_active),
    created: stringValue(raw.created),
    last_modified: stringValue(raw.last_modified) ?? stringValue(raw.metadata_modified),
    size_bytes: numericValue(raw.size),
    description,
    alternatives: [],
  };
}

export function parseCkanHtml(html: string, options: { baseUrl: string; datasetName: string }): DatasetDescriptor {
  const resourceMap = new Map<string, ResourceDescriptor>();
  const pattern = /<a\b[^>]*href=["']([^"']*\/dataset\/[^"']*\/resource\/([0-9a-fA-F-]{36})[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const href = decodeHtml(match[1] ?? "");
    const id = match[2] ?? "";
    const text = stripTags(decodeHtml(match[3] ?? "")).replace(/\s+/g, " ").trim();
    if (!id || resourceMap.has(id)) continue;
    const name = text && /0311/i.test(text) ? text : `Solicitudes *0311 (${extractYear(href)?.year ?? "sin año"})`;
    const yearMatch = extractYear(name) ?? extractYear(href);
    resourceMap.set(id, {
      id,
      name,
      format: inferFormat(name, href)?.toUpperCase() ?? "CSV",
      page_url: absoluteUrl(href, options.baseUrl),
      download_url: deriveDownloadUrl({
        baseUrl: options.baseUrl,
        datasetName: options.datasetName,
        resourceId: id,
        resourceName: name,
        format: inferFormat(name, href)?.toUpperCase() ?? "CSV",
        url: null,
      }),
      year: yearMatch?.year ?? null,
      year_source: yearMatch?.source ?? "unknown",
      datastore_active: false,
      created: null,
      last_modified: null,
      size_bytes: null,
      description: null,
      alternatives: [],
    });
  }
  if (resourceMap.size === 0) {
    throw new CollectorError("CKAN_NO_RESOURCES", "Could not find 0311 resource links in the dataset HTML", {
      details: { dataset: options.datasetName },
    });
  }
  const license = /(CC[- ]BY[- ]4\.0[- ]ESP|CC-BY-4\.0-ESP)/i.exec(html)?.[1] ?? null;
  return {
    id: options.datasetName,
    name: options.datasetName,
    title: stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "Solicitudes *0311"),
    organization: "Agencia Digital de Innovación Pública (ADIP)",
    license_id: license,
    license_title: license ? "Creative Commons Attribution 4.0 España" : null,
    license_url: null,
    metadata_modified: null,
    resources: [...resourceMap.values()],
    attribution: "Gobierno de la Ciudad de México — Portal de Datos Abiertos CDMX, conjunto «Solicitudes *0311».",
  };
}

export interface SelectResourcesOptions {
  years?: readonly number[];
  formats?: readonly string[];
}

/**
 * Selects one canonical resource per year, retaining alternate CKAN resource
 * IDs in `alternatives` so a reviewer can see what was not imported.
 */
export function selectResources(dataset: DatasetDescriptor, options: SelectResourcesOptions = {}): ResourceDescriptor[] {
  const allowed = new Set((options.formats ?? ["CSV", "TSV", "JSON"]).map((format) => format.toUpperCase()));
  const candidates = dataset.resources.filter((resource) => {
    if (!resource.format || allowed.has(resource.format)) return true;
    return /\b(csv|tsv|json)\b/i.test(resource.name);
  });
  if (candidates.length === 0) {
    throw new CollectorError("CKAN_NO_RESOURCES", "No CSV/TSV/JSON resources found in dataset", {
      details: { available: dataset.resources.map((resource) => ({ id: resource.id, format: resource.format })) },
    });
  }
  const groups = new Map<string, ResourceDescriptor[]>();
  for (const resource of candidates) {
    if (
      options.years &&
      options.years.length > 0 &&
      (resource.year === null || !options.years.includes(resource.year))
    ) {
      continue;
    }
    const key = resource.year === null ? `unknown:${resource.id}` : String(resource.year);
    const list = groups.get(key) ?? [];
    list.push(resource);
    groups.set(key, list);
  }
  const selected: ResourceDescriptor[] = [];
  for (const list of groups.values()) {
    const ranked = [...list].sort((a, b) => scoreResource(b) - scoreResource(a));
    const [best, ...rest] = ranked;
    if (!best) continue;
    selected.push({
      ...best,
      alternatives: rest.map((resource) => ({ id: resource.id, name: resource.name, page_url: resource.page_url })),
    });
  }
  selected.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.name.localeCompare(b.name));
  return selected;
}

export interface DatastoreBatch {
  offset: number;
  total: number;
  records: Array<Record<string, unknown>>;
  fields: Array<{ id: string; type: string }>;
}

export interface DatastoreOptions {
  client: HttpClient;
  baseUrl: string;
  apiPath?: string;
  resourceId: string;
  pageSize?: number;
  maxRecords?: number | null;
  allowPartial?: boolean;
  filters?: Record<string, string>;
}

export async function* fetchDatastoreBatches(options: DatastoreOptions): AsyncGenerator<DatastoreBatch> {
  const apiPath = options.apiPath ?? "/api/3/action";
  const pageSize = Math.min(Math.max(options.pageSize ?? 1_000, 1), 32_000);
  let offset = 0;
  let total: number | null = null;
  for (;;) {
    const params = new URLSearchParams({
      resource_id: options.resourceId,
      limit: String(pageSize),
      offset: String(offset),
    });
    if (options.filters) params.set("filters", JSON.stringify(options.filters));
    const url = `${options.baseUrl}${apiPath}/datastore_search?${params.toString()}`;
    const { value } = await options.client.fetchJson<unknown>(url);
    const envelope = asRecord(value);
    if (envelope.success === false) {
      throw new CollectorError("CKAN_INVALID_RESPONSE", "CKAN datastore_search returned success=false", {
        details: { resourceId: options.resourceId },
      });
    }
    const result = asRecord(envelope.result);
    const records = Array.isArray(result.records) ? result.records.map((record) => asRecord(record)) : [];
    const fields = Array.isArray(result.fields)
      ? result.fields.map((field) => ({ id: String(asRecord(field).id ?? ""), type: String(asRecord(field).type ?? "") })).filter((field) => field.id)
      : [];
    total = numericValue(result.total) ?? total ?? records.length;
    if (options.maxRecords && total > options.maxRecords && !options.allowPartial) {
      throw new CollectorError(
        "EXPORT_LIMIT",
        `Datastore resource ${options.resourceId} reports ${total} rows, above the configured maximum of ${options.maxRecords}. Re-run with --allow-partial to ingest a bounded sample.`,
        { details: { resourceId: options.resourceId, total, maxRecords: options.maxRecords } },
      );
    }
    if (records.length === 0) {
      break;
    }
    yield { offset, total, records, fields };
    offset += records.length;
    if (offset >= total) break;
    if (offset >= pageSize * 100_000) break;
  }
}

export function resourcePageUrl(baseUrl: string, datasetName: string, resourceId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/dataset/${encodeURIComponent(datasetName)}/resource/${encodeURIComponent(resourceId)}`;
}

export function datasetPageUrl(baseUrl: string, datasetName: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/dataset/${encodeURIComponent(datasetName)}`;
}

export function deriveDownloadUrl(input: {
  baseUrl: string;
  datasetName: string;
  resourceId: string;
  resourceName: string;
  format: string;
  url: string | null;
}): string | null {
  if (input.url) {
    const resolved = absoluteUrl(input.url, input.baseUrl);
    if (looksLikeFile(resolved) || /\/download\//i.test(resolved) || /^https?:\/\/archivo\./i.test(resolved)) {
      return resolved;
    }
  }
  const extension = formatExtension(input.format, input.resourceName);
  if (!extension) return null;
  return `${input.baseUrl.replace(/\/+$/, "")}/dataset/${encodeURIComponent(input.datasetName)}/resource/${encodeURIComponent(input.resourceId)}/download/${encodeURIComponent(safeFilename(`${input.resourceName}.${extension}`))}`;
}

function scoreResource(resource: ResourceDescriptor): number {
  let score = 0;
  if (resource.download_url) score += 20;
  if (resource.datastore_active) score += 10;
  if (resource.format === "CSV") score += 5;
  if (resource.format === "TSV" || resource.format === "JSON") score += 3;
  if (resource.size_bytes !== null) score += 2;
  if (resource.name.match(/solicitudes\s*\*?0311\s*\(?\d{4}\)?/i)) score += 4;
  if (resource.last_modified) score += 1;
  return score;
}

function looksLikeFile(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(csv|tsv|json|zip|gz|xlsx)(?:$|\?)/.test(pathname);
  } catch {
    return /\.(csv|tsv|json|zip|gz|xlsx)(?:$|\?)/i.test(url);
  }
}

function formatExtension(format: string, name: string): string | null {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".csv")) return null;
  switch (format.toUpperCase()) {
    case "CSV":
      return "csv";
    case "TSV":
      return "tsv";
    case "JSON":
      return "json";
    default:
      return /\.(csv|tsv|json|zip|gz)$/i.test(lowerName) ? null : null;
  }
}

function inferFormat(name: string, url: string | null): string | null {
  const match = /\.(csv|tsv|json|xml|zip|xlsx)(?:$|\?)/i.exec(url ?? "") ?? /\.(csv|tsv|json|xml|zip|xlsx)$/i.exec(name);
  return match?.[1]?.toUpperCase() ?? null;
}

function extractYear(value: string | null | undefined): { year: number; source: ResourceDescriptor["year_source"] } | null {
  if (!value) return null;
  const match = /(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return null;
  const source: ResourceDescriptor["year_source"] = /\((\d{4})\)/.test(value) ? "name" : /(?:19|20)\d{2}/.test(value) ? "description" : "unknown";
  return { year, source };
}

function absoluteUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
