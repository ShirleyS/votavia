import type { CaseCategory, CaseStatus, ObservationKind } from "@/shared/votavia-contract";

export interface CategoryMeta {
  value: CaseCategory;
  label: string;
  shortLabel: string;
  description: string;
  /** Tailwind utility classes for the restrained accent palette. */
  chip: string;
  dot: string;
  icon:
    | "triangle-alert"
    | "lightbulb"
    | "traffic-cone"
    | "accessibility"
    | "trees"
    | "trash-2"
    | "bench-tree"
    | "circle-ellipsis";
}

export const CATEGORY_META: Record<CaseCategory, CategoryMeta> = {
  road_damage: {
    value: "road_damage",
    label: "Baches y pavimento",
    shortLabel: "Baches",
    description: "Baches, grietas, hundimientos y pavimento en mal estado.",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500",
    icon: "triangle-alert",
  },
  street_lighting: {
    value: "street_lighting",
    label: "Luminarias y alumbrado",
    shortLabel: "Luminarias",
    description: "Lámparas apagadas, intermitentes o vandalizadas.",
    chip: "bg-amber-50 text-amber-800 ring-amber-200",
    dot: "bg-amber-500",
    icon: "lightbulb",
  },
  traffic_signals: {
    value: "traffic_signals",
    label: "Semáforos y señalización",
    shortLabel: "Semáforos",
    description: "Semáforos descompuestos, señales caídas o confusas.",
    chip: "bg-violet-50 text-violet-700 ring-violet-200",
    dot: "bg-violet-500",
    icon: "traffic-cone",
  },
  sidewalk_accessibility: {
    value: "sidewalk_accessibility",
    label: "Banquetas y accesibilidad",
    shortLabel: "Banquetas",
    description: "Banquetas rotas, rampas obstruidas o cruces inseguros.",
    chip: "bg-teal-50 text-teal-800 ring-teal-200",
    dot: "bg-teal-500",
    icon: "accessibility",
  },
  trees_vegetation: {
    value: "trees_vegetation",
    label: "Árboles y vegetación",
    shortLabel: "Áreas verdes",
    description: "Árboles caídos, poda pendiente o riesgo de ramas.",
    chip: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    dot: "bg-emerald-500",
    icon: "trees",
  },
  waste_sanitation: {
    value: "waste_sanitation",
    label: "Limpieza y residuos",
    shortLabel: "Limpieza",
    description: "Basura acumulada, contenedores desbordados o escombros.",
    chip: "bg-orange-50 text-orange-800 ring-orange-200",
    dot: "bg-orange-500",
    icon: "trash-2",
  },
  parks_public_spaces: {
    value: "parks_public_spaces",
    label: "Parques y espacio público",
    shortLabel: "Parques",
    description: "Jardines, juegos, mobiliario urbano o plazas dañadas.",
    chip: "bg-sky-50 text-sky-800 ring-sky-200",
    dot: "bg-sky-500",
    icon: "bench-tree",
  },
  other: {
    value: "other",
    label: "Otro problema",
    shortLabel: "Otros",
    description: "Cualquier otra afectación al espacio público.",
    chip: "bg-slate-100 text-slate-700 ring-slate-200",
    dot: "bg-slate-400",
    icon: "circle-ellipsis",
  },
};

export interface StatusMeta {
  value: CaseStatus;
  label: string;
  description: string;
  className: string;
  step: number;
}

export const STATUS_META: Record<CaseStatus, StatusMeta> = {
  reported: {
    value: "reported",
    label: "Recibido",
    description: "El reporte se registró y espera revisión.",
    className: "bg-slate-100 text-slate-700 ring-slate-200",
    step: 0,
  },
  under_review: {
    value: "under_review",
    label: "En revisión",
    description: "El equipo está verificando la información del reporte.",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
    step: 1,
  },
  assigned: {
    value: "assigned",
    label: "Asignado",
    description: "Se asignó a un equipo responsable de atenderlo.",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
    step: 2,
  },
  in_progress: {
    value: "in_progress",
    label: "En proceso",
    description: "Ya se está trabajando en el problema.",
    className: "bg-blue-50 text-blue-700 ring-blue-200",
    step: 3,
  },
  pending_verification: {
    value: "pending_verification",
    label: "Por verificar",
    description: "El trabajo terminó y la comunidad confirma el resultado.",
    className: "bg-sky-50 text-sky-800 ring-sky-200",
    step: 4,
  },
  resolved: {
    value: "resolved",
    label: "Resuelto",
    description: "El problema se resolvió con evidencia publicada.",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    step: 5,
  },
  closed: {
    value: "closed",
    label: "Cerrado",
    description: "El caso se cerró sin una intervención pendiente.",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
    step: 5,
  },
};

export const OBSERVATION_META: Record<ObservationKind, { label: string; helper: string }> = {
  comment: { label: "Comentario", helper: "Agrega contexto útil para quien atenderá el caso." },
  still_happening: { label: "Sigue ocurriendo", helper: "Confirma que el problema continúa." },
  safety_concern: { label: "Riesgo de seguridad", helper: "Describe el riesgo para las personas." },
  accessibility_concern: {
    label: "Barrera de accesibilidad",
    helper: "Cuéntanos quién no puede pasar o usar el espacio.",
  },
};

export const COLONIAS = [
  "Centro Histórico",
  "Roma Norte",
  "Roma Sur",
  "Condesa",
  "Hipódromo",
  "Hipódromo Condesa",
  "Doctores",
  "Obrera",
  "Juárez",
  "Tabacalera",
  "Guerrero",
  "Santa María la Ribera",
  "San Rafael",
  "Buenavista",
  "Atlampa",
  "Ex Hipódromo de Peralvillo",
] as const;

/** Approximate centroids used for the map and for neighborhood grouping. */
export const COLONIA_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  "Centro Histórico": { lat: 19.4352, lng: -99.1412 },
  "Roma Norte": { lat: 19.4185, lng: -99.1613 },
  "Roma Sur": { lat: 19.4094, lng: -99.1593 },
  Condesa: { lat: 19.4127, lng: -99.1725 },
  Hipódromo: { lat: 19.412, lng: -99.172 },
  "Hipódromo Condesa": { lat: 19.412, lng: -99.172 },
  Doctores: { lat: 19.4215, lng: -99.1483 },
  Obrera: { lat: 19.424, lng: -99.144 },
  Juárez: { lat: 19.4285, lng: -99.1532 },
  Tabacalera: { lat: 19.428, lng: -99.162 },
  Guerrero: { lat: 19.4462, lng: -99.1478 },
  "Santa María la Ribera": { lat: 19.4475, lng: -99.1562 },
  "San Rafael": { lat: 19.4385, lng: -99.165 },
  Buenavista: { lat: 19.4453, lng: -99.1543 },
  Atlampa: { lat: 19.452, lng: -99.158 },
  "Ex Hipódromo de Peralvillo": { lat: 19.454, lng: -99.143 },
};

export const CUAUHTEMOC_CENTER = { lat: 19.4326, lng: -99.1505 };
