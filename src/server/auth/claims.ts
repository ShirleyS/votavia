import { createHash, randomBytes } from "node:crypto";
import { getRepository } from "@/server/services/container";

export const CLAIM_COOKIE = "vv_claim";
const CLAIM_TTL_MS = 1000 * 60 * 30;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newClaimToken() {
  return randomBytes(32).toString("base64url");
}

export async function createCaseClaim(caseId: string, email: string) {
  const token = newClaimToken();
  await getRepository().createClaim({
    caseId,
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
  });
  return token;
}

export async function consumeClaim(token: string) {
  const claim = await getRepository().claimByTokenHash(hashToken(token));
  return claim;
}
