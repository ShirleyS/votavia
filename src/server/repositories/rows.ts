import type {
  CaseCategory,
  CaseEventType,
  CaseStatus,
  ObservationKind,
  ActorType,
} from "@/shared/votavia-contract";

/** Persistence row shapes. These are internal: never returned to clients. */
export interface CaseRow {
  id: string;
  display_sequence: number;
  display_id: string;
  category: CaseCategory;
  status: CaseStatus;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  colonia: string;
  address_hint: string | null;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  created_by_user_id: string | null;
  reporter_email: string | null;
  is_demo: boolean;
  is_published: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PhotoRow {
  id: string;
  case_id: string;
  url: string;
  kind: "report" | "before" | "after";
  caption: string | null;
  created_at: string;
}

export interface SupportRow {
  id: string;
  case_id: string;
  participant_key: string;
  user_id: string | null;
  created_at: string;
}

export interface ObservationRow {
  id: string;
  case_id: string;
  kind: ObservationKind;
  body: string;
  author_type: ActorType;
  author_label: string;
  participant_key: string;
  user_id: string | null;
  is_published: boolean;
  created_at: string;
}

export interface EventRow {
  id: string;
  case_id: string;
  type: CaseEventType;
  actor_type: ActorType;
  title: string;
  description: string | null;
  is_public: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ClaimRow {
  id: string;
  case_id: string;
  email: string;
  token_hash: string;
  expires_at: string;
  claimed_at: string | null;
  created_at: string;
}

export interface CaseAggregate {
  row: CaseRow;
  photos: PhotoRow[];
  support_count: number;
  observation_count: number;
  supported_by_me: boolean;
}
