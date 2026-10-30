import { publicGet, publicOptions } from "@/public-api/http";
import { getPublicApiService } from "@/public-api/runtime";

export const dynamic = "force-dynamic";

export const GET = publicGet(
  ({ searchParams, requestId }) => getPublicApiService().listRiskSignals(searchParams, requestId),
  { cacheSeconds: 120, staleSeconds: 300 },
);

export const OPTIONS = publicOptions();
