import type { NextConfig } from "next";

/**
 * La consola habla con el núcleo de Session 1 en el mismo origen.
 * `VOTAVIA_CORE_ORIGIN` (servidor) apunta a la app del núcleo; las peticiones
 * del navegador salen a `/core-api/*` y se reescriben a `/api/*`, de modo que la
 * cookie de sesión del núcleo viaja sin CORS ni una segunda autenticación.
 */
const coreOrigin = process.env.VOTAVIA_CORE_ORIGIN?.trim().replace(/\/$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    if (!coreOrigin) return [];
    return [
      {
        source: "/core-api/:path*",
        destination: `${coreOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
