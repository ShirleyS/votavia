import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VotaVía · API pública",
    template: "%s · VotaVía",
  },
  description:
    "API pública de solo lectura para consultar casos urbanos publicados en Cuauhtémoc, con privacidad de residentes por diseño.",
  applicationName: "VotaVía",
  keywords: ["VotaVía", "API pública", "datos cívicos", "Cuauhtémoc", "transparencia"],
  openGraph: {
    title: "VotaVía · API pública",
    description:
      "Casos urbanos publicados, estadísticas y señales preventivas aprobadas. Solo lectura, sin datos personales.",
    type: "website",
    locale: "es_MX",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
