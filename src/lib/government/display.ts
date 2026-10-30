import type {
  CaseCategory,
  CasePriority,
  CaseStatus,
  CommunityVerificationStatus,
  DataFreshness,
  DemoRole,
  DispatchState,
  Department,
  RiskStrength,
} from "./types";

export const STATUS_LABELS: Record<CaseStatus, string> = {
  reported: "Reportado",
  under_review: "En revisión",
  assigned: "Asignado",
  in_progress: "En intervención",
  pending_verification: "Por verificar",
  resolved: "Resuelto",
  closed: "Cerrado",
};

export const PRIORITY_LABELS: Record<CasePriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

export const COMMUNITY_VERIFICATION_LABELS: Record<
  CommunityVerificationStatus,
  string
> = {
  not_started: "Sin iniciar",
  pending: "En revisión vecinal",
  verified: "Verificada por la comunidad",
  disputed: "En disputa",
};

export const DATA_FRESHNESS_LABELS: Record<DataFreshness, string> = {
  fresh: "Dato reciente",
  aging: "Dato con rezago",
  stale: "Dato desactualizado",
  unknown: "Frescura desconocida",
};

export const DEMO_ROLE_LABELS: Record<DemoRole, string> = {
  coordinator: "Coordinación",
  department_operator: "Operación de área",
  analyst: "Solo lectura",
};

export const CATEGORY_LABELS: Record<CaseCategory, string> = {
  baches: "Baches y pavimento",
  alumbrado: "Alumbrado público",
  agua: "Agua potable",
  residuos: "Residuos sólidos",
  movilidad: "Movilidad",
  parques: "Parques y jardines",
  seguridad: "Seguridad urbana",
  drenaje: "Drenaje",
};

export const CATEGORY_SHORT_LABELS: Record<CaseCategory, string> = {
  baches: "Baches",
  alumbrado: "Alumbrado",
  agua: "Agua",
  residuos: "Residuos",
  movilidad: "Movilidad",
  parques: "Parques",
  seguridad: "Seguridad",
  drenaje: "Drenaje",
};

export const CATEGORY_COLORS: Record<CaseCategory, string> = {
  baches: "#1453D8",
  alumbrado: "#D97706",
  agua: "#0891B2",
  residuos: "#7C3AED",
  movilidad: "#DB2777",
  parques: "#059669",
  seguridad: "#DC2626",
  drenaje: "#4F46E5",
};

export const DISPATCH_LABELS: Record<DispatchState, string> = {
  recommended: "Recomendado",
  authorized: "Asignación autorizada",
  accepted: "Aceptado por especialista",
  scheduled: "Visita programada",
  in_progress: "Trabajo en curso",
  completed: "Trabajo terminado",
  verified: "Verificado por gobierno",
  returned: "Devuelto para corrección",
};

export const STRENGTH_LABELS: Record<RiskStrength, string> = {
  emerging: "Señal emergente",
  recurring: "Patrón recurrente",
  observed: "Concentración observada",
};

export const DEPARTMENTS: Department[] = [
  {
    id: "obras",
    name: "Secretaría de Obras y Servicios",
    shortName: "Obras",
    color: "#1453D8",
  },
  {
    id: "alumbrado",
    name: "Dirección de Alumbrado Público",
    shortName: "Alumbrado",
    color: "#D97706",
  },
  {
    id: "agua",
    name: "Sistema de Aguas de la Ciudad",
    shortName: "Aguas",
    color: "#0891B2",
  },
  {
    id: "residuos",
    name: "Dirección de Residuos Sólidos",
    shortName: "Residuos",
    color: "#7C3AED",
  },
  {
    id: "movilidad",
    name: "Secretaría de Movilidad",
    shortName: "Movilidad",
    color: "#DB2777",
  },
  {
    id: "parques",
    name: "Dirección de Parques y Jardines",
    shortName: "Parques",
    color: "#059669",
  },
  {
    id: "proteccion",
    name: "Protección Civil",
    shortName: "Protección Civil",
    color: "#DC2626",
  },
];

export function getDepartment(id?: string): Department | undefined {
  return DEPARTMENTS.find((department) => department.id === id);
}

export const COLONIAS = [
  "Centro",
  "Roma Norte",
  "Condesa",
  "Doctores",
  "Del Valle",
  "Narvarte",
  "Coyoacán",
  "Iztapalapa",
  "Tlalpan",
  "Azcapotzalco",
  "Gustavo A. Madero",
  "Benito Juárez",
] as const;

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

export function formatDate(iso: string, includeTime = false): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : {}),
  }).format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}
