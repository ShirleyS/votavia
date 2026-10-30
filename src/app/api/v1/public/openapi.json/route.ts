import { publicGet, publicOptions } from "@/public-api/http";
import { openApiDocument } from "@/public-api/openapi";

export const dynamic = "force-dynamic";

export const GET = publicGet(async () => openApiDocument(), {
  cacheSeconds: 3600,
  staleSeconds: 86_400,
});

export const OPTIONS = publicOptions();
