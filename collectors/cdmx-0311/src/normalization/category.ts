import type { CaseCategory, CategoryNormalization } from "../types.js";
import { normalizeKey } from "../lib/text.js";

export type CollectorCategory =
  | "road_damage"
  | "street_lighting"
  | "traffic_signals"
  | "sidewalk_accessibility"
  | "trees_vegetation"
  | "waste_sanitation"
  | "parks_public_spaces"
  | "water_drainage"
  | "public_space_deterioration"
  | "traffic_accident"
  | "noise_environment"
  | "animal_services"
  | "social_services"
  | "other";

export interface CategoryResult {
  original_category: string | null;
  original_subcategory: string | null;
  category_source_field: string | null;
  normalized_category: CaseCategory | null;
  collector_category: CollectorCategory | null;
  normalization: CategoryNormalization;
  is_infrastructure_related: boolean | null;
}

interface Rule {
  category: CollectorCategory;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    category: "traffic_accident",
    patterns: [
      /\bACCIDENTE\b/,
      /\bCHOQUE\b/,
      /\bCOLISION\b/,
      /\bATROPELLO\b/,
      /\bVOLCADURA\b/,
      /\bPERCANCE VIAL\b/,
    ],
  },
  {
    category: "water_drainage",
    patterns: [
      /\bFUGA\b/,
      /\bFUGA DE AGUA\b/,
      /\bAGUA POTABLE\b/,
      /\bDRENAJE\b/,
      /\bALCANTARILLADO\b/,
      /\bINUNDACION\b/,
      /\bENCHARCAMIENTO\b/,
      /\bCOLADERA\b/,
      /\bSUMIDERO\b/,
      /\bTUBERIA\b/,
      /\bPIPA DE AGUA\b/,
      /\bDESAZOLVE\b/,
    ],
  },
  {
    category: "street_lighting",
    patterns: [
      /\bLUMINARIA\b/,
      /\bALUMBRADO\b/,
      /\bLAMPARA\b/,
      /\bPOSTE DE LUZ\b/,
      /\bLUZ FUNDIDA\b/,
      /\bFOCO\b/,
      /\bFAROLA\b/,
      /\bILUMINACION\b/,
    ],
  },
  {
    category: "traffic_signals",
    patterns: [
      /\bSEMAFORO\b/,
      /\bSENALIZACION\b/,
      /\bSENAL VIAL\b/,
      /\bBALIZAMIENTO\b/,
      /\bTOPES?\b/,
      /\bNOMENCLATURA\b/,
      /\bSENALAMIENTO\b/,
      /\bDISCO DE ALTO\b/,
    ],
  },
  {
    category: "road_damage",
    patterns: [
      /\bBACHE\b/,
      /\bBACHES\b/,
      /\bPAVIMENTO\b/,
      /\bCARPETA ASFALTICA\b/,
      /\bHOYO\b/,
      /\bHUNDIMIENTO\b/,
      /\bGRIETA\b/,
      /\bARROYO VEHICULAR\b/,
      /\bRODAMIENTO\b/,
      /\bREENCARPETADO\b/,
    ],
  },
  {
    category: "sidewalk_accessibility",
    patterns: [
      /\bBANQUETA\b/,
      /\bRAMPAS?\b/,
      /\bACCESIBILIDAD\b/,
      /\bGUARNICION\b/,
      /\bCRUCE PEATONAL\b/,
      /\bPASO PEATONAL\b/,
      /\bANDADOR\b/,
      /\bSILLA DE RUEDAS\b/,
      /\bINVIDENTE\b/,
      /\bDISCAPACIDAD\b/,
    ],
  },
  {
    category: "trees_vegetation",
    patterns: [
      /\bARBOL\b/,
      /\bARBOLES\b/,
      /\bPODA\b/,
      /\bTALA\b/,
      /\bVEGETACION\b/,
      /\bRAMA\b/,
      /\bRAMAS\b/,
      /\bJARDIN\b/,
      /\bAREA VERDE\b/,
      /\bARBUSTO\b/,
      /\bPALMERA\b/,
    ],
  },
  {
    category: "waste_sanitation",
    patterns: [
      /\bBASURA\b/,
      /\bRESIDUOS?\b/,
      /\bESCOMBRO\b/,
      /\bLIMPIEZA\b/,
      /\bCONTENEDOR\b/,
      /\bRECOLECCION\b/,
      /\bBARRIDO\b/,
      /\bTIRADERO\b/,
      /\bDESECHO\b/,
      /\bCASCAJO\b/,
      /\bCHATARRA\b/,
    ],
  },
  {
    category: "parks_public_spaces",
    patterns: [
      /\bPARQUE\b/,
      /\bPLAZA\b/,
      /\bJARDIN PUBLICO\b/,
      /\bMOBILIARIO URBANO\b/,
      /\bJUEGO INFANTIL\b/,
      /\bFUENTE\b/,
      /\bAREA RECREATIVA\b/,
      /\bESPACIO PUBLICO\b/,
      /\bDEPORTIVO\b/,
    ],
  },
  {
    category: "public_space_deterioration",
    patterns: [
      /\bGRAFITI\b/,
      /\bPINTURA\b/,
      /\bDETERIORO\b/,
      /\bBARDA\b/,
      /\bFACHADA\b/,
      /\bMONUMENTO\b/,
      /\bPOSTE\b/,
    ],
  },
  {
    category: "noise_environment",
    patterns: [/\bRUIDO\b/, /\bMUSICA\b/, /\bANTRO\b/, /\bCONTAMINACION\b/, /\bHUMO\b/, /\bOLORES\b/],
  },
  {
    category: "animal_services",
    patterns: [/\bANIMAL\b/, /\bPERRO\b/, /\bGATO\b/, /\bFAUNA\b/, /\bMALTRATO ANIMAL\b/, /\bPLAGA\b/, /\bRATA\b/, /\bMOSCO\b/],
  },
  {
    category: "social_services",
    patterns: [
      /\bAPOYO SOCIAL\b/,
      /\bTRAMITE\b/,
      /\bLICENCIA\b/,
      /\bEMPLEO\b/,
      /\bSALUD\b/,
      /\bEDUCACION\b/,
      /\bDENUNCIA\b/,
      /\bVIOLENCIA\b/,
      /\bPENSION\b/,
    ],
  },
];

