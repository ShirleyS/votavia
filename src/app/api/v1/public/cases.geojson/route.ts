import { publicGet, publicOptions } from "@/public-api/http";
import { getPublicApiService } from "@/public-api/runtime";

export const dynamic = "force-dynamic";

export const GET = publicGet(
  ({ searchParams, requestId }) =>
    getPublicApiService().listGeoJson(searchParams, requestId),
  { cacheSeconds: 60, staleSeconds: 300, contentType: "application/geo+json; charset=utf-8" },
);

export const OPTIONS = publicOptions();
