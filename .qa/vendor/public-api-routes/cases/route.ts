import { publicGet, publicOptions } from "@/public-api/http";
import { getPublicApiService } from "@/public-api/runtime";

export const dynamic = "force-dynamic";

export const GET = publicGet(
  ({ searchParams, requestId }) => getPublicApiService().listCases(searchParams, requestId),
  { cacheSeconds: 30, staleSeconds: 120 },
);

export const OPTIONS = publicOptions();
