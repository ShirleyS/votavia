import { openApiDocument } from "@/public-api/openapi";

type Obj = Record<string, unknown>;

const document = openApiDocument() as unknown as Obj;

export function asObj(value: unknown): Obj | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Obj)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function decodePointer(segment: string) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolvePointer(ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  let cursor: unknown = document;
  for (const raw of ref.slice(2).split("/")) {
    const node = asObj(cursor);
    if (!node) return undefined;
    cursor = node[decodePointer(raw)];
  }
  return cursor;
}

function refName(ref: string) {
  const parts = ref.split("/");
  return parts[parts.length - 1] ?? ref;
}

const TYPE_LABELS: Record<string, string> = {
  string: "texto",
  integer: "entero",
  number: "número",
  boolean: "booleano",
  object: "objeto",
  array: "lista",
  null: "nulo",
};

const FORMAT_LABELS: Record<string, string> = {
  "date-time": "fecha ISO",
  date: "fecha",
  uuid: "UUID",
  uri: "URL",
  email: "correo",
};

function enumLabel(values: unknown[]) {
  const shown = values
    .filter((value) => value !== null)
    .slice(0, 6)
    .map((value) => (value === null ? "null" : String(value)))
    .join(", ");
  const suffix = values.length > 6 ? `, … (${values.length})` : "";
  return `uno de: ${shown}${suffix}`;
}

export function typeLabel(schema: unknown, depth = 0): string {
  const node = asObj(schema);
  if (!node) return "cualquiera";
  if (depth > 3) return "…";

  const ref = asString(node.$ref);
  if (ref) return refName(ref);

  const oneOf = asArray(node.oneOf);
  const anyOf = asArray(node.anyOf);
  const union = oneOf.length > 0 ? oneOf : anyOf;
  if (union.length > 0) {
    const parts = union.map((item) => typeLabel(item, depth + 1));
    return Array.from(new Set(parts)).join(" | ");
  }

  const allOf = asArray(node.allOf);
  if (allOf.length > 0) {
    const refs = allOf.map((item) => typeLabel(item, depth + 1)).filter((part) => part !== "objeto");
    return refs.length > 0 ? refs.join(" + ") : "objeto";
  }

  const enums = asArray(node.enum);
  if (enums.length > 0) return enumLabel(enums);

  const type = node.type;
  if (Array.isArray(type)) {
    return type
      .map((item) => (item === "null" ? "nulo" : (TYPE_LABELS[String(item)] ?? String(item))))
      .join(" | ");
  }

  if (type === "array") return `lista<${typeLabel(node.items, depth + 1)}>`;

  const base = TYPE_LABELS[String(type)] ?? (type ? String(type) : "objeto");
  const format = asString(node.format);
  return format ? `${base} · ${FORMAT_LABELS[format] ?? format}` : base;
}

export type FieldRow = {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  deprecated: boolean;
  ref?: string;
};

function mergeFields(schema: unknown, seen: Set<string>): { fields: Map<string, FieldRow>; required: Set<string> } {
  const fields = new Map<string, FieldRow>();
  const required = new Set<string>();
  const node = asObj(schema);
  if (!node) return { fields, required };

  const ref = asString(node.$ref);
  if (ref) {
    const name = refName(ref);
    if (seen.has(name)) return { fields, required };
    const nextSeen = new Set(seen).add(name);
    const target = asObj(resolvePointer(ref));
    if (target) {
      const nested = mergeFields(target, nextSeen);
      for (const [key, value] of nested.fields) fields.set(key, value);
      for (const key of nested.required) required.add(key);
    }
    return { fields, required };
  }

  for (const item of asArray(node.allOf)) {
    const nested = mergeFields(item, seen);
    for (const [key, value] of nested.fields) fields.set(key, value);
    for (const key of nested.required) required.add(key);
  }

  for (const item of [...asArray(node.oneOf), ...asArray(node.anyOf)]) {
    const nested = mergeFields(item, seen);
    for (const [key, value] of nested.fields) {
      if (!fields.has(key)) fields.set(key, value);
    }
    for (const key of nested.required) required.add(key);
  }

  const properties = asObj(node.properties);
  if (properties) {
    for (const [name, raw] of Object.entries(properties)) {
      const property = asObj(raw);
      if (!property) continue;
      const propertyRef = asString(property.$ref);
      fields.set(name, {
        name,
        type: typeLabel(property),
        description:
          asString(property.description) ??
          (propertyRef ? asString(asObj(resolvePointer(propertyRef))?.description) : undefined),
        required: false,
        deprecated: property.deprecated === true,
        ref: propertyRef ? refName(propertyRef) : undefined,
      });
    }
  }

  for (const key of asArray(node.required)) {
    if (typeof key === "string") required.add(key);
  }

  for (const [key, value] of fields) {
    fields.set(key, { ...value, required: required.has(key) });
  }

  return { fields, required };
}

