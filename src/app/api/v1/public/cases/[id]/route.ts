import type { ItemEnvelope } from "@/public-api/types";
import type { PublicCaseDetail } from "@/public-api/types";
import { publicGet, publicOptions } from "@/public-api/http";
import { getPublicApiService } from "@/public-api/runtime";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = publicGet<ItemEnvelope<PublicCaseDetail>, RouteContext>(
  async ({ requestId }, route) => {
    const { id } = await route.params;
    return getPublicApiService().getCase(id, requestId);
  },
  { cacheSeconds: 60, staleSeconds: 300 },
);

export const OPTIONS = publicOptions();
