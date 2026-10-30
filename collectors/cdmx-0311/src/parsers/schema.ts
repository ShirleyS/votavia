import { stripDiacritics } from "../lib/text.js";

export type MappedField =
  | "source_record_id"
  | "reported_date"
  | "reported_time"
  | "closed_date"
  | "updated_date"
  | "status"
  | "category"
  | "subcategory"
  | "request_type"
  | "description"
  | "alcaldia"
  | "colonia"
  | "colonia_registro"
  | "latitude"
  | "longitude"
  | "responsible_agency";

export interface FieldMapping {
  field: MappedField;
  header: string | null;
  index: number | null;
}

export interface CsvSchema {
  headers: string[];
  canonical_headers: string[];
  mappings: Record<MappedField, FieldMapping>;
  missing_required: string[];
  duplicate_headers: string[];
  pii_columns_excluded: string[];
  delimiter: string;
  encoding: string;
}

export interface MappedRow {
  row_number: number;
  values: string[];
  fields: Partial<Record<MappedField, string>>;
  column_count_mismatch: boolean;
  expected_columns: number;
  actual_columns: number;
  row_sha256_input: string;
}

export const FIELD_ALIASES: Record<MappedField, readonly string[]> = {
  source_record_id: [
    "folio",
    "folio_solicitud",
    "id_solicitud",
    "id",
    "numero_solicitud",
    "num_solicitud",
    "solicitud_id",
    "clave_solicitud",
    "id_reporte",
    "reporte_id",
    "ticket",
    "ticket_id",
    "numero_reporte",
  ],
  reported_date: [
    "fecha_solicitud",
    "fecha_de_solicitud",
    "fecha_reporte",
    "fecha_creacion",
    "fecha_alta",
    "fecha_registro",
    "fecha_ingreso",
    "fecha",
  ],
  reported_time: ["hora_solicitud", "hora_reporte", "hora_creacion", "hora_registro", "hora"],
  closed_date: [
    "fecha_concluido",
    "fecha_conclusion",
    "fecha_cierre",
    "fecha_termino",
    "fecha_resolucion",
    "fecha_finalizacion",
    "fecha_atencion",
  ],
  updated_date: ["fecha_actualizacion", "fecha_modificacion", "ultima_actualizacion", "fecha_ultima_actualizacion"],
  status: ["estatus", "estatus_solicitud", "estado", "estado_solicitud", "situacion", "situacion_solicitud"],
  category: ["categoria", "categoria_solicitud", "clasificacion", "tema", "tipo_problema", "tipo_reporte"],
  subcategory: ["subcategoria", "subcategoria_solicitud", "subtipo", "subtema"],
  request_type: ["tipo_solicitud", "tipo_de_solicitud", "tipo"],
  description: ["descripcion", "descripcion_solicitud", "detalle", "detalles", "texto", "texto_solicitud", "contenido"],
  alcaldia: ["alcaldia", "alcaldia_solicitud", "delegacion", "delegacion_solicitud", "demarcacion", "municipio"],
  colonia: ["colonia_datos", "colonia", "colonia_solicitud", "colonia_reporte", "asentamiento"],
  colonia_registro: ["0311_colonia_registro", "colonia_registro", "colonia_311", "colonia_locatel"],
  latitude: ["latitud", "latitude", "lat", "coord_lat", "coordenada_y", "y"],
  longitude: ["longitud", "longitude", "lon", "lng", "coord_lon", "coordenada_x", "x"],
  responsible_agency: [
    "dependencia",
    "dependencia_responsable",
    "unidad_administrativa",
    "area_responsable",
    "secretaria",
    "institucion_responsable",
  ],
};

const PII_HEADER_PATTERNS = [
  /(^|_)nombre($|_)/,
  /(^|_)apellido($|_)/,
  /(^|_)telefono($|_)/,
  /(^|_)(tel|celular|movil)($|_)/,
  /(^|_)(correo|email|e_mail)($|_)/,
  /(^|_)(curp|rfc)($|_)/,
  /(^|_)(domicilio|direccion_particular)($|_)/,
];

export function canonicalizeHeader(header: string): string {
  return stripDiacritics(header.replace(/^\uFEFF/, "").trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function inspectSchema(
  headers: readonly string[],
  options: { delimiter?: string; encoding?: string } = {},
): CsvSchema {
  const canonical = headers.map(canonicalizeHeader);
  const duplicates = findDuplicates(canonical);
  const mappings = {} as Record<MappedField, FieldMapping>;
  for (const field of Object.keys(FIELD_ALIASES) as MappedField[]) {
    const aliases = new Set(FIELD_ALIASES[field]);
    let matchedIndex = canonical.findIndex((header) => header.length > 0 && aliases.has(header));
    if (matchedIndex < 0) matchedIndex = fallbackIndex(field, canonical);
    mappings[field] = {
      field,
      header: matchedIndex >= 0 ? (headers[matchedIndex] ?? null) : null,
      index: matchedIndex >= 0 ? matchedIndex : null,
    };
  }
  const missing: string[] = [];
  if (mappings.alcaldia.index === null) missing.push("alcaldia");
  if (
    mappings.source_record_id.index === null &&
    mappings.reported_date.index === null &&
    mappings.description.index === null
  ) {
    missing.push("record_identity (source_record_id|reported_date|description)");
  }
  return {
    headers: [...headers],
    canonical_headers: canonical,
    mappings,
    missing_required: missing,
    duplicate_headers: duplicates,
    pii_columns_excluded: headers.filter((header) => isPiiHeader(header)),
    delimiter: options.delimiter ?? ",",
    encoding: options.encoding ?? "utf-8",
  };
}

export function mapRow(row: { row_number: number; values: string[] }, schema: CsvSchema): MappedRow {
  const fields: Partial<Record<MappedField, string>> = {};
  for (const field of Object.keys(schema.mappings) as MappedField[]) {
    const mapping = schema.mappings[field];
    if (mapping.index === null) continue;
    const value = row.values[mapping.index];
    if (value !== undefined) fields[field] = value;
  }
  const expected = schema.headers.length;
  return {
    row_number: row.row_number,
    values: row.values,
    fields,
    column_count_mismatch: row.values.length !== expected,
    expected_columns: expected,
    actual_columns: row.values.length,
    row_sha256_input: row.values.join("\u001F"),
  };
}

export function isPiiHeader(header: string): boolean {
  const canonical = canonicalizeHeader(header);
  return PII_HEADER_PATTERNS.some((pattern) => pattern.test(canonical));
}

function fallbackIndex(field: MappedField, canonical: readonly string[]): number {
  if (field === "latitude") return canonical.findIndex((header) => header.endsWith("_latitud") || header === "latitud");
  if (field === "longitude") {
    return canonical.findIndex((header) => header.endsWith("_longitud") || header === "longitud");
  }
  return -1;
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