export type EndpointParam = {
  name: string;
  where: string;
  type: string;
  required: boolean;
  description?: string;
  example?: string;
  defaultValue?: string;
};

export type EndpointResponse = {
  status: string;
  description: string;
  mediaTypes: string[];
};

export type EndpointDoc = {
  id: string;
  method: string;
  path: string;
  tag: string;
  operationId?: string;
  summary: string;
  description?: string;
  params: EndpointParam[];
  responses: EndpointResponse[];
  samples: { curl: string; fetch: string; python: string };
};

export type EndpointGroup = {
  tag: string;
  description?: string;
  endpoints: EndpointDoc[];
};

function paramExample(schema: unknown): { example?: string; defaultValue?: string } {
  const node = asObj(schema);
  if (!node) return {};
  const example = node.example ?? asArray(node.examples)[0] ?? node.default;
  return {
    example: example === undefined || example === null ? undefined : String(example),
    defaultValue: node.default === undefined ? undefined : String(node.default),
  };
}

function buildParams(raw: unknown[]): EndpointParam[] {
  return raw.map((entry) => {
    const inline = asObj(entry) ?? {};
    const ref = asString(inline.$ref);
    const node = ref ? (asObj(resolvePointer(ref)) ?? {}) : inline;
    const schema = asObj(node.schema) ?? {};
    const { example, defaultValue } = paramExample(schema);
    return {
      name: asString(node.name) ?? "—",
      where: asString(node.in) ?? "query",
      type: typeLabel(schema),
      required: node.required === true,
      description: asString(node.description),
      example,
      defaultValue,
    };
  });
}

function sampleUrl(base: string, path: string, params: EndpointParam[]) {
  const query = params
    .filter((param) => param.where === "query" && param.example)
    .slice(0, 3)
    .map(
      (param) =>
        `${param.name}=${encodeURIComponent(param.example ?? "").replace(/%2C/gi, ",")}`,
    )
    .join("&");
  return `${base}${path}${query ? `?${query}` : ""}`;
}