const APP_CATEGORY_ALIASES: Record<string, CaseCategory> = {
  "ROAD DAMAGE": "road_damage",
  BACHES: "road_damage",
  "BACHES Y PAVIMENTO": "road_damage",
  PAVIMENTO: "road_damage",
  "STREET LIGHTING": "street_lighting",
  LUMINARIAS: "street_lighting",
  ALUMBRADO: "street_lighting",
  "TRAFFIC SIGNALS": "traffic_signals",
  SEMAFOROS: "traffic_signals",
  SENALIZACION: "traffic_signals",
  "SIDEWALK ACCESSIBILITY": "sidewalk_accessibility",
  BANQUETAS: "sidewalk_accessibility",
  "TREES VEGETATION": "trees_vegetation",
  ARBOLES: "trees_vegetation",
  "WASTE SANITATION": "waste_sanitation",
  LIMPIEZA: "waste_sanitation",
  "PARKS PUBLIC SPACES": "parks_public_spaces",
  PARQUES: "parks_public_spaces",
  OTHER: "other",
  OTRO: "other",
  OTROS: "other",
};

const INFRASTRUCTURE = new Set<CollectorCategory>([
  "road_damage",
  "street_lighting",
  "traffic_signals",
  "sidewalk_accessibility",
  "trees_vegetation",
  "waste_sanitation",
  "parks_public_spaces",
  "water_drainage",
  "public_space_deterioration",
]);

