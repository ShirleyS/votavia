import { normalizeKey, parseDecimal, stripDiacritics, titleCaseEs } from "../lib/text.js";

export interface NormalizedAlcaldia {
  original: string | null;
  canonical: string | null;
  key: string | null;
}

const ALCALDIAS = [
  "Álvaro Obregón",
  "Azcapotzalco",
  "Benito Juárez",
  "Coyoacán",
  "Cuajimalpa de Morelos",
  "Cuauhtémoc",
  "Gustavo A. Madero",
  "Iztacalco",
  "Iztapalapa",
  "La Magdalena Contreras",
  "Miguel Hidalgo",
  "Milpa Alta",
  "Tláhuac",
  "Tlalpan",
  "Venustiano Carranza",
  "Xochimilco",
] as const;

const ALCALDIA_BY_KEY = new Map<string, string>();
for (const name of ALCALDIAS) {
  ALCALDIA_BY_KEY.set(normalizeKey(name), name);
}
ALCALDIA_BY_KEY.set("CUAJIMALPA", "Cuajimalpa de Morelos");
ALCALDIA_BY_KEY.set("MAGDALENA CONTRERAS", "La Magdalena Contreras");
ALCALDIA_BY_KEY.set("GUSTAVO A MADERO", "Gustavo A. Madero");
ALCALDIA_BY_KEY.set("GAM", "Gustavo A. Madero");

export function normalizeAlcaldia(value: unknown): NormalizedAlcaldia {
  const original = typeof value === "string" ? value.trim() : value == null ? null : String(value).trim();
  if (!original) return { original: null, canonical: null, key: null };
  let key = normalizeKey(original)
    .replace(/^(ALCALDIA|DELEGACION)\s+/, "")
    .replace(/\s+(CDMX|CIUDAD DE MEXICO)$/, "")
    .trim();
  const canonical = ALCALDIA_BY_KEY.get(key) ?? null;
  if (!canonical && key.length > 0) {
    return { original, canonical: titleCaseEs(original), key };
  }
  return { original, canonical, key: canonical ? normalizeKey(canonical) : key };
}

export function matchesAlcaldia(value: unknown, expected: string): boolean {
  const actual = normalizeAlcaldia(value);
  const target = normalizeAlcaldia(expected);
  return Boolean(actual.key && target.key && actual.key === target.key);
}

export interface NormalizedCoordinates {
  latitude: number | null;
  longitude: number | null;
  flags: string[];
}

export function normalizeCoordinates(latValue: unknown, lonValue: unknown): NormalizedCoordinates {
  const flags: string[] = [];
  let latitude = parseDecimal(latValue);
  let longitude = parseDecimal(lonValue);
  if (latitude === null && longitude === null) {
    return { latitude: null, longitude: null, flags: ["missing_coordinates"] };
  }
  if (latitude === null || longitude === null) {
    return { latitude: null, longitude: null, flags: ["incomplete_coordinates"] };
  }

  // Some releases swap X/Y. Correct only the unmistakable CDMX case and say so.
  if (Math.abs(latitude) > 90 && Math.abs(longitude) <= 90) {
    [latitude, longitude] = [longitude, latitude];
    flags.push("coordinates_swapped");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { latitude: null, longitude: null, flags: ["invalid_coordinates", ...flags] };
  }
  if (!isWithinCdmxBbox(latitude, longitude)) {
    flags.push("coordinates_outside_cdmx_bbox");
  } else if (!isWithinCuauhtemocBbox(latitude, longitude)) {
    flags.push("coordinates_outside_cuauhtemoc_bbox");
  }
  if (latitude === 0 && longitude === 0) {
    return { latitude: null, longitude: null, flags: ["invalid_coordinates"] };
  }
  return { latitude: round6(latitude), longitude: round6(longitude), flags };
}

/** Approximate CDMX bounding box; used only for quality flags, never filtering. */
export function isWithinCdmxBbox(latitude: number, longitude: number): boolean {
  return latitude >= 19.0 && latitude <= 19.6 && longitude >= -99.4 && longitude <= -98.9;
}

/**
 * Conservative Cuauhtémoc envelope. A point outside it is flagged, not
 * discarded: official coordinates can be coarse or geocoded to a street.
 */
export function isWithinCuauhtemocBbox(latitude: number, longitude: number): boolean {
  return latitude >= 19.39 && latitude <= 19.47 && longitude >= -99.19 && longitude <= -99.12;
}

export function normalizeColonia(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || stripDiacritics(text).toLowerCase() === "sin dato") return null;
  return text.slice(0, 160);
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
