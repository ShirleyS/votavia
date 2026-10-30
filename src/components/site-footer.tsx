import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-[#fffdf8]">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-navy-500">
            VotaVía conecta a vecinas y vecinos con los equipos que atienden el espacio público.
            Reporta, apoya y sigue lo que pasa en tu colonia.
          </p>
          <p className="text-xs text-navy-500">
            Proyecto independiente. No representa una postura oficial de la Alcaldía Cuauhtémoc ni
            del Gobierno de la Ciudad de México.
          </p>
        </div>

        <nav aria-label="Plataforma" className="space-y-2 text-sm">
          <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Plataforma</p>
          <Link href="/explorar" className="block text-navy-700 hover:text-royal-700">
            Explorar reportes
          </Link>
          <Link href="/reportar" className="block text-navy-700 hover:text-royal-700">
            Reportar un problema
          </Link>
          <Link href="/desarrolladores" className="block text-navy-700 hover:text-royal-700">
            API para desarrolladores
          </Link>
          <Link href="/resultados" className="block text-navy-700 hover:text-royal-700">
            Resultados públicos
          </Link>
          <Link href="/#como-funciona" className="block text-navy-700 hover:text-royal-700">
            Cómo funciona
          </Link>
        </nav>

        <nav aria-label="Tu cuenta" className="space-y-2 text-sm">
          <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Tu cuenta</p>
          <Link href="/login" className="block text-navy-700 hover:text-royal-700">
            Iniciar sesión
          </Link>
          <Link href="/mis-reportes" className="block text-navy-700 hover:text-royal-700">
            Mis reportes
          </Link>
          <Link href="/gobierno" className="block text-navy-700 hover:text-royal-700">
            Espacio para gobierno
          </Link>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-navy-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} VotaVía · Ciudad de México</p>
          <p>Tus datos de contacto nunca se publican junto a tu reporte.</p>
        </div>
      </div>
    </footer>
  );
}