export function normalizeCategory(input: {
  category?: string | null;
  subcategory?: string | null;
  requestType?: string | null;
  description?: string | null;
}): CategoryResult {
  const originalCategory = clean(input.category);
  const originalSubcategory = clean(input.subcategory);
  const requestType = clean(input.requestType);
  const description = clean(input.description);

  if (originalCategory) {
    const explicit = APP_CATEGORY_ALIASES[normalizeKey(originalCategory)];
    if (explicit) {
      return result({
        originalCategory,
        originalSubcategory,
        sourceField: "categoria",
        normalized: explicit,
        collector: explicit,
        method: "explicit",
        confidence: 0.95,
        note: null,
      });
    }
  }

  const labelText = [originalCategory, originalSubcategory, requestType].filter(Boolean).join(" ");
  const labelMatch = firstMatch(labelText);
  if (labelMatch) {
    return result({
      originalCategory,
      originalSubcategory,
      sourceField: originalCategory ? "categoria" : originalSubcategory ? "subcategoria" : "tipo_solicitud",
      normalized: toAppCategory(labelMatch),
      collector: labelMatch,
      method: "alias",
      confidence: 0.8,
      note: `Mapped from government label "${labelText}".`,
    });
  }

  const descriptionMatch = firstMatch(description ?? "");
  if (descriptionMatch) {
    return result({
      originalCategory,
      originalSubcategory,
      sourceField: originalCategory ? "categoria" : originalSubcategory ? "subcategoria" : "descripcion",
      normalized: toAppCategory(descriptionMatch),
      collector: descriptionMatch,
      method: "keyword",
      confidence: 0.5,
      note: "Inferred from free-text description; government label preserved verbatim.",
    });
  }

  if (originalCategory || originalSubcategory) {
    return result({
      originalCategory,
      originalSubcategory,
      sourceField: originalCategory ? "categoria" : "subcategoria",
      normalized: "other",
      collector: "other",
      method: "none",
      confidence: 0,
      note: "Government label has no deterministic mapping; kept as original_category.",
    });
  }

  if (description) {
    return result({
      originalCategory: null,
      originalSubcategory: null,
      sourceField: "descripcion",
      normalized: "other",
      collector: "other",
      method: "none",
      confidence: 0,
      note: "No government category and no keyword rule matched.",
    });
  }

  return result({
    originalCategory: null,
    originalSubcategory: null,
    sourceField: null,
    normalized: null,
    collector: null,
    method: "none",
    confidence: 0,
    note: "No category information in source row.",
  });
}

export function collectorCategoryToApp(category: CollectorCategory): CaseCategory {
  switch (category) {
    case "water_drainage":
    case "public_space_deterioration":
    case "traffic_accident":
    case "noise_environment":
    case "animal_services":
    case "social_services":
      return "other";
    default:
      return category;
  }
}

export function isInfrastructureCategory(category: CollectorCategory | null): boolean | null {
  if (!category) return null;
  if (category === "traffic_accident") return false;
  if (category === "other") return null;
  return INFRASTRUCTURE.has(category);
}

function firstMatch(text: string): CollectorCategory | null {
  if (!text) return null;
  const key = normalizeKey(text);
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(key))) return rule.category;
  }
  return null;
}

function toAppCategory(category: CollectorCategory): CaseCategory {
  return collectorCategoryToApp(category);
}

function result(input: {
  originalCategory: string | null;
  originalSubcategory: string | null;
  sourceField: string | null;
  normalized: CaseCategory | null;
  collector: CollectorCategory | null;
  method: CategoryNormalization["method"];
  confidence: number;
  note: string | null;
}): CategoryResult {
  return {
    original_category: input.originalCategory,
    original_subcategory: input.originalSubcategory,
    category_source_field: input.sourceField,
    normalized_category: input.normalized,
    collector_category: input.collector,
    normalization: {
      method: input.method,
      confidence: input.confidence,
      note: input.note,
    },
    is_infrastructure_related: isInfrastructureCategory(input.collector),
  };
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, 500) : null;
}
