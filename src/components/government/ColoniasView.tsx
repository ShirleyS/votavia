"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useGovernment } from "./GovernmentProvider";
import { CategoryBars } from "./charts";
import { CityMap } from "./CityMap";
import {
  CATEGORY_SHORT_LABELS,
  relativeTime,
} from "@/lib/government/display";
import type { CategoryCount, GovernmentCase } from "@/lib/government/types";
import {
  CategoryBadge,
  EmptyState,
  PriorityBadge,
  ProgressBar,
  SampleBadge,
  StatusBadge,
} from "./ui";

type SortMode = "volume" | "priority" | "completion";

interface ColoniaSummary {
  name: string;
  total: number;
  open: number;
  priority: number;
  resolved: number;
  completion: number;
}

export function ColoniasView() {
  const { cases, loading } = useGovernment();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("volume");
  const [selected, setSelected] = useState<string | null>(null);

  const summaries = useMemo<ColoniaSummary[]>(() => {
    const grouped = new Map<string, ColoniaSummary>();
    cases.forEach((item) => {
      const current = grouped.get(item.colonia) ?? {
        name: item.colonia,
        total: 0,
        open: 0,
        priority: 0,
        resolved: 0,
        completion: 0,
      };
      current.total += 1;
      if (["resolved", "closed"].includes(item.status)) current.resolved += 1;
      else current.open += 1;
      if (["critical", "high"].includes(item.priority)) current.priority += 1;
      grouped.set(item.colonia, current);
    });
    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        completion: item.total ? Math.round((item.resolved / item.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [cases]);

  const filteredSummaries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return summaries
      .filter((item) => item.name.toLowerCase().includes(normalized))
      .sort((a, b) => {
        if (sort === "priority") return b.priority - a.priority || b.total - a.total;
        if (sort === "completion") return b.completion - a.completion || b.total - a.total;
        return b.total - a.total;
      });
  }, [query, sort, summaries]);

  // Derived selection: fall back to the first colonia when the current pick is
  // gone (filter change, data refresh) without a state-syncing effect.
  const activeSelection =
    selected && summaries.some((item) => item.name === selected)
      ? selected
      : (summaries[0]?.name ?? null);

  const selectedSummary = summaries.find((item) => item.name === activeSelection) ?? null;
  const selectedCases = cases.filter((item) => item.colonia === activeSelection);
  const selectedCategories = useMemo<CategoryCount[]>(() => {
    const counts = new Map<GovernmentCase["category"], number>();
    selectedCases.forEach((item) => {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedCases]);

  const totalOpen = summaries.reduce((sum, item) => sum + item.open, 0);
  const totalResolved = summaries.reduce((sum, item) => sum + item.resolved, 0);
  const topPriority = [...summaries].sort((a, b) => b.priority - a.priority)[0];

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="page-heading__eyebrow">
            <span className="eyebrow">Comparativa territorial</span>
            <SampleBadge />
          </div>
          <h1>Colonias</h1>
          <p>Compara volumen, prioridad y avance de cierre entre zonas de la muestra.</p>
        </div>
        <Link href="/gobierno/mapa" className="button button--secondary">
          <MapPin size={16} /> Abrir mapa operativo
        </Link>
      </div>

      <div className="colonia-overview">
        <div><span><Building2 size={18} /></span><strong>{summaries.length}</strong><small>colonias con reportes</small></div>
        <div><span><MapPin size={18} /></span><strong>{totalOpen}</strong><small>casos abiertos</small></div>
        <div><span><CheckCircle2 size={18} /></span><strong>{totalResolved}</strong><small>casos cerrados</small></div>
        <div><span><ShieldAlert size={18} /></span><strong>{topPriority?.name ?? "Sin datos"}</strong><small>mayor prioridad · {topPriority?.priority ?? 0} casos</small></div>
      </div>

      <div className="colonia-layout">
        <section className="panel colonia-ranking">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Ranking operativo</span>
              <h2>Comparativa de colonias</h2>
            </div>
            <label className="minimal-select">
              <ArrowUpDown size={14} />
              <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="Ordenar colonias">
                <option value="volume">Por volumen</option>
                <option value="priority">Por prioridad</option>
                <option value="completion">Por avance de cierre</option>
              </select>
            </label>
          </div>
          <label className="search-field colonia-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar colonia" aria-label="Buscar colonia" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={14} /></button> : null}
          </label>

          {loading ? (
            <div className="colonia-skeleton"><span /><span /><span /><span /></div>
          ) : filteredSummaries.length === 0 ? (
            <EmptyState title="No encontramos esa colonia" detail="Prueba con otro nombre o limpia la búsqueda." />
          ) : (
            <>
              <div className="colonia-table-wrap">
                <table className="colonia-table">
                  <thead>
                    <tr>
                      <th>Colonia</th>
                      <th>Total</th>
                      <th>Abiertos</th>
                      <th>Prioridad</th>
                      <th>Cierre</th>
                      <th aria-label="Seleccionar" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSummaries.map((item) => (
                      <tr
                        key={item.name}
                        className={activeSelection === item.name ? "is-selected" : ""}
                        onClick={() => setSelected(item.name)}
                      >
                        <td>
                          <button type="button" className="colonia-name-button" onClick={() => setSelected(item.name)}>
                            <span className="colonia-cell"><MapPin size={13} /> {item.name}</span>
                          </button>
                        </td>
                        <td><strong>{item.total}</strong></td>
                        <td>{item.open}</td>
                        <td><span className={`colonia-priority ${item.priority > 1 ? "is-high" : ""}`}>{item.priority}</span></td>
                        <td>
                          <span className="colonia-progress">
                            <ProgressBar value={item.completion} tone={item.completion >= 50 ? "green" : "amber"} />
                            <small>{item.completion}%</small>
                          </span>
                        </td>
                        <td><button type="button" className="table-arrow" onClick={() => setSelected(item.name)} aria-label={`Ver ${item.name}`}><ChevronRight size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="colonia-mobile-list">
                {filteredSummaries.map((item) => (
                  <button
                    type="button"
                    key={item.name}
                    className={activeSelection === item.name ? "is-selected" : ""}
                    onClick={() => setSelected(item.name)}
                  >
                    <div><strong>{item.name}</strong><span>{item.total} casos · {item.open} abiertos</span></div>
                    <div className="colonia-mobile-list__bar">
                      <ProgressBar value={item.completion} tone={item.completion >= 50 ? "green" : "amber"} />
                      <small>{item.completion}%</small>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="colonia-detail-column">
          {selectedSummary ? (
            <section className="panel colonia-detail">
              <div className="colonia-detail__head">
                <div>
                  <span className="eyebrow">Ficha territorial</span>
                  <h2>{selectedSummary.name}</h2>
                  <p>{selectedSummary.total} reportes en el expediente de muestra.</p>
                </div>
                <span
                  className="colonia-score"
                  style={{ background: `conic-gradient(var(--blue) ${selectedSummary.completion}%, #eef2f9 0)` }}
                >
                  <span className="colonia-score__value">
                    {selectedSummary.completion}%<small>cierre</small>
                  </span>
                </span>
              </div>
              <div className="colonia-detail__stats">
                <div><span>Abiertos</span><strong>{selectedSummary.open}</strong></div>
                <div><span>Prioridad alta</span><strong>{selectedSummary.priority}</strong></div>
                <div><span>Cerrados</span><strong>{selectedSummary.resolved}</strong></div>
              </div>
              <div className="colonia-mini-map">
                <CityMap cases={selectedCases} compact showLabels={false} activeCaseId={selectedCases[0]?.id} />
              </div>
              {selectedCategories.length ? <CategoryBars data={selectedCategories} /> : null}
            </section>
          ) : null}

          <section className="panel colonia-cases-panel">
            <div className="panel__head">
              <div><span className="eyebrow">Expedientes</span><h2>Casos de {activeSelection ?? "la colonia"}</h2></div>
              <span>{selectedCases.length}</span>
            </div>
            <div className="colonia-case-list">
              {selectedCases.map((item) => (
                <Link href={`/gobierno/reportes/${item.id}`} className="colonia-case-item" key={item.id}>
                  <span className="colonia-case-item__thumb"><img src={item.photos[0]?.url} alt="" /></span>
                  <div>
                    <div className="colonia-case-item__top">
                      <span>{item.folio}</span>
                      <PriorityBadge priority={item.priority} compact />
                    </div>
                    <strong>{item.title}</strong>
                    <div className="colonia-case-item__meta">
                      <CategoryBadge category={item.category} />
                      <StatusBadge status={item.status} />
                    </div>
                    <small>{CATEGORY_SHORT_LABELS[item.category]} · {relativeTime(item.updatedAt)}</small>
                  </div>
                  <ArrowRight size={15} />
                </Link>
              ))}
              {selectedCases.length === 0 ? <p className="analysis-empty">No hay casos para esta colonia.</p> : null}
            </div>
          </section>
        </aside>
      </div>

      <div className="sample-data-footer">
        <SampleBadge>Datos de muestra</SampleBadge>
        <p>La comparativa usa los reportes ficticios de este navegador. No representa un corte oficial por colonia.</p>
      </div>
    </div>
  );
}
