"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LogOut, Menu, Search, UserRound, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { DemoSeedButton } from "@/components/demo-seed-button";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/explorar", label: "Explorar" },
  { href: "/reportar", label: "Reportar" },
  { href: "/resultados", label: "Resultados" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/gobierno", label: "Para gobierno" },
];

export function SiteHeader({
  email,
  isDemo,
  demoEnabled,
}: {
  email: string | null;
  isDemo: boolean;
  demoEnabled: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Reset transient menus when navigation changes the current path.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
    setMenu(false);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href.split("#")[0]) && href !== "/#como-funciona";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="VotaVía, ir al inicio" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Navegación principal" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "text-royal-700 underline decoration-2 underline-offset-8"
                  : "text-navy-700 hover:bg-navy-50",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/explorar#buscar"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-navy-700 hover:bg-navy-50 sm:inline-flex"
            aria-label="Buscar reportes"
          >
            <Search className="h-5 w-5" aria-hidden />
          </Link>

          <Link href="/reportar" className={cn(buttonStyles({ size: "md" }), "hidden sm:inline-flex")}>
            Participa
          </Link>

          {demoEnabled ? <DemoSeedButton /> : null}

          {email ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((value) => !value)}
                aria-expanded={menu}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-full border border-line px-2.5 py-1.5 text-sm font-medium text-navy-800 hover:bg-navy-50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-royal-50 text-royal-700">
                  <UserRound className="h-4 w-4" aria-hidden />
                </span>
                <span className="hidden max-w-[10rem] truncate md:block">{email}</span>
                <ChevronDown className="h-4 w-4 text-navy-500" aria-hidden />
              </button>
              {menu ? (
                <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-float)]">
                  <Link role="menuitem" href="/mis-reportes" className="block rounded-lg px-3 py-2 text-sm hover:bg-navy-50">
                    Mis reportes
                  </Link>
                  <Link role="menuitem" href="/mi-cuenta" className="block rounded-lg px-3 py-2 text-sm hover:bg-navy-50">
                    Mi cuenta
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button
                      role="menuitem"
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" aria-hidden /> Cerrar sesión
                    </button>
                  </form>
                  {isDemo ? <p className="px-3 py-2 text-[11px] text-navy-500">Sesión de demostración</p> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <Link href="/login" className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "hidden md:inline-flex")}>
              Entrar
            </Link>
          )}

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-navy-800 hover:bg-navy-50 lg:hidden"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line bg-white lg:hidden">
          <nav aria-label="Navegación móvil" className="container-page flex flex-col py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-2 py-3 text-[15px] font-medium text-navy-800 hover:bg-navy-50"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2 pb-4">
              <Link href="/reportar" className={cn(buttonStyles(), "flex-1")}>
                Reportar un problema
              </Link>
              {!email ? (
                <Link href="/login" className={cn(buttonStyles({ variant: "secondary" }), "flex-1")}>
                  Entrar
                </Link>
              ) : null}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
