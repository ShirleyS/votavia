"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  Image as ImageIcon,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useGovernment } from "./GovernmentProvider";
import { CategoryBars, DonutChart, HorizontalStackedBars, TrendChart } from "./charts";
import {
  CATEGORY_LABELS,
  COLONIAS,
  formatDate,
  getDepartment,
} from "@/lib/government/display";
import type {
  CaseCategory,
  CategoryCount,
  DispatchOrder,
  InterventionEvidence,
} from "@/lib/government/types";
import {
  CategoryBadge,
  EmptyState,
  MetricCard,
  SampleBadge,
  SectionTitle,
  StatusBadge,
} from "./ui";
import { mockTrend } from "@/lib/government/mock-data";

const closedStatuses = ["resolved", "closed"];

export function ResultsView() {
  const { cases, loading, getDispatchOrder, error, retry } = useGovernment();
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [category, setCategory] = useState<CaseCategory | "all">("all");
  const [colonia, setColonia] = useState("all");
  const [preview, setPreview] = useState<InterventionEvidence | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all(cases.map((item) => getDispatchOrder(item.id))).then(
      (values) => {
        if (active) setOrders(values.filter((value): value is DispatchOrder => Boolean(value)));
      },
    );
    return () => {
      active = false;
    };
  }, [cases, getDispatchOrder]);

  const filteredCases = useMemo(
    () =>
      cases.filter((item) => {
        if (category !== "all" && item.category !== category) return false;
        if (colonia !== "all" && item.colonia !== colonia) return false;
        return true;
      }),
    [cases, category, colonia],
  );

  const closed = cases.filter((item) => closedStatuses.includes(item.status));
  const pending = cases.filter((item) => !closedStatuses.includes(item.status));
  const published = filteredCases.filter((item) => Boolean(item.publicOutcome));
  const completionRate = cases.length ? Math.round((closed.length / cases.length) * 100) : 0;

  const categoryCounts = useMemo<CategoryCount[]>(() => {
    const counts = new Map<CaseCategory, number>();
    filteredCases.forEach((item) => {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({ category: key, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCases]);

  const coloniaRows = useMemo(() => {
    const grouped = new Map<string, { total: number; closed: number }>();
    filteredCases.forEach((item) => {
      const current = grouped.get(item.colonia) ?? { total: 0, closed: 0 };
      current.total += 1;
      if (closedStatuses.includes(item.status)) current.closed += 1;
      grouped.set(item.colonia, current);
    });
    return Array.from(grouped.entries())
      .map(([label, values]) => ({
        label,
        total: values.total,
        segments: [
          { label: "Resueltos", value: values.closed, color: "#0f9f6e" },
          { label: "Pendientes", value: values.total - values.closed, color: "#b8c8e6" },
        ],
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);
  }, [filteredCases]);

  const completedEvidence = orders
    .map((order) => {
      const item = cases.find((entry) => entry.id === order.caseId);
      const before = order.evidence.find((evidence) => evidence.kind === "before");
      const after = order.evidence.find((evidence) => evidence.kind === "after");
      if (!item || !before || !after) return null;
      if (category !== "all" && item.category !== category) return null;
      if (colonia !== "all" && item.colonia !== colonia) return null;
      return { order, item, before, after };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="page-heading__eyebrow">
            <span className="eyebrow">Rendición de cuentas</span>
            <SampleBadge />
          </div>
          <h1>Resultados de gobierno</h1>
          <p>Una lectura operativa de cierres, trabajo pendiente y resultados publicados.</p>
        </div>
        <Link href="/gobierno/reportes" className="button button--primary">
          <ClipboardCheck size={16} /> Revisar casos abiertos
        </Link>
      </div>

      {error && cases.length === 0 ? (
        <div className="panel permission-note" role="alert">
          <strong>No pudimos cargar los resultados.</strong> {error}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="button button--secondary button--small" onClick={() => void retry()}>
              Reintentar
            </button>
          </div>
        </div>
      ) : null}

      <div className="metric-grid results-metrics">
        <MetricCard
          label="Casos cerrados"
          value={closed.length}
          detail={`${completionRate}% del expediente`}
          icon={CheckCircle2}
          tone="green"
        />
        <MetricCard
          label="Trabajo pendiente"
          value={pending.length}
          detail="En revisión o intervención"
          icon={CircleDashed}
          tone="amber"
        />
        <MetricCard
          label="Cierres publicados"
          value={cases.filter((item) => item.publicOutcome).length}
          detail="Con relato ciudadano"
          icon={BadgeCheck}
          tone="blue"
        />
        <MetricCard
          label="Órdenes verificadas"
          value={orders.filter((order) => order.state === "verified").length}
          detail="Evidencia aprobada"
          icon={ClipboardCheck}
          tone="violet"
        />
      </div>

      <section className="results-filterbar" aria-label="Filtros de resultados">
        <div className="results-filterbar__label">
          <Search size={16} />
          <div>
            <strong>Enfocar reporte</strong>
            <span>Los indicadores de detalle se ajustan sin alterar el total general.</span>
          </div>
        </div>
        <label className="minimal-select">
          <BarChart3 size={14} />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as CaseCategory | "all")}
            aria-label="Filtrar resultados por categoría"
          >
            <option value="all">Todas las categorías</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="minimal-select">
          <MapPin size={14} />
          <select
            value={colonia}
            onChange={(event) => setColonia(event.target.value)}
            aria-label="Filtrar resultados por colonia"
          >
            <option value="all">Todas las colonias</option>
            {COLONIAS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {category !== "all" || colonia !== "all" ? (
          <button
            type="button"
            className="filter-clear"
            onClick={() => {
              setCategory("all");
              setColonia("all");
            }}
          >
            Limpiar enfoque
          </button>
        ) : null}
        <span className="results-filterbar__count">{filteredCases.length} casos en el enfoque</span>
      </section>

      <div className="results-chart-grid">
        <section className="panel results-trend">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Seis semanas de muestra</span>
              <h2>Tendencia de cierre</h2>
              <p>Reportes recibidos frente a reportes resueltos.</p>
            </div>
            <span className="trend-delta trend-delta--positive">Cierre +12%</span>
          </div>
          <TrendChart data={mockTrend} height={230} />
          <div className="results-chart-note">
            <span><i className="chart-legend__line chart-legend__line--blue" /> Recibidos</span>
            <span><i className="chart-legend__line chart-legend__line--green" /> Resueltos</span>
            <strong>209 de 281 cierres en la muestra</strong>
          </div>
        </section>

        <section className="panel results-mix">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Estado del expediente</span>
              <h2>Balance de atención</h2>
            </div>
          </div>
          <DonutChart
            segments={[
              { label: "Resueltos o cerrados", value: closed.length, color: "#0f9f6e" },
              { label: "Trabajo pendiente", value: pending.length, color: "#1453d8" },
            ]}
            centerValue={`${completionRate}%`}
            centerLabel="cerrado"
          />
          <div className="results-mix__detail">
            <span><strong>{closed.length}</strong> con intervención concluida</span>
            <span><strong>{pending.length}</strong> todavía requieren seguimiento</span>
          </div>
        </section>
      </div>

      <div className="results-detail-grid">
        <section className="panel">
          <SectionTitle
            eyebrow="Mezcla del enfoque"
            title="Casos por categoría"
            subtitle="Distribuye el trabajo del filtro activo."
          />
          {categoryCounts.length > 0 ? (
            <CategoryBars data={categoryCounts} total={filteredCases.length} />
          ) : (
            <EmptyState title="Sin casos" detail="El enfoque actual no tiene reportes." />
          )}
        </section>

        <section className="panel">
          <SectionTitle
            eyebrow="Territorio"
            title="Cierres por colonia"
            subtitle="Parte del expediente resuelto en cada zona."
          />
          <div className="stacked-legend">
            <span><i style={{ background: "#0f9f6e" }} /> Resueltos</span>
            <span><i style={{ background: "#b8c8e6" }} /> Pendientes</span>
          </div>
          {coloniaRows.length > 0 ? (
            <HorizontalStackedBars rows={coloniaRows} />
          ) : (
            <p className="analysis-empty">No hay colonias para este enfoque.</p>
          )}
        </section>
      </div>

      <section className="panel evidence-comparison-panel">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Evidencia contrastada</span>
            <h2>Antes y después de la intervención</h2>
            <p>Solo se muestran órdenes con evidencia de ambos momentos.</p>
          </div>
          <Link href="/gobierno/reportes?status=pending_verification" className="text-link">
            Casos por verificar <ArrowRight size={14} />
          </Link>
        </div>
        {loading ? (
          <div className="evidence-comparison-grid">
            {Array.from({ length: 2 }).map((_, index) => <div className="skeleton-card" key={index}><span className="skeleton" /><span className="skeleton" /></div>)}
          </div>
        ) : completedEvidence.length === 0 ? (
          <EmptyState
            title="No hay pares antes/después con este enfoque"
            detail="Prueba otra categoría o colonia, o revisa los casos que esperan verificación."
          />
        ) : (
          <div className="evidence-comparison-grid">
            {completedEvidence.map(({ order, item, before, after }) => (
              <article className="evidence-compare-card" key={order.id}>
                <div className="evidence-compare-card__head">
                  <div>
                    <span>{item.folio}</span>
                    <strong>{item.title}</strong>
                  </div>
                  <CategoryBadge category={item.category} />
                </div>
                <div className="evidence-compare-card__images">
                  <button type="button" onClick={() => setPreview(before)}>
                    <span className="evidence-compare-card__tag">Antes</span>
                    <img src={before.url} alt={before.alt} />
                  </button>
                  <span className="evidence-compare-card__arrow"><ArrowRight size={16} /></span>
                  <button type="button" onClick={() => setPreview(after)}>
                    <span className="evidence-compare-card__tag evidence-compare-card__tag--after">Después</span>
                    <img src={after.url} alt={after.alt} />
                  </button>
                </div>
                <div className="evidence-compare-card__meta">
                  <span><MapPin size={13} /> {item.colonia}</span>
                  <span><ImageIcon size={13} /> {order.evidence.length} archivos</span>
                  <Link href={`/gobierno/reportes/${item.id}#orden-trabajo`}>
                    Abrir expediente <ArrowRight size={13} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel published-results-panel">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Comunicación pública</span>
            <h2>Resultados publicados</h2>
            <p>Resúmenes de cierre disponibles para la ciudadanía.</p>
          </div>
          <SampleBadge>Datos de muestra</SampleBadge>
        </div>
        {published.length === 0 ? (
          <EmptyState
            title="No hay resultados publicados con este enfoque"
            detail="Los cierres aparecen aquí después de verificar la intervención y publicar el resumen."
          />
        ) : (
          <div className="published-outcome-list">
            {published.map((item) => (
              <article className="published-outcome-row" key={item.id}>
                <div className="published-outcome-row__top">
                  <div>
                    <span>{item.folio}</span>
                    <strong>{item.title}</strong>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <p>{item.publicOutcome}</p>
                <div className="published-outcome-row__meta">
                  <span><MapPin size={13} /> {item.colonia}</span>
                  <span>{getDepartment(item.departmentId)?.shortName ?? "Mesa de gobierno"}</span>
                  <span>Publicado {formatDate(item.publishedAt ?? item.updatedAt)}</span>
                  <Link href={`/gobierno/reportes/${item.id}`}>Ver expediente <ArrowRight size={13} /></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="sample-data-footer">
        <SampleBadge>Datos de muestra</SampleBadge>
        <p>Los indicadores se calculan en este navegador. No representan estadísticas oficiales ni modifican datos reales.</p>
        <ChevronDown size={14} />
      </div>

      {preview ? (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Vista ampliada de evidencia">
          <button type="button" className="image-lightbox__scrim" onClick={() => setPreview(null)} aria-label="Cerrar imagen" />
          <div className="image-lightbox__content">
            <div className="image-lightbox__head">
              <div><strong>{preview.title}</strong><span>{formatDate(preview.submittedAt, true)}</span></div>
              <button type="button" onClick={() => setPreview(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <img src={preview.url} alt={preview.alt} />
            <p>{preview.note}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
