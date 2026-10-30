"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownUp,
  ArrowRight,
  CalendarDays,
  Download,
  Filter,
  Link2,
  List,
  Map,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useGovernment } from "./GovernmentProvider";
import { CityMap } from "./CityMap";
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  COLONIAS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  formatDate,
  getDepartment,
  relativeTime,
} from "@/lib/government/display";
import type {
  CaseCategory,
  CasePriority,
  CaseStatus,
  GovernmentCase,
} from "@/lib/government/types";
import {
  CategoryBadge,
  EmptyState,
  PriorityBadge,
  SampleBadge,
  StatusBadge,
} from "./ui";

type ViewMode = "list" | "map";

const statusOrder: Record<CaseStatus, number> = {
  reported: 0,
  under_review: 1,
  assigned: 2,
  in_progress: 3,
  pending_verification: 4,
  resolved: 5,
  closed: 6,
};

const priorityOrder: Record<CasePriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function ReportCasesView() {
  const params = useSearchParams();
  const { cases, loading } = useGovernment();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CaseStatus | "all">("all");
  const [category, setCategory] = useState<CaseCategory | "all">("all");
  const [priority, setPriority] = useState<CasePriority | "all">("all");
  const [colonia, setColonia] = useState<string>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [sort, setSort] = useState<"recent" | "priority">("recent");
  const [selectedMapCase, setSelectedMapCase] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const initialStatus = params.get("status");
    const initialPriority = params.get("priority");
    if (initialStatus && initialStatus in STATUS_LABELS) {
      setStatus(initialStatus as CaseStatus);
    }
    if (initialPriority && initialPriority in PRIORITY_LABELS) {
      setPriority(initialPriority as CasePriority);
    }
  }, [params]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cases
      .filter((item) => {
        if (status !== "all" && item.status !== status) return false;
        if (category !== "all" && item.category !== category) return false;
        if (priority !== "all" && item.priority !== priority) return false;
        if (colonia !== "all" && item.colonia !== colonia) return false;
        if (!normalized) return true;
        return [item.title, item.folio, item.address, item.colonia, item.description]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => {
        if (sort === "priority") {
          return (
            priorityOrder[a.priority] - priorityOrder[b.priority] ||
            statusOrder[a.status] - statusOrder[b.status]
          );
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [cases, query, status, category, priority, colonia, sort]);

  const activeFilterCount = [status, category, priority, colonia].filter((value) => value !== "all").length;
  const openCount = filtered.filter((item) => !["resolved", "closed"].includes(item.status)).length;
  const criticalCount = filtered.filter((item) => item.priority === "critical").length;
  const unassignedCount = filtered.filter((item) => !item.departmentId).length;

  const resetFilters = () => {
    setQuery("");
    setStatus("all");
    setCategory("all");
    setPriority("all");
    setColonia("all");
  };

  const exportCsv = () => {
    const header = ["Folio", "Título", "Categoría", "Colonia", "Prioridad", "Estado", "Área", "Actualizado"];
    const rows = filtered.map((item) => [
      item.folio,
      item.title,
      CATEGORY_LABELS[item.category],
      item.colonia,
      PRIORITY_LABELS[item.priority],
      STATUS_LABELS[item.status],
      getDepartment(item.departmentId)?.shortName ?? "Sin asignar",
      item.updatedAt,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "votavia-reportes-muestra.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="page-heading__eyebrow">
            <span className="eyebrow">Mesa de gobierno</span>
            <SampleBadge />
          </div>
          <h1>Bandeja de reportes</h1>
          <p>Revisa, prioriza y canaliza los reportes ciudadanos de la ciudad.</p>
        </div>
        <div className="page-heading__actions">
          <button type="button" className="button button--secondary" onClick={exportCsv}>
            <Download size={16} /> Exportar CSV
          </button>
          <Link href="/gobierno/mapa" className="button button--primary">
            <Map size={16} /> Ver mapa
          </Link>
        </div>
      </div>

      <div className="inbox-summary">
        <div><span>Resultados</span><strong>{filtered.length}</strong></div>
        <div><span>Abiertos</span><strong>{openCount}</strong></div>
        <div><span>Críticos</span><strong className="text-danger">{criticalCount}</strong></div>
        <div><span>Sin asignar</span><strong>{unassignedCount}</strong></div>
        <div className="inbox-summary__hint"><Filter size={15} /> {activeFilterCount} filtros activos</div>
      </div>

      <section className="inbox-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar folio, título, dirección o colonia"
            aria-label="Buscar reportes"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={14} /></button>
          ) : null}
        </label>

        <div className={`inbox-filters ${filtersOpen ? "is-open" : ""}`}>
          <select value={category} onChange={(event) => setCategory(event.target.value as CaseCategory | "all")} aria-label="Filtrar por categoría">
            <option value="all">Todas las categorías</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value as CaseStatus | "all")} aria-label="Filtrar por estado">
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value as CasePriority | "all")} aria-label="Filtrar por prioridad">
            <option value="all">Toda prioridad</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={colonia} onChange={(event) => setColonia(event.target.value)} aria-label="Filtrar por colonia">
            <option value="all">Todas las colonias</option>
            {COLONIAS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {activeFilterCount > 0 ? (
            <button type="button" className="filter-clear" onClick={resetFilters}>Limpiar</button>
          ) : null}
        </div>

        <button type="button" className="filter-mobile-toggle" onClick={() => setFiltersOpen((value) => !value)}>
          <SlidersHorizontal size={16} /> Filtros {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
        </button>

        <div className="inbox-toolbar__view">
          <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} aria-label="Vista de lista">
            <List size={16} />
          </button>
          <button type="button" className={view === "map" ? "is-active" : ""} onClick={() => setView("map")} aria-label="Vista de mapa">
            <Map size={16} />
          </button>
        </div>
      </section>

      <div className="inbox-sortbar">
        <span>{filtered.length} casos · Datos de muestra</span>
        <label>
          <ArrowDownUp size={14} />
          <select value={sort} onChange={(event) => setSort(event.target.value as "recent" | "priority")}>
            <option value="recent">Actualizados recientemente</option>
            <option value="priority">Mayor prioridad</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="case-table-skeleton" aria-label="Cargando reportes">
          {Array.from({ length: 5 }).map((_, index) => <span key={index} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No hay casos con estos filtros"
          detail="Prueba con otro estado, colonia o término de búsqueda."
          action={<button type="button" className="button button--secondary button--small" onClick={resetFilters}>Limpiar filtros</button>}
        />
      ) : view === "map" ? (
        <div className="case-map-layout">
          <section className="panel case-map-panel">
            <div className="panel__head">
              <div><span className="eyebrow">Vista territorial</span><h2>{filtered.length} casos filtrados</h2></div>
              <span className="map-note"><MapPin size={14} /> Toca un punto para inspeccionarlo</span>
            </div>
            <CityMap
              cases={filtered}
              activeCaseId={selectedMapCase}
              onSelectCase={(id) => setSelectedMapCase(id)}
            />
          </section>
          <div className="case-map-list">
            {filtered.map((item) => (
              <button
                type="button"
                className={`case-map-list__item ${selectedMapCase === item.id ? "is-active" : ""}`}
                key={item.id}
                onClick={() => setSelectedMapCase(item.id)}
              >
                <div className="case-map-list__top">
                  <span>{item.folio}</span>
                  <PriorityBadge priority={item.priority} compact />
                </div>
                <strong>{item.title}</strong>
                <p><MapPin size={13} /> {item.colonia}</p>
                <div className="case-map-list__foot">
                  <StatusBadge status={item.status} />
                  <Link href={`/gobierno/reportes/${item.id}`}>Abrir <ArrowRight size={13} /></Link>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="case-table-wrap">
            <table className="case-table">
              <thead>
                <tr>
                  <th>Caso</th>
                  <th>Categoría</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Colonia</th>
                  <th>Asignación</th>
                  <th>Actualizado</th>
                  <th aria-label="Abrir" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const department = getDepartment(item.departmentId);
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/gobierno/reportes/${item.id}`} className="case-table__case">
                          <span className="case-table__thumb">
                            <img src={item.photos[0]?.url} alt="" />
                          </span>
                          <span>
                            <strong>{item.title}</strong>
                            <small>{item.folio} · {item.address}</small>
                            {item.relatedCaseIds.length > 0 ? (
                              <em className="related-indicator"><Link2 size={11} /> {item.relatedCaseIds.length} relacionado{item.relatedCaseIds.length > 1 ? "s" : ""}</em>
                            ) : null}
                          </span>
                        </Link>
                      </td>
                      <td><CategoryBadge category={item.category} /></td>
                      <td><PriorityBadge priority={item.priority} /></td>
                      <td><StatusBadge status={item.status} /></td>
                      <td>
                        <span className="colonia-cell"><MapPin size={13} /> {item.colonia}</span>
                      </td>
                      <td>
                        {department ? (
                          <span className="department-chip">
                            <i style={{ background: department.color }} />
                            {department.shortName}
                          </span>
                        ) : (
                          <span className="unassigned-chip">Sin asignar</span>
                        )}
                      </td>
                      <td>
                        <span className="updated-cell">
                          {relativeTime(item.updatedAt)}
                          <small><CalendarDays size={11} /> {formatDate(item.updatedAt)}</small>
                        </span>
                      </td>
                      <td>
                        <Link href={`/gobierno/reportes/${item.id}`} className="table-arrow" aria-label={`Abrir ${item.folio}`}>
                          <ArrowRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="case-card-grid">
            {filtered.map((item) => <MobileCaseCard key={item.id} item={item} />)}
          </div>
        </>
      )}
    </div>
  );
}

function MobileCaseCard({ item }: { item: GovernmentCase }) {
  const department = getDepartment(item.departmentId);
  return (
    <Link href={`/gobierno/reportes/${item.id}`} className="mobile-case-card">
      <div className="mobile-case-card__media">
        <img src={item.photos[0]?.url} alt="" />
        <PriorityBadge priority={item.priority} compact />
      </div>
      <div className="mobile-case-card__body">
        <div className="mobile-case-card__meta">
          <span>{item.folio}</span>
          <StatusBadge status={item.status} />
        </div>
        <strong>{item.title}</strong>
        <p><MapPin size={13} /> {item.colonia} · {CATEGORY_SHORT_LABELS[item.category]}</p>
        <div className="mobile-case-card__foot">
          <span>{department?.shortName ?? "Sin asignar"}</span>
          {item.relatedCaseIds.length > 0 ? <span><Link2 size={12} /> {item.relatedCaseIds.length}</span> : null}
          <time>{relativeTime(item.updatedAt)}</time>
        </div>
      </div>
    </Link>
  );
}
