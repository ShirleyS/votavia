import type { OfficialStatus } from "../types.js";
import { normalizeKey } from "../lib/text.js";

export interface StatusNormalization {
  original: string | null;
  normalized: OfficialStatus;
  mapped: boolean;
  note: string | null;
}

const RECEIVED = [
  "RECIBIDA",
  "RECIBIDO",
  "REGISTRADA",
  "REGISTRADO",
  "NUEVA",
  "NUEVO",
  "PENDIENTE",
  "PENDIENTE DE ATENCION",
  "EN ESPERA",
  "EN ESPERA DE ATENCION",
  "ABIERTA",
  "ABIERTO",
  "INGRESADA",
  "INGRESADO",
];

const IN_PROGRESS = [
  "EN PROCESO",
  "EN ATENCION",
  "ASIGNADA",
  "ASIGNADO",
  "EN SEGUIMIENTO",
  "ATENDIENDO",
  "EN REVISION",
  "EN EJECUCION",
  "PROGRAMADA",
  "PROGRAMADO",
  "EN TRAMITE",
  "ENVIADA",
  "ENVIADO",
  "CANALIZADA",
  "CANALIZADO",
  "EN EJECUCION",
  "EN OBRA",
];

const RESOLVED = [
  "CONCLUIDA",
  "CONCLUIDO",
  "RESUELTA",
  "RESUELTO",
  "TERMINADA",
  "TERMINADO",
  "ATENDIDA",
  "ATENDIDO",
  "FINALIZADA",
  "FINALIZADO",
  "CERRADA CON SOLUCION",
  "CERRADO CON SOLUCION",
  "SOLUCIONADA",
  "SOLUCIONADO",
  "COMPLETADA",
  "COMPLETADO",
];

const CLOSED_NO_ACTION = [
  "CANCELADA",
  "CANCELADO",
  "IMPROCEDENTE",
  "NO PROCEDE",
  "NO PROCEDENTE",
  "RECHAZADA",
  "RECHAZADO",
  "DUPLICADA",
  "DUPLICADO",
  "SIN ACCION",
  "BAJA",
  "DESISTIDA",
  "DESISTIDO",
  "NO ATENDIDA",
  "NO ATENDIDO",
  "VENCIDA",
  "VENCIDO",
  "CERRADA SIN ATENCION",
  "CERRADO SIN ATENCION",
];

export function normalizeStatus(value: unknown): StatusNormalization {
  const original = typeof value === "string" ? value.trim() : value == null ? null : String(value).trim();
  if (!original) {
    return { original: null, normalized: "unknown", mapped: false, note: "missing_status" };
  }
  const key = normalizeKey(original);
  const check = (values: readonly string[]): boolean => values.some((candidate) => key === candidate || key.startsWith(`${candidate} `));
  if (check(RESOLVED)) return { original, normalized: "resolved", mapped: true, note: null };
  if (check(CLOSED_NO_ACTION)) return { original, normalized: "closed_no_action", mapped: true, note: null };
  if (check(IN_PROGRESS)) return { original, normalized: "in_progress", mapped: true, note: null };
  if (check(RECEIVED)) return { original, normalized: "received", mapped: true, note: null };
  return {
    original,
    normalized: "unknown",
    mapped: false,
    note: `Unmapped government status "${original}"; preserved verbatim.`,
  };
}
