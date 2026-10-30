"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Filter,
  Inbox,
  Layers3,
  MapPin,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useGovernment } from "./GovernmentProvider";
import { CityMap } from "./CityMap";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  formatDate,
  getDepartment,
  relativeTime,
} from "@/lib/government/display";
import type { CaseCategory, CasePriority, GovernmentCase } from "@/lib/government/types";
import {
  CategoryBadge,
  EmptyState,
  InitialsAvatar,
  PriorityBadge,
  SampleBadge,
  StatusBadge,
} from "./ui";

export function MapView() {
  const { cases, loading } = useGovernment();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CaseCategory | "all">("all");
  const [priority, setPriority] = useState<CasePriority | "all">("all");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cases.filter((item) => {
      if (onlyOpen && ["resolved", "closed"].includes(item.status)) return false;
      if (category !== "all" && item.category !== category) return false;
      if (priority !== "all" && item.priority !== priority) return false;
      if (!normalized) return true;
      return [item.title, item.folio, item.address, item.colonia]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [cases, category, onlyOpen, priority, query]);

  // Derived selection: keeps the map and list in sync when filters hide the
  // currently selected case, without a state-syncing effect.
  const activeId = filtered.some((item) => item.id === selectedId)
    ? selectedId
    : (filtered[0]?.id ?? null);

  const selected = cases.find((item) => item.id === activeId) ?? null;
  const openCount = filtered.filter((item) => !["resolved", "closed"].includes(item.status)).length;
  const criticalCount = filtered.filter((item) => ["critical", "high"].includes(item.priority)).length;
  const colonias = new Set(filtered.map((item) => item.colonia)).size;

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setPriority("all");
    setOnlyOpen(true);
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="page-heading__eyebrow">
            <span className="eyebrow">Lectura territorial</span>
            <SampleBadge />
          </div>
          <h1>Mapa operativo</h1>
          <p>Explora la concentración de reportes y abre cada expediente desde el territorio.</p>
        </div>
        <Link href="/gobierno/reportes" className="button button--secondary">
          <Inbox size={16} /> Ver bandeja completa
        </Link>
      </div>

      <div className="map-ops-stats">
        <div><span className="map-ops-stats__icon"><MapPin size={18} /></span><div><strong>{filtered.length}</strong><span>Puntos visibles</span></div></div>
        <div><span className="map-ops-stats__icon"><Inbox size={18} /></span><div><strong>{openCount}</strong><span>Reportes abiertos</span></div></div>
        <div><span className="map-ops-stats__icon"><ShieldAlert size={18} /></span><div><strong>{criticalCount}</strong><span>Alta prioridad</span></div></div>
        <div><span className="map-ops-stats__icon"><Layers3 size={18} /></span><div><strong>{colonias}</strong><span>Colonias</span></div></div>
      </div>

      <section className="map-filterbar">
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar folio, caso o colonia"
            aria-label="Buscar en el mapa"
          />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={14} /></button> : null}
        </label>
        <label className="minimal-select">
          <Filter size={14} />
          <select value={category} onChange={(event) => setCategory(event.target.value as CaseCategory | "all")} aria-label="Filtrar mapa por categoría">
            <option value="all">Todas las categorías</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="minimal-select">
          <ShieldAlert size={14} />
          <select value={priority} onChange={(event) => setPriority(event.target.value as CasePriority | "all")} aria-label="Filtrar mapa por prioridad">
            <option value="all">Toda prioridad</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="button" className={`map-filterbar__toggle ${onlyOpen ? "is-active" : ""}`} onClick={() => setOnlyOpen((value) => !value)}>
          <span /> Solo casos abiertos
        </button>
        {query || category !== "all" || priority !== "all" || !onlyOpen ? (
          <button type="button" className="filter-clear" onClick={clearFilters}>Limpiar</button>
        ) : null}
      </section>

      {loading ? (
        <div className="map-ops-loading skeleton-card"><span className="skeleton" /><span className="skeleton" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No hay puntos con estos filtros"
          detail="Cambia la categoría, la prioridad o incluye casos cerrados."
          action={<button type="button" className="button button--secondary button--small" onClick={clearFilters}>Restablecer mapa</button>}
        />
      ) : (
        <div className="map-ops-layout">
          <section className="panel map-ops-canvas">
            <div className="panel__head">
              <div><span className="eyebrow">Ciudad de México</span><h2>{filtered.length} reportes en el mapa</h2></div>
              <span className="map-note"><i className="signal-dot" /> Selecciona un punto</span>
            </div>
            <CityMap
              cases={filtered}
              activeCaseId={activeId}
              onSelectCase={setSelectedId}
              showLabels
            />
            <p className="map-disclaimer">Mapa esquemático de muestra. Las posiciones agrupan referencias y no sustituyen una cartografía oficial.</p>
          </section>

          <aside className="map-ops-side">
            {selected ? <SelectedCase item={selected} /> : null}
            <section className="panel map-ops-queue">
              <div className="panel__head">
                <div><span className="eyebrow">Cola territorial</span><h2>Casos visibles</h2></div>
                <span>{filtered.length}</span>
              </div>
              <div className="map-queue-list">
                {filtered.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={activeId === item.id ? "is-active" : ""}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className={`map-queue-list__priority map-queue-list__priority--${item.priority}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.folio} · {item.colonia}</span>
                    </div>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function SelectedCase({ item }: { item: GovernmentCase }) {
  const department = getDepartment(item.departmentId);
  const citizenInitials = item.citizen.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <section className="panel map-case-card">
      <div className="map-case-card__image">
        <img src={item.photos[0]?.url} alt={item.photos[0]?.alt ?? ""} />
        <PriorityBadge priority={item.priority} compact />
      </div>
      <div className="map-case-card__body">
        <div className="map-case-card__badges">
          <span className="case-folio">{item.folio}</span>
          <StatusBadge status={item.status} />
        </div>
        <h2>{item.title}</h2>
        <p className="map-case-card__location"><MapPin size={14} /> {item.address} · {item.colonia}</p>
        <div className="map-case-card__details">
          <span><CategoryBadge category={item.category} /></span>
          <span><Building2 size={13} /> {department?.shortName ?? "Sin asignar"}</span>
          <span>{STATUS_LABELS[item.status]} · {relativeTime(item.updatedAt)}</span>
        </div>
        <div className="map-case-card__citizen">
          <InitialsAvatar initials={citizenInitials} tone="blue" size="sm" />
          <div>
            <strong>{item.citizen.supportCount} apoyos ciudadanos</strong>
            <span>Reportado el {formatDate(item.reportedAt)}</span>
          </div>
        </div>
        <Link href={`/gobierno/reportes/${item.id}`} className="button button--primary button--full">
          Abrir expediente <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
