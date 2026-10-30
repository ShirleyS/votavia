import { publicGet, publicOptions } from "@/public-api/http";
import { getPublicApiService } from "@/public-api/runtime";

export const dynamic = "force-dynamic";

export const GET = publicGet(
  ({ requestId }) => getPublicApiService().getHealth(requestId),
  { cacheSeconds: 10, staleSeconds: 30 },
);

export const OPTIONS = publicOptions();
