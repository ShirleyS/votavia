"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarRange,
  Check,
  CircleAlert,
  ClipboardList,
  Filter,
  Info,
  Layers3,
  MapPin,
  Radar,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { governmentService } from "@/lib/government/mock-service";
import type { CaseCategory, RiskSignal, RiskStrength } from "@/lib/government/types";
import {
  CATEGORY_COLORS,
  CATEGORY_SHORT_LABELS,
  STRENGTH_LABELS,
  formatDate,
  getDepartment,
} from "@/lib/government/display";
import { useGovernment } from "./GovernmentProvider";
import { CityMap } from "./CityMap";
import { Sparkline } from "./charts";
import { SampleBadge } from "./ui";

const strengthOptions: { value: RiskStrength | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "emerging", label: "Emergentes" },
  { value: "recurring", label: "Recurrentes" },
  { value: "observed", label: "Observadas" },
];

const historyRows = [
  { label: "Fugas de agua", category: "agua" as CaseCategory, current: 17, previous: 11, yearAgo: 9 },
  { label: "Luminarias fuera", category: "alumbrado" as CaseCategory, current: 12, previous: 14, yearAgo: 10 },
  { label: "Drenaje saturado", category: "drenaje" as CaseCategory, current: 9, previous: 5, yearAgo: 4 },
  { label: "Residuos voluminosos", category: "residuos" as CaseCategory, current: 8, previous: 6, yearAgo: 7 },
  { label: "Baches en obra reciente", category: "baches" as CaseCategory, current: 11, previous: 8, yearAgo: 6 },
];

