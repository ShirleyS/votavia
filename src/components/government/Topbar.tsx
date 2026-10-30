"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Check,
  ChevronDown,
  Command,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { DEMO_ROLE_LABELS, getDepartment } from "@/lib/government/display";
import { useGovernment } from "./GovernmentProvider";
import { PriorityBadge, StatusBadge } from "./ui";

const routeLabels: Record<string, string> = {
  "/gobierno": "Resumen operativo",
  "/gobierno/reportes": "Reportes",
  "/gobierno/inteligencia": "Inteligencia preventiva",
  "/gobierno/resultados": "Resultados",
  "/gobierno/mapa": "Mapa operativo",
  "/gobierno/colonias": "Colonias",
  "/gobierno/equipo": "Equipo",
  "/gobierno/configuracion": "Configuración",
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { cases, currentUser, demoUsers, switchDemoUser } = useGovernment();
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  const title = pathname.includes("/gobierno/reportes/")
    ? "Detalle del caso"
    : routeLabels[pathname] ?? "Gobierno";

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return cases.slice(0, 5);
    return cases
      .filter((item) =>
        [item.title, item.folio, item.colonia, item.address]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 7);
  }, [cases, query]);

  const today = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const selectCase = (id: string) => {
    setSearchOpen(false);
    setQuery("");
    router.push(`/gobierno/reportes/${id}`);
  };

  return (
    <header className="gov-topbar">
      <div className="gov-topbar__left">
        <button type="button" className="gov-topbar__menu" onClick={onMenu} aria-label="Abrir menú">
          <Menu size={20} />
        </button>
        <div className="gov-breadcrumb">
          <span>Gobierno CDMX</span>
          <i>/</i>
          <strong>{title}</strong>
        </div>
      </div>

      <div className="gov-topbar__right">
        <button type="button" className="gov-search-trigger" onClick={() => setSearchOpen(true)}>
          <Search size={16} />
          <span>Buscar folio, colonia o caso</span>
          <kbd><Command size={11} /> K</kbd>
        </button>
        <span className="gov-topbar__date">{today}</span>
        <div className="gov-notification-wrap">
          <button
            type="button"
            className="gov-icon-button"
            onClick={() => setNotificationsOpen((value) => !value)}
            aria-label="Notificaciones"
            aria-expanded={notificationsOpen}
          >
            <Bell size={18} />
            <span className="gov-notification-dot" />
          </button>
          {notificationsOpen ? (
            <div className="gov-notification-panel">
              <div className="gov-notification-panel__head">
                <strong>Actividad reciente</strong>
                <button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Cerrar">
                  <X size={15} />
                </button>
              </div>
              {cases.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  href={`/gobierno/reportes/${item.id}`}
                  onClick={() => setNotificationsOpen(false)}
                  className="gov-notification-item"
                >
                  <span className={`gov-notification-item__icon gov-notification-item__icon--${item.priority}`} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.colonia} · {item.folio}</span>
                  </div>
                </Link>
              ))}
              <Link href="/gobierno/reportes" className="gov-notification-panel__all" onClick={() => setNotificationsOpen(false)}>
                Ver todos los reportes
              </Link>
            </div>
          ) : null}
        </div>
        <div className="gov-profile-wrap">
          <button
            type="button"
            className="gov-profile-button"
            aria-label="Cuenta de demostración"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((value) => !value)}
          >
            <span>{currentUser.initials}</span>
            <ChevronDown size={14} />
          </button>
          {profileOpen ? (
            <>
              <button
                type="button"
                className="gov-profile-scrim"
                aria-label="Cerrar menú de cuenta"
                onClick={() => setProfileOpen(false)}
              />
              <div className="gov-profile-menu" role="menu" aria-label="Cambiar cuenta de demostración">
                <div className="gov-profile-menu__head">
                  <span className="gov-profile-menu__avatar">{currentUser.initials}</span>
                  <div>
                    <strong>{currentUser.name}</strong>
                    <span>{currentUser.title}</span>
                  </div>
                </div>
                <div className="gov-profile-menu__scope">
                  <ShieldCheck size={14} />
                  <div>
                    <strong>{DEMO_ROLE_LABELS[currentUser.role]}</strong>
                    <span>{currentUser.organizationName}</span>
                  </div>
                </div>
                <span className="gov-profile-menu__label">Cambiar cuenta de demostración</span>
                {demoUsers.map((user) => (
                  <button
                    type="button"
                    key={user.id}
                    role="menuitemradio"
                    aria-checked={user.id === currentUser.id}
                    className={`gov-profile-option ${user.id === currentUser.id ? "is-active" : ""}`}
                    onClick={() => {
                      switchDemoUser(user.id);
                      setProfileOpen(false);
                    }}
                  >
                    <span className="gov-profile-option__avatar">{user.initials}</span>
                    <div>
                      <strong>{user.name}</strong>
                      <span>
                        {DEMO_ROLE_LABELS[user.role]}
                        {user.departmentId ? ` · ${getDepartment(user.departmentId)?.shortName ?? user.departmentId}` : " · Toda la mesa"}
                      </span>
                    </div>
                    {user.id === currentUser.id ? <Check size={15} /> : null}
                  </button>
                ))}
                <p className="gov-profile-menu__note">
                  <ShieldCheck size={13} /> Cuentas ficticias de demostración. No representan funcionarios reales ni una adopción oficial.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {searchOpen ? (
        <div className="gov-command-overlay" role="dialog" aria-modal="true" aria-label="Buscar casos">
          <button type="button" className="gov-command-overlay__scrim" onClick={() => setSearchOpen(false)} aria-label="Cerrar búsqueda" />
          <div className="gov-command">
            <div className="gov-command__input">
              <Search size={18} />
              <input
                ref={searchInput}
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por folio, título, dirección o colonia…"
              />
              <kbd>ESC</kbd>
            </div>
            <div className="gov-command__results">
              <span className="gov-command__label">{query ? `${results.length} resultados` : "Casos recientes"}</span>
              {results.map((item) => (
                <button key={item.id} type="button" onClick={() => selectCase(item.id)}>
                  <div className="gov-command__result-main">
                    <strong>{item.title}</strong>
                    <span>{item.folio} · {item.colonia}</span>
                  </div>
                  <div className="gov-command__result-badges">
                    <PriorityBadge priority={item.priority} compact />
                    <StatusBadge status={item.status} />
                  </div>
                </button>
              ))}
              {results.length === 0 ? (
                <p className="gov-command__empty">No encontramos casos con ese término.</p>
              ) : null}
            </div>
            <div className="gov-command__footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> para navegar</span>
              <span><kbd>↵</kbd> para abrir</span>
              <span>Solo datos de muestra</span>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
