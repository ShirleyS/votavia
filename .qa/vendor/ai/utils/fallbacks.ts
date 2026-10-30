import type { CaseCategory } from "@/shared/votavia-contract";
import type { Jurisdiction, Severity } from "../types";

export const DEFAULT_DEPARTMENT_BY_CATEGORY: Record<CaseCategory, string> = {
  road_damage: "Alcaldía Cuauhtémoc · Dirección de Obras y Conservación de Vías",
  street_lighting: "Alcaldía Cuauhtémoc · Dirección de Alumbrado Público",
  traffic_signals: "Alcaldía Cuauhtémoc · Coordinación de Semáforos y Señalización Vial",
  sidewalk_accessibility: "Alcaldía Cuauhtémoc · Dirección de Espacio Público y Accesibilidad",
  trees_vegetation: "Alcaldía Cuauhtémoc · Dirección de Áreas Verdes y Arbolado Urbano",
  waste_sanitation: "Alcaldía Cuauhtémoc · Dirección de Limpia y Residuos",
  parks_public_spaces: "Alcaldía Cuauhtémoc · Dirección de Parques y Espacio Público",
  other: "Alcaldía Cuauhtémoc · Mesa de Atención Ciudadana",
};

export const DEFAULT_SPECIALIST_BY_CATEGORY: Record<CaseCategory, string> = {
  road_damage: "Ingeniería civil / pavimentos",
  street_lighting: "Electricista de alumbrado público",
  traffic_signals: "Técnico en semáforos y control vial",
  sidewalk_accessibility: "Especialista en accesibilidad universal",
  trees_vegetation: "Arborista certificado",
  waste_sanitation: "Gestión de residuos urbanos",
  parks_public_spaces: "Mantenimiento de espacio público",
  other: "Evaluación técnica general",
};

export const DEFAULT_TITLE_BY_CATEGORY: Record<CaseCategory, string> = {
  road_damage: "Bache o pavimento dañado",
  street_lighting: "Luminaria con falla",
  traffic_signals: "Semáforo con falla",
  sidewalk_accessibility: "Problema de banqueta o accesibilidad",
  trees_vegetation: "Árbol o vegetación que requiere revisión",
  waste_sanitation: "Acumulación de residuos",
  parks_public_spaces: "Problema en parque o espacio público",
  other: "Reporte de infraestructura urbana",
};

/** Conditional phrasing only: never asserts that a hazard already caused harm. */
const SAFETY_BY_CATEGORY: Partial<Record<CaseCategory, string[]>> = {
  road_damage: [
    "Podría representar un riesgo para peatones, ciclistas o vehículos según el tamaño y ubicación del daño.",
  ],
  street_lighting: [
    "La falta de iluminación podría reducir la visibilidad nocturna en la zona.",
  ],
  traffic_signals: [
    "Una falla del semáforo podría generar confusión en el cruce y aumentar el riesgo vial.",
  ],
  sidewalk_accessibility: [
    "El estado de la banqueta podría dificultar el paso de personas con movilidad reducida.",
    "Podría obstruir rutas accesibles para sillas de ruedas o carriolas.",
  ],
  trees_vegetation: [
    "Ramas o vegetación podrían obstruir la visibilidad o el paso si no se revisan.",
  ],
  waste_sanitation: [
    "La acumulación de residuos podría afectar la salubridad y el paso peatonal.",
  ],
  parks_public_spaces: [
    "El deterioro podría afectar el uso seguro del espacio público.",
  ],
};

const ACCESSIBILITY_BY_CATEGORY: Partial<Record<CaseCategory, string[]>> = {
  sidewalk_accessibility: [
    "Verificar ancho libre de banqueta, rampas y ausencia de obstáculos.",
  ],
  traffic_signals: [
    "Confirmar si existe señalización peatonal audible o táctil en el cruce.",
  ],
  trees_vegetation: [
    "Confirmar que la vegetación no invada la ruta peatonal accesible.",
  ],
};

const ACTION_BY_CATEGORY: Record<CaseCategory, string> = {
  road_damage: "Realizar una inspección en sitio y valorar la reparación del pavimento.",
  street_lighting: "Verificar la luminaria y su circuito eléctrico en sitio.",
  traffic_signals: "Revisar el funcionamiento del semáforo y su controlador en el cruce.",
  sidewalk_accessibility: "Inspeccionar la banqueta y valorar una medida temporal de accesibilidad.",
  trees_vegetation: "Enviar personal de arbolado a evaluar el riesgo y programar poda si corresponde.",
  waste_sanitation: "Coordinar una ruta de limpia y verificar el contenedor en sitio.",
  parks_public_spaces: "Inspeccionar el espacio público y valorar el mantenimiento necesario.",
  other: "Revisar el reporte y determinar el área responsable antes de actuar.",
};

export function defaultSafetyConcerns(category: CaseCategory): string[] {
  return [...(SAFETY_BY_CATEGORY[category] ?? [])];
}

export function defaultAccessibilityConsiderations(category: CaseCategory): string[] {
  return [...(ACCESSIBILITY_BY_CATEGORY[category] ?? [])];
}

export function defaultAction(category: CaseCategory): string {
  return ACTION_BY_CATEGORY[category];
}

export function jurisdictionForCategory(category: CaseCategory): {
  jurisdiction: Jurisdiction;
  note: string;
} {
  if (category === "traffic_signals" || category === "road_damage") {
    return {
      jurisdiction: "municipal",
      note: "La Alcaldía Cuauhtémoc suele ser la autoridad de atención; validar la vía específica.",
    };
  }
  if (category === "other") {
    return {
      jurisdiction: "uncertain",
      note: "No se pudo determinar la jurisdicción con la información disponible.",
    };
  }
  return {
    jurisdiction: "municipal",
    note: "Corresponde a una función municipal de la Alcaldía Cuauhtémoc; confirmar en la revisión.",
  };
}

export function priorityFactorsFor(input: {
  severity: Severity;
  category: CaseCategory;
  sameProblemCount: number;
  hasHistoricalRecords: boolean;
}): string[] {
  const factors: string[] = [];
  if (input.severity === "critical" || input.severity === "high") {
    factors.push(`Severidad estimada: ${input.severity}.`);
  }
  if (input.category === "traffic_signals" || input.category === "sidewalk_accessibility") {
    factors.push("Posible impacto en seguridad vial o accesibilidad.");
  }
  if (input.sameProblemCount > 0) {
    factors.push(`${input.sameProblemCount} reporte(s) posiblemente relacionado(s) en la zona.`);
  }
  if (input.hasHistoricalRecords) {
    factors.push("Existen registros históricos proporcionados para el contexto.");
  }
  if (factors.length === 0) factors.push("Sin factores agravantes identificados con la evidencia disponible.");
  return factors;
}
