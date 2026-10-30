import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VotaVía Gobierno · Centro de operaciones",
  description:
    "Consola de operación gubernamental de VotaVía para revisar reportes, coordinar intervenciones y publicar resultados.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
