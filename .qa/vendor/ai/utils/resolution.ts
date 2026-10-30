import type {
  ResolutionEvidenceInput,
  ResolutionInput,
  ResolutionSignal,
  ResolutionSignalType,
} from "../types";
import { isIsoDate, normalizeText } from "./validation";

const DAY_MS = 86_400_000;

const CLOSED_STATUSES = new Set(["resolved", "closed", "pending_verification"]);

const PERSISTENCE_PATTERNS = [
  "sigue igual",
  "sigue ocurriendo",
  "sigue pasando",
  "sigue ahi",
  "sigue ahí",
  "continua",
  "continúa",
  "todavia",
  "todavía",
  "aun no",
  "aún no",
  "no lo arreglaron",
  "no arreglaron",
  "no repararon",
  "no sirve",
  "no funciona",
  "sigue descompuesto",
  "sigue roto",
  "sigue tapado",
  "volvio",
  "volvió",
  "otra vez",
  "de nuevo",
  "no han venido",
  "nadie vino",
  "sin resolver",
];

const STRONG_KINDS = new Set(["still_happening", "evidence_added", "observation"]);

function evidenceTime(item: ResolutionEvidenceInput): number | null {
  return isIsoDate(item.created_at) ? Date.parse(item.created_at as string) : null;
}

function evidenceId(item: ResolutionEvidenceInput, index: number): string {
  const id = typeof item.id === "string" ? item.id.trim() : "";
  return id || `evidence-${index + 1}`;
}

function describesPersistence(item: ResolutionEvidenceInput): boolean {
  if (item.kind && STRONG_KINDS.has(item.kind)) return true;
  const text = normalizeText(`${item.kind ?? ""} ${item.body ?? ""}`);
  if (item.kind === "comment" && !text) return false;
  return PERSISTENCE_PATTERNS.some((pattern) => text.includes(normalizeText(pattern)));
}

/**
 * Deterministic resolution check.
 *
 * Never declares a case resolved or an intervention fraudulent. It only
 * reports whether newer citizen evidence is consistent with the issue
 * persisting after an official closure.
 */
export function assessResolution(input: ResolutionInput): ResolutionSignal {
  const status = typeof input.official_status === "string" ? input.official_status.trim() : null;
  const closedAtRaw = input.closed_at ?? input.resolved_at ?? null;
  const closedAt = isIsoDate(closedAtRaw) ? (closedAtRaw as string) : null;
  const closedTime = closedAt ? Date.parse(closedAt) : null;
  const isOfficiallyClosed = status !== null && CLOSED_STATUSES.has(normalizeText(status));

  const evidence = (input.evidence ?? []).filter((item) => item && typeof item === "object");
  const newer = evidence.filter((item) => {
    const time = evidenceTime(item);
    if (time === null) return closedTime === null ? isOfficiallyClosed : false;
    if (closedTime === null) return isOfficiallyClosed;
    return time > closedTime;
  });

  const persistenceEvidence = newer.filter(describesPersistence);
  const newestTime = newer.reduce<number | null>((max, item) => {
    const time = evidenceTime(item);
    if (time === null) return max;
    return max === null ? time : Math.max(max, time);
  }, null);

  const linked = (input.linked_report_ids ?? []).filter(Boolean);
  const daysSinceClosure =
    closedTime === null
      ? null
      : Math.max(
          0,
          Math.round(
            ((isIsoDate(input.now) ? Date.parse(input.now as string) : Date.now()) - closedTime) /
              DAY_MS,
          ),
        );

  const base = {
    official_status: status,
    official_closed_at: closedAt,
    newer_evidence_count: newer.length,
    newest_evidence_at: newestTime === null ? null : new Date(newestTime).toISOString(),
    days_since_closure: daysSinceClosure,
    possible_persistence: persistenceEvidence.length > 0,
    evidence_ids: newer.map((item, index) => evidenceId(item, index)).slice(0, 10),
    declares_resolved: false as const,
    declares_fraud: false as const,
    requires_human_review: true as const,
  };

  if (!isOfficiallyClosed) {
    return {
      ...base,
      signal_type: "insufficient_data",
      confidence: "low",
      explanation:
        "No hay un cierre o resolución oficial registrado; no se puede evaluar persistencia.",
    };
  }

  if (persistenceEvidence.length > 0) {
    const confidence =
      persistenceEvidence.length >= 2 && closedAt !== null
        ? "high"
        : persistenceEvidence.length >= 1 && closedAt !== null
          ? "medium"
          : "low";
    const timeNote =
      closedAt === null
        ? "No se registró la fecha exacta del cierre oficial."
        : `El cierre oficial es del ${closedAt.slice(0, 10)}.`;
    return {
      ...base,
      signal_type: "persists_after_closure",
      confidence,
      explanation: `El registro oficial figura como "${status}", pero ${persistenceEvidence.length} evidencia(s) ciudadana(s) posterior(es) indican que el problema podría persistir. ${timeNote} Requiere verificación humana; no se declara resuelto ni se califica de fraude.`,
    };
  }

  if (newer.length > 0 || linked.length > 0) {
    return {
      ...base,
      signal_type: "disputed_closure",
      confidence: closedAt === null ? "low" : "medium",
      explanation: `El registro oficial figura como "${status}", pero existe evidencia ciudadana posterior o reportes vinculados que no confirman la resolución. Revisar manualmente antes de aceptar el cierre.`,
    };
  }

  return {
    ...base,
    signal_type: "no_signal",
    confidence: "low",
    explanation: `El registro figura como "${status}" y no se recibió evidencia ciudadana posterior. Esto no valida por sí mismo la intervención; solo no hay señales de persistencia en los datos entregados.`,
  };
}

export function isResolutionSignalType(value: unknown): value is ResolutionSignalType {
  return (
    value === "no_signal" ||
    value === "persists_after_closure" ||
    value === "disputed_closure" ||
    value === "insufficient_data"
  );
}
