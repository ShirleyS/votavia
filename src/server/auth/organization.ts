import type { OrganizationMembership, ParticipantContext } from "@/shared/votavia-contract";
import { getRepository } from "@/server/services/container";
import { seedDemoEnvironment } from "@/server/repositories/demo-store";
import { hasSupabaseDatabase } from "@/server/env";

export { hasOrganizationRole, organizationIds } from "@/server/auth/roles";

export interface ActorContext {
  participant: ParticipantContext;
  memberships: OrganizationMembership[];
}

/**
 * One in-flight seed at a time. Several panels of the console load in
 * parallel on first paint; without this each would rewrite the demo dataset.
 */
let demoSeedInFlight: Promise<unknown> | null = null;

function provisionDemoMembership(userId: string) {
  if (!demoSeedInFlight) {
    demoSeedInFlight = seedDemoEnvironment({
      id: userId,
      email: "demo@votavia.mx",
    }).finally(() => {
      demoSeedInFlight = null;
    });
  }
  return demoSeedInFlight;
}

/**
 * Resolves the organizations a user really belongs to.
 * A government-looking email address grants nothing on its own: the membership
 * row must exist, be verified and not be revoked.
 */
export async function resolveActor(participant: ParticipantContext): Promise<ActorContext> {
  if (!participant.user_id) return { participant, memberships: [] };
  let rows = await getRepository().membershipsFor(participant.user_id);

  // A demo deployment has to be usable on first load. The curated dataset and
  // its verified membership are provisioned once, for the shared demo account
  // only, and only when that flag is set. Never fires against a real backend.
  if (
    rows.length === 0 &&
    // Demo store: no service-role key, or an explicit demo deployment.
    !hasSupabaseDatabase() &&
    participant.user_id.startsWith("demo-")
  ) {
    await provisionDemoMembership(participant.user_id);
    rows = await getRepository().membershipsFor(participant.user_id);
  }

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
