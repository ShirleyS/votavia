/**
 * Government operations contract (server-persisted).
 *
 * These are the five surfaces the console used to keep as local fixtures:
 * assignment, dispute responses, outcome publication, activity, and dispatch.
 * The browser talks to them only through `/api/issues/[id]/*` and `/api/dispatch`.
 */

export const DISPATCH_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "in_progress",
  "submitted_for_review",
  "verified",
  "returned",
  "cancelled",
] as const;

export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

export interface AssignmentRecord {
  assignment_id: string;
  issue_id: string;
  department_id: string;
  operator_name: string;
  operator_user_id: string | null;
  organization_id: string | null;
  note: string | null;
  assigned_by: string | null;
  created_at: string;
}

export interface DisputeResponseRecord {
  response_id: string;
  issue_id: string;
  body: string;
  department_id: string | null;
  author_name: string;
  follow_up_evidence_ids: string[];
  organization_id: string | null;
  responded_by: string | null;
  created_at: string;
}

export interface PublicationRecord {
  publication_id: string;
  issue_id: string;
  outcome: string;
  summary: string | null;
  organization_id: string | null;
  published_by: string | null;
  published_at: string;
}

export interface ActivityRecord {
  activity_id: string;
  issue_id: string;
  kind: string;
  actor: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SpecialistRecord {
  specialist_id: string;
  name: string;
  skills: string[];
  coverage_colonias: string[];
  approved: boolean;
  available: boolean;
  organization_id: string | null;
}

export interface DispatchAssignmentRecord {
  assignment_id: string;
  dispatch_request_id: string;
  issue_id: string;
  specialist_id: string;
  status: DispatchStatus;
  created_at: string;
  updated_at: string;
}

export interface DispatchRequestRecord {
  dispatch_request_id: string;
  issue_id: string;
  category: string;
  colonia: string | null;
  note: string | null;
  organization_id: string | null;
  created_at: string;
}