function buildSamples(base: string, path: string, params: EndpointParam[], accept: string) {
  const url = sampleUrl(base, path, params);
  const curl = `curl --request GET \\\n  --url "${url}" \\\n  --header "Accept: ${accept}"`;

  const fetch = `const response = await fetch("${url}", {
  headers: { Accept: "${accept}" },
});

if (!response.ok) {
  const problem = await response.json();
  throw new Error(problem.error?.code ?? \`HTTP \${response.status}\`);
}

const payload = await response.json();
console.log(payload.meta);`;

  const python = `import requests

response = requests.get(
    "${url}",
    headers={"Accept": "${accept}"},
    timeout=10,
)
response.raise_for_status()

payload = response.json()
print(payload["meta"])`;

  return { curl, fetch, python };
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildEndpointGroups(base: string): EndpointGroup[] {
  const paths = asObj(document.paths) ?? {};
  const tagDescriptions = new Map<string, string>();
  for (const tag of asArray(document.tags)) {
    const node = asObj(tag);
    const name = asString(node?.name);
    if (name) tagDescriptions.set(name, asString(node?.description) ?? "");
  }

  const groups = new Map<string, EndpointDoc[]>();

  for (const [path, rawPath] of Object.entries(paths)) {
    const pathItem = asObj(rawPath);
    if (!pathItem) continue;
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const operation = asObj(pathItem[method]);
      if (!operation) continue;

      const tag = asString(asArray(operation.tags)[0]) ?? "General";
      const params = buildParams(asArray(operation.parameters));
      const accept = path.endsWith("geojson") ? "application/geo+json" : "application/json";

      const responses: EndpointResponse[] = Object.entries(asObj(operation.responses) ?? {}).map(
        ([status, rawResponse]) => {
          const response = asObj(rawResponse) ?? {};
          return {
            status,
            description: asString(response.description) ?? "",
            mediaTypes: Object.keys(asObj(response.content) ?? {}),
          };
        },
      );

      const endpoint: EndpointDoc = {
        id: slug(asString(operation.operationId) ?? `${method}-${path}`),
        method: method.toUpperCase(),
        path,
        tag,
        operationId: asString(operation.operationId),
        summary: asString(operation.summary) ?? path,
        description: asString(operation.description),
        params,
        responses,
        samples: buildSamples(base, path, params, accept),
      };

      const list = groups.get(tag) ?? [];
      list.push(endpoint);
      groups.set(tag, list);
    }
  }

  const orderedTags = [
    ...asArray(document.tags)
      .map((tag) => asString(asObj(tag)?.name))
      .filter((name): name is string => Boolean(name)),
    ...Array.from(groups.keys()).filter(
      (name) => !asArray(document.tags).some((tag) => asString(asObj(tag)?.name) === name),
    ),
  ];

  return orderedTags
    .filter((tag) => groups.has(tag))
    .map((tag) => ({
      tag,
      description: tagDescriptions.get(tag),
      endpoints: groups.get(tag) ?? [],
    }));
}

const SCHEMA_ORDER = [
  "Meta",
  "PaginationMeta",
  "Case",
  "CaseSummary",
  "CaseDetail",
  "CategoryCatalog",
  "OfficialReportsEnvelope",
  "Statistics",
  "RiskSignal",
  "Health",
  "Provenance",
  "OfficialRecord",
  "ExternalGovernmentStatus",
  "Error",
];

export type SchemaDoc = {
  id: string;
  name: string;
  description?: string;
  type: string;
  fields: FieldRow[];
};

export function buildSchemas(): SchemaDoc[] {
  const components = asObj(document.components) ?? {};
  const registry = asObj(components.schemas) ?? {};

  const names = Object.keys(registry).sort((a, b) => {
    const ai = SCHEMA_ORDER.indexOf(a);
    const bi = SCHEMA_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return names.map((name) => {
    const schema = asObj(registry[name]) ?? {};
    const { fields } = mergeFields(schema, new Set([name]));
    return {
      id: slug(name),
      name,
      description: asString(schema.description),
      type: typeLabel(schema),
      fields: Array.from(fields.values()),
    };
  });
}

export const apiInfo = asObj(document.info) ?? {};
export const apiTags = asArray(document.tags).map((tag) => asObj(tag) ?? {});
export const apiVersion = asString(apiInfo.version) ?? "v1";

export const introParagraphs = (asString(apiInfo.description) ?? "")
  .split("\n\n")
  .map((paragraph) => paragraph.trim())
  .filter(Boolean);

export const dataPolicy = asObj(document["x-data-policy"]) ?? {};
export const canonicalContract = asObj(document["x-canonical-contract"]) ?? {};

export const categoryCatalog = asArray(document["x-categories"]).map((entry) => asObj(entry) ?? {});

export function policyList(key: string): string[] {
  return asArray(dataPolicy[key]).filter((value): value is string => typeof value === "string");
}

export function policyString(key: string): string | undefined {
  return asString(dataPolicy[key]);
}

export function policyNumber(key: string): number | undefined {
  const value = dataPolicy[key];
  return typeof value === "number" ? value : undefined;
}
