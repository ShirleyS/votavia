import type { OrganizationMembership, ParticipantContext } from "@/shared/votavia-contract";
import { getRepository } from "@/server/services/container";

export { hasOrganizationRole, organizationIds } from "@/server/auth/roles";

export interface ActorContext {
  participant: ParticipantContext;
  memberships: OrganizationMembership[];
}

/**
 * Resolves the organizations a user really belongs to.
 * A government-looking email address grants nothing on its own: the membership
 * row must exist, be verified and not be revoked.
 */
export async function resolveActor(participant: ParticipantContext): Promise<ActorContext> {
  if (!participant.user_id) return { participant, memberships: [] };
  const rows = await getRepository().membershipsFor(participant.user_id);
  return {
    participant,
    memberships: rows.map((row) => ({
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.role,
      scope: row.scope,
      verified_at: row.verified_at,
    })),
  };
}
