"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowRight, ChevronDown, LogOut, Menu, Search, UserRound, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { DemoSeedButton } from "@/components/demo-seed-button";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * When each link appears in the desktop bar.
 *
 * The bar has to fit the wordmark, the actions and the account chip as well as
 * these links, so they are revealed in stages. Adding a link without a stage
 * makes every label wrap onto two lines and collides with the actions.
 */
type NavStage = "base" | "xl" | "2xl";

const NAV: { href: string; label: string; stage: NavStage }[] = [
  { href: "/explorar", label: "Explorar", stage: "base" },
  { href: "/reportar", label: "Reportar", stage: "base" },
  { href: "/resultados", label: "Resultados", stage: "base" },
  { href: "/#prioridades", label: "Prioridades", stage: "xl" },
  { href: "/gobierno", label: "Para gobierno", stage: "xl" },
  { href: "/#como-funciona", label: "Cómo funciona", stage: "2xl" },
  { href: "/desarrolladores", label: "API", stage: "2xl" },
];

const STAGE_VISIBILITY: Record<NavStage, string> = {
  base: "",
  xl: "hidden xl:inline-flex",
  "2xl": "hidden 2xl:inline-flex",
};

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

  const isActive = (href: string) => {
    if (href.includes("#")) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-[76px] w-full max-w-[92rem] items-center justify-between gap-4 px-4 md:px-6 xl:gap-6">
        <div className="flex min-w-0 items-center gap-3 xl:gap-5">
          <Link href="/" aria-label="VotaVía, ir al inicio" className="shrink-0">
            <Logo />
          </Link>

          <nav aria-label="Navegación principal" className="hidden items-center gap-0.5 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "relative whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] font-semibold transition-colors xl:px-3 xl:text-[14px]",
                  STAGE_VISIBILITY[item.stage],
                  isActive(item.href)
                    ? "text-[#1D4FD8] underline decoration-[2.5px] underline-offset-[9px]"
                    : "text-navy-700 hover:bg-navy-50 hover:text-navy-900",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/explorar#buscar"
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-navy-700 hover:bg-navy-50 xl:inline-flex"
            aria-label="Buscar reportes"
          >
            <Search className="h-5 w-5" aria-hidden />
          </Link>

          <Link
            href="/reportar"
            className={cn(
              buttonStyles({ size: "md" }),
              "hidden rounded-full bg-[#1D4FD8] px-5 shadow-[0_10px_22px_-14px_rgba(29,79,216,.75)] hover:bg-[#1740b8] sm:inline-flex",
            )}
          >
            Participa <ArrowRight className="h-4 w-4" aria-hidden />
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
                <span className="hidden max-w-[9rem] truncate whitespace-nowrap xl:block">{email}</span>
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
