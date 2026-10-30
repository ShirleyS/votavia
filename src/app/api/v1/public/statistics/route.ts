import { publicGet, publicOptions } from "@/public-api/http";
import { getPublicApiService } from "@/public-api/runtime";

export const dynamic = "force-dynamic";

export const GET = publicGet(
  ({ requestId }) => getPublicApiService().getStatistics(requestId),
  { cacheSeconds: 60, staleSeconds: 300 },
);

export const OPTIONS = publicOptions();
