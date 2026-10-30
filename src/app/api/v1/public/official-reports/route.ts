import { publicGet, publicOptions } from "@/public-api/http";
import { getPublicApiService } from "@/public-api/runtime";

export const dynamic = "force-dynamic";

export const GET = publicGet(
  ({ searchParams, requestId }) =>
    getPublicApiService().listOfficialReports(searchParams, requestId),
  { cacheSeconds: 300, staleSeconds: 900 },
);

export const OPTIONS = publicOptions();
