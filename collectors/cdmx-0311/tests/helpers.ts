import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { NormalizeContext } from "../src/types.js";
import { inspectSchema, mapRow, type CsvSchema } from "../src/parsers/schema.js";

export function fixturePath(...parts: string[]): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", ...parts);
}

export async function makeTempDir(prefix = "votavia-0311-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export function makeContext(overrides: Partial<NormalizeContext> = {}): NormalizeContext {
  return {
    sourceUrl: "https://datos.cdmx.gob.mx/dataset/0311/resource/test",
    sourceLicense: "CC-BY-4.0-ESP",
    sourceLicenseVerifiedFrom: "ckan_metadata",
    extractionMethod: "ckan_csv",
    collectedAt: "2026-10-30T12:00:00.000Z",
    resourceId: "resource-1",
    resourceName: "Solicitudes *0311 (2024)",
    resourceYear: 2024,
    fileName: "solicitudes.csv",
    rowNumber: 2,
    allAlcaldias: false,
    targetAlcaldia: "Cuauhtémoc",
    includeMissingAlcaldia: false,
    infrastructureOnly: false,
    ...overrides,
  };
}

export function makeSchema(headers: string[]): CsvSchema {
  return inspectSchema(headers);
}

export function makeMappedRow(headers: string[], values: Record<string, string>, rowNumber = 2) {
  const schema = inspectSchema(headers);
  return {
    schema,
    mapped: mapRow({ row_number: rowNumber, values: headers.map((header) => values[header] ?? "") }, schema),
  };
}

export const BASE_HEADERS = [
  "folio",
  "fecha_solicitud",
  "hora_solicitud",
  "tipo_solicitud",
  "categoria",
  "subcategoria",
  "descripcion",
  "fecha_concluido",
  "alcaldia",
  "colonia_datos",
  "0311_colonia_registro",
  "codigo_postal_solicitud",
  "latitud",
  "longitud",
  "dependencia_responsable",
  "estatus",
  "nombre",
  "telefono",
];

export function baseValues(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    folio: "CUH-TEST-0001",
    fecha_solicitud: "15/03/2024",
    hora_solicitud: "09:30",
    tipo_solicitud: "Reporte",
    categoria: "Baches y pavimento",
    subcategoria: "Bache",
    descripcion: "Bache profundo frente a la escuela.",
    fecha_concluido: "20/03/2024",
    alcaldia: "Cuauhtémoc",
    colonia_datos: "Roma Norte",
    "0311_colonia_registro": "Roma Norte",
    codigo_postal_solicitud: "06700",
    latitud: "19.4185",
    longitud: "-99.1613",
    dependencia_responsable: "Secretaría de Obras",
    estatus: "Concluido",
    nombre: "Ana López",
    telefono: "5512345678",
    ...overrides,
  };
}