export function PreventiveIntelligenceView() {
  const router = useRouter();
  const { cases } = useGovernment();
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [selectedId, setSelectedId] = useState("risk-1");
  const [strength, setStrength] = useState<RiskStrength | "all">("all");
  const [category, setCategory] = useState<CaseCategory | "all">("all");
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    void governmentService.getPreventiveSignals().then((value) => {
      setSignals(value);
      setSelectedId((current) =>
        value.some((item) => item.id === current) ? current : (value[0]?.id ?? ""),
      );
    });
  }, []);

  const filtered = useMemo(
    () =>
      signals.filter((signal) => {
        if (strength !== "all" && signal.strength !== strength) return false;
        if (category !== "all" && signal.category !== category) return false;
        return true;
      }),
    [signals, strength, category],
  );

  const selected = signals.find((signal) => signal.id === selectedId) ?? filtered[0] ?? signals[0];
  const selectedDepartment = selected ? getDepartment(selected.suggestedDepartmentId) : undefined;
  const sampleCases = cases.filter((item) => !["resolved", "closed"].includes(item.status)).slice(0, 7);
  const uniqueColonias = new Set(signals.flatMap((signal) => signal.colonias)).size;
  const totalReports = signals.reduce((sum, signal) => sum + signal.reportCount, 0);

  const toggleSaved = (id: string) => {
    setSaved((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="page-heading__eyebrow">
            <span className="eyebrow">Observación territorial</span>
            <SampleBadge>Datos de muestra</SampleBadge>
          </div>
          <h1>Inteligencia preventiva</h1>
          <p>Concentraciones y patrones observados para orientar inspecciones, no predicciones.</p>
        </div>
        <Link href="/gobierno/resultados" className="button button--secondary">
          <TrendingUp size={16} /> Ver resultados
        </Link>
      </div>

      <div className="preventive-disclaimer">
        <span className="preventive-disclaimer__icon"><Info size={19} /></span>
        <div>
          <strong>Esta vista no contiene pronósticos</strong>
          <p>
            Las señales describen concentraciones y coincidencias observadas en datos de muestra.
            No hay probabilidades calculadas, ni un modelo de predicción entrenado en esta versión.
            Cada señal requiere validación humana y una inspección en campo.
          </p>
        </div>
        <span className="preventive-disclaimer__tag">Muestra analítica</span>
      </div>

      <div className="preventive-metrics">
        <div><span className="preventive-metric__icon"><Radar size={18} /></span><div><strong>{signals.length}</strong><span>Señales observadas</span></div></div>
        <div><span className="preventive-metric__icon"><Layers3 size={18} /></span><div><strong>{signals.filter((signal) => signal.strength === "recurring").length}</strong><span>Patrones recurrentes</span></div></div>
        <div><span className="preventive-metric__icon"><MapPin size={18} /></span><div><strong>{uniqueColonias}</strong><span>Colonias involucradas</span></div></div>
        <div><span className="preventive-metric__icon"><ClipboardList size={18} /></span><div><strong>{totalReports}</strong><span>Reportes de referencia</span></div></div>
      </div>

      <div className="preventive-toolbar">
        <div className="filter-chips" role="group" aria-label="Filtrar por tipo de señal">
          {strengthOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={strength === option.value ? "is-active" : ""}
              onClick={() => setStrength(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="minimal-select">
          <Filter size={14} />
          <select value={category} onChange={(event) => setCategory(event.target.value as CaseCategory | "all")} aria-label="Filtrar por categoría">
            <option value="all">Todas las categorías</option>
            {Object.entries(CATEGORY_SHORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="preventive-layout">
        <section className="panel preventive-map-panel">
          <div className="panel__head">
            <div><span className="eyebrow">Concentraciones</span><h2>Mapa de señales</h2></div>
            <span className="map-note"><i className="signal-dot" /> Señal observada</span>
          </div>
          <CityMap
            cases={sampleCases}
            signals={filtered}
            showSignals
            activeSignalId={selected?.id}
            onSelectSignal={(id) => setSelectedId(id)}
            onSelectCase={(id) => router.push(`/gobierno/reportes/${id}`)}
          />
          <p className="preventive-map-note">Los anillos agrupan reportes con características similares. No representan incidencia oficial ni predicción de riesgo.</p>
        </section>

        <section className="panel signal-list-panel">
          <div className="panel__head">
            <div><span className="eyebrow">Señales activas</span><h2>{filtered.length} patrones para revisar</h2></div>
          </div>
          <div className="signal-list">
            {filtered.map((signal) => (
              <button
                type="button"
                key={signal.id}
                className={`signal-list__item ${selected?.id === signal.id ? "is-active" : ""}`}
                onClick={() => setSelectedId(signal.id)}
              >
                <div className="signal-list__top">
                  <span className={`signal-strength signal-strength--${signal.strength}`}>
                    {STRENGTH_LABELS[signal.strength]}
                  </span>
                  <Sparkline values={signal.sparkline} color={CATEGORY_COLORS[signal.category]} width={58} height={22} />
                </div>
                <strong>{signal.title}</strong>
                <p><MapPin size={12} /> {signal.colonias.join(" · ")}</p>
                <div className="signal-list__foot">
                  <span>{signal.reportCount} reportes</span>
                  <span>{signal.windowLabel}</span>
                  <ArrowRight size={14} />
                </div>
              </button>
            ))}
            {filtered.length === 0 ? <p className="analysis-empty">No hay señales para estos filtros.</p> : null}
          </div>
        </section>
      </div>

      {selected ? (
        <section className="panel signal-detail">
          <div className="signal-detail__main">
            <div className="signal-detail__heading">
              <span className={`signal-strength signal-strength--${selected.strength}`}>{STRENGTH_LABELS[selected.strength]}</span>
              <span className="signal-category" style={{ color: CATEGORY_COLORS[selected.category] }}>
                <i style={{ background: CATEGORY_COLORS[selected.category] }} /> {CATEGORY_SHORT_LABELS[selected.category]}
              </span>
            </div>
            <h2>{selected.title}</h2>
            <p className="signal-detail__description">{selected.description}</p>
            <div className="signal-detail__stats">
              <div><span>Reportes de referencia</span><strong>{selected.reportCount}</strong></div>
              <div><span>Ventana observada</span><strong>{selected.windowLabel}</strong></div>
              <div><span>Colonias</span><strong>{selected.colonias.join(", ")}</strong></div>
            </div>
            <div className="signal-evidence">
              <span><BookOpenCheck size={17} /></span>
              <div><strong>Evidencia observada</strong><p>{selected.evidence}</p></div>
            </div>
            <div className="signal-recommendation">
              <span><ScanSearch size={17} /></span>
              <div><strong>Inspección sugerida</strong><p>{selected.recommendation}</p></div>
            </div>
          </div>
          <aside className="signal-detail__aside">
            <span className="eyebrow">Área sugerida</span>
            {selectedDepartment ? (
              <div className="signal-department">
                <span style={{ background: `${selectedDepartment.color}18`, color: selectedDepartment.color }}><ShieldAlert size={18} /></span>
                <strong>{selectedDepartment.name}</strong>
              </div>
            ) : null}
            <button type="button" className={`button button--full ${saved.includes(selected.id) ? "button--success-ghost" : "button--primary"}`} onClick={() => toggleSaved(selected.id)}>
              {saved.includes(selected.id) ? <><Check size={16} /> Añadida a inspecciones</> : <><ClipboardList size={16} /> Añadir a lista de inspección</>}
            </button>
            <p className="signal-detail__note"><Info size={13} /> La lista es local y no crea una orden real.</p>
            <hr />
            <span className="eyebrow">Trazabilidad</span>
            <div className="signal-trace">
              <span><CalendarRange size={14} /> Observado desde el 15 de septiembre</span>
              <span><BadgeCheck size={14} /> 100% datos de muestra</span>
              <span><CircleAlert size={14} /> Requiere inspección en campo</span>
            </div>
          </aside>
        </section>
      ) : null}

      <div className="preventive-lower-grid">
        <section className="panel historical-comparison">
          <div className="panel__head">
            <div><span className="eyebrow">Comparación histórica</span><h2>Incidentes por periodo</h2><p>Conteos observados en la muestra; no series oficiales.</p></div>
            <span className="sample-mini">Muestra</span>
          </div>
          <div className="historical-legend">
            <span><i className="hist-current" /> Últimos 30 días</span>
            <span><i className="hist-previous" /> Periodo anterior</span>
            <span><i className="hist-year" /> Mismo mes 2025</span>
          </div>
          <div className="historical-rows">
            {historyRows.map((row) => {
              const max = Math.max(...historyRows.flatMap((item) => [item.current, item.previous, item.yearAgo]));
              return (
                <div className="historical-row" key={row.label}>
                  <span>{row.label}</span>
                  <div className="historical-row__bars">
                    <i className="hist-current" style={{ width: `${(row.current / max) * 100}%` }}><em>{row.current}</em></i>
                    <i className="hist-previous" style={{ width: `${(row.previous / max) * 100}%` }}><em>{row.previous}</em></i>
                    <i className="hist-year" style={{ width: `${(row.yearAgo / max) * 100}%` }}><em>{row.yearAgo}</em></i>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="historical-note"><Info size={13} /> Aumentar o disminuir en la muestra no implica una tendencia oficial ni una proyección.</p>
        </section>

        <section className="panel preventive-actions">
          <div className="panel__head">
            <div><span className="eyebrow">Siguiente paso</span><h2>Inspecciones sugeridas</h2></div>
          </div>
          <div className="inspection-list">
            {signals.slice(0, 4).map((signal, index) => (
              <div className="inspection-item" key={signal.id}>
                <span className="inspection-item__number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{signal.recommendation.split(".")[0]}.</strong>
                  <p><MapPin size={12} /> {signal.colonias.join(" · ")}</p>
                </div>
                <span className={`inspection-priority inspection-priority--${signal.strength}`}>
                  {signal.strength === "recurring" ? "Recurrente" : signal.strength === "emerging" ? "Emergente" : "Observada"}
                </span>
              </div>
            ))}
          </div>
          <div className="inspection-callout">
            <Sparkles size={17} />
            <p>Las inspecciones sugeridas son una ayuda de priorización. No sustituyen una orden de trabajo ni el criterio del área responsable.</p>
          </div>
        </section>
      </div>

      <div className="sample-data-footer">
        <SampleBadge>Datos de muestra</SampleBadge>
        <p>Vista demostrativa con registros ficticios. No se muestran probabilidades ni se afirma que exista un modelo de pronóstico entrenado.</p>
        <span>Actualizado {formatDate("2026-10-30T09:00:00-06:00", true)}</span>
      </div>
    </div>
  );
}
