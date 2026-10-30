import type { CaseCategory } from "@/shared/votavia-contract";
import type { PublicRiskSignal, RiskLevel, RiskSignalType } from "./types";

/**
 * What the preventive service (Session 3) must hand us for each signal.
 * Everything here is an approved, already-calculated output. The public API
 * does not infer risk, severity or clusters on its own.
 */
export interface ApprovedRiskSignal extends Omit<PublicRiskSignal, "risk_level"> {
  risk_level: RiskLevel | null;
  approval_status: "approved" | "pending" | "rejected";
  is_public: boolean;
  /** Internal evidence; intentionally never republished. */
  evidence_record_ids?: string[];
}

export function matchesRiskFilters(
  signal: ApprovedRiskSignal,
  filters: {
    categories?: CaseCategory[];
    colonia?: string;
    levels?: RiskLevel[];
    types?: RiskSignalType[];
  },
): boolean {
  if (signal.approval_status !== "approved" || !signal.is_public) return false;
  if (filters.categories && !filters.categories.includes(signal.category)) return false;
  if (filters.levels && (!signal.risk_level || !filters.levels.includes(signal.risk_level))) {
    return false;
  }
  if (filters.types && !filters.types.includes(signal.signal_type)) return false;
  if (filters.colonia && signal.colonia?.toLowerCase() !== filters.colonia.toLowerCase()) {
    return false;
  }
  return true;
}

/** Drops approval/evidence fields; returns the exact public shape. */
export function toPublicRiskSignal(signal: ApprovedRiskSignal): PublicRiskSignal {
  return {
    signal_id: signal.signal_id,
    signal_type: signal.signal_type,
    area_label: signal.area_label,
    colonia: signal.colonia,
    category: signal.category,
    risk_level: signal.risk_level,
    attention_index: Math.max(0, Math.min(100, Math.round(signal.attention_index))),
    finding: signal.finding,
    recommended_action: signal.recommended_action,
    spatial_precision: signal.spatial_precision,
    centroid: signal.centroid
      ? {
          latitude: Number(signal.centroid.latitude.toFixed(3)),
          longitude: Number(signal.centroid.longitude.toFixed(3)),
        }
      : null,
    radius_meters: signal.radius_meters,
    window_days: signal.window_days,
    current_window_count: signal.current_window_count,
    previous_window_count: signal.previous_window_count,
    change_ratio: signal.change_ratio,
    valid_from: signal.valid_from,
    valid_until: signal.valid_until,
    generated_at: signal.generated_at,
    approved_at: signal.approved_at,
    approved_by_role: signal.approved_by_role,
    analysis_version: signal.analysis_version,
    limitations: signal.limitations.slice(0, 8),
  };
}
