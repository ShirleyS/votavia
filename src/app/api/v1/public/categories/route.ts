import { publicGet, publicOptions } from "@/public-api/http";
import { getPublicApiService } from "@/public-api/runtime";

export const dynamic = "force-dynamic";

export const GET = publicGet(
  ({ requestId }) => getPublicApiService().getCategories(requestId),
  { cacheSeconds: 300, staleSeconds: 900 },
);

export const OPTIONS = publicOptions();
