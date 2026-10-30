import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DemoBanner } from "@/components/demo-banner";
import { getSessionUser } from "@/server/auth/session";
import { currentBackend } from "@/server/services/container";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "VotaVía · Tu colonia. Tus prioridades. Más resultados.",
    template: "%s · VotaVía",
  },
  description:
    "VotaVía conecta a vecinas y vecinos de Cuauhtémoc con el gobierno para reportar, priorizar y dar seguimiento a problemas de la vía pública.",
  applicationName: "VotaVía",
  openGraph: {
    title: "VotaVía · Tu colonia. Tus prioridades. Más resultados.",
    description:
      "Reporta problemas de tu colonia, apoya las prioridades de tu comunidad y sigue los resultados en Cuauhtémoc, CDMX.",
    locale: "es_MX",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#1453D8",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, backend] = await Promise.all([getSessionUser(), Promise.resolve(currentBackend())]);

  return (
    <html lang="es-MX">
      <body className="flex min-h-screen flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-royal-700 focus:shadow"
        >
          Saltar al contenido
        </a>
        <DemoBanner mode={backend} />
        <SiteHeader email={user?.email ?? null} isDemo={Boolean(user?.is_demo)} />
        <main id="contenido" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
