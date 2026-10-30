"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronRight,
  Inbox,
  LayoutDashboard,
  Map,
  MapPinned,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useGovernment } from "./GovernmentProvider";
import { Logo } from "./ui";

const primaryNav = [
  { href: "/gobierno", label: "Resumen", icon: LayoutDashboard },
  { href: "/gobierno/reportes", label: "Reportes", icon: Inbox },
  { href: "/gobierno/inteligencia", label: "Inteligencia", icon: Sparkles },
  { href: "/gobierno/resultados", label: "Resultados", icon: BarChart3 },
];

const secondaryNav = [
  { href: "/gobierno/mapa", label: "Mapa", icon: Map },
  { href: "/gobierno/colonias", label: "Colonias", icon: MapPinned },
  { href: "/gobierno/equipo", label: "Equipo", icon: Users },
  { href: "/gobierno/configuracion", label: "Configuración", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/gobierno") return pathname === "/gobierno";
  return pathname.startsWith(href);
}

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { cases, currentUser, dataSource, isDemoEnvironment } = useGovernment();
  const openCount = cases.filter(
    (item) => !["resolved", "closed"].includes(item.status),
  ).length;
  const badgeFor = (href: string) =>
    href === "/gobierno/reportes" && openCount > 0 ? String(openCount) : null;
  return (
    <>
      <button
        type="button"
        className={`gov-sidebar-scrim ${mobileOpen ? "is-visible" : ""}`}
        aria-label="Cerrar menú"
        onClick={onClose}
      />
      <aside className={`gov-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="gov-sidebar__brand">
          <Link href="/gobierno" onClick={onClose} aria-label="VotaVía Gobierno">
            <Logo />
          </Link>
          <span className="gov-sidebar__product">Gobierno</span>
          <button type="button" className="gov-sidebar__close" onClick={onClose} aria-label="Cerrar menú">
            <X size={18} />
          </button>
        </div>

        <div className="gov-org-card">
          <span className="gov-org-card__crest">CDMX</span>
          <div>
            <strong>Ciudad de México</strong>
            <span>Centro de operaciones</span>
          </div>
          <ChevronRight size={15} />
        </div>

        <nav className="gov-nav" aria-label="Navegación principal">
          <span className="gov-nav__label">Operación</span>
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            const badge = badgeFor(item.href);
            return (
              <Link
                href={item.href}
                key={item.href}
                className={`gov-nav__item ${active ? "is-active" : ""}`}
                onClick={onClose}
              >
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
                {badge ? <em>{badge}</em> : null}
              </Link>
            );
          })}
          <span className="gov-nav__label gov-nav__label--spaced">Territorio y equipo</span>
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                href={item.href}
                key={item.href}
                className={`gov-nav__item ${active ? "is-active" : ""}`}
                onClick={onClose}
              >
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="gov-sidebar__footer">
          <div className="sample-mode-card">
            <span className="sample-mode-card__pulse" />
            <div>
              <strong>{dataSource === "core" ? "Modo núcleo" : "Modo muestra"}</strong>
              <p>{dataSource === "core"
                ? "Datos de la API de Session 1; algunos cambios siguen pendientes de contrato."
                : "Acciones locales, sin efecto en la base real."}</p>
            </div>
          </div>
          <Link href="/gobierno/configuracion" className="gov-user" onClick={onClose}>
            <span className="gov-user__avatar">{currentUser.initials}</span>
            <div>
              <strong>{currentUser.name}</strong>
              <span>{currentUser.title}</span>
              {isDemoEnvironment ? <em className="gov-user__demo">Cuenta de demostración</em> : null}
            </div>
            <ChevronRight size={15} />
          </Link>
        </div>
      </aside>
    </>
  );
}
