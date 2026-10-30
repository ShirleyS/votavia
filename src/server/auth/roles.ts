import type { OrganizationMembership, OrganizationRole } from "@/shared/votavia-contract";

const RANK: Record<OrganizationRole, number> = { responder: 1, supervisor: 2, admin: 3 };

/** Pure permission helpers. No repository import, so services can use them safely. */
export function hasOrganizationRole(
  memberships: OrganizationMembership[],
  organizationId: string,
  minimum: OrganizationRole = "responder",
): boolean {
  const membership = memberships.find((item) => item.organization_id === organizationId);
  if (!membership) return false;
  return RANK[membership.role] >= RANK[minimum];
}

export function organizationIds(memberships: OrganizationMembership[]): string[] {
  return memberships.map((item) => item.organization_id);
}
