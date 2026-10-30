"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  HardHat,
  Inbox,
  MapPin,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useGovernment } from "./GovernmentProvider";
import { CategoryBars, Sparkline, TrendChart } from "./charts";
import { CityMap } from "./CityMap";
import {
  CATEGORY_COLORS,
  CATEGORY_SHORT_LABELS,
  STRENGTH_LABELS,
  relativeTime,
} from "@/lib/government/display";
import type { GovernmentDashboard } from "@/lib/government/types";
import { governmentService } from "@/lib/government/mock-service";
import {
  LoadingCard,
  MetricCard,
  PriorityBadge,
  SampleBadge,
  SectionTitle,
  StatusBadge,
} from "./ui";

export function DashboardView() {
  const router = useRouter();
  const { cases, loading, currentUser } = useGovernment();
  const [dashboard, setDashboard] = useState<GovernmentDashboard | null>(null);

  useEffect(() => {
    let active = true;
    void governmentService.getDashboard().then((value) => {
      if (active) setDashboard(value);
    });
    return () => {
      active = false;
    };
  }, [cases]);

  if (loading || !dashboard) {
    return (
      <div className="page-stack">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Centro de operaciones</span>
            <h1>Resumen de gobierno</h1>
            <p>Cargando la operación de muestra…</p>
          </div>
        </div>
        <div className="metric-grid">
          {Array.from({ length: 4 }).map((_, index) => <LoadingCard key={index} />)}
        </div>
        <div className="overview-grid">
          <LoadingCard lines={6} />
          <LoadingCard lines={6} />
        </div>
      </div>
    );
  }

  const openCases = cases.filter((item) => !["resolved", "closed"].includes(item.status));
  const mapCases = openCases.slice(0, 10);

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--dashboard">
        <div>
          <div className="page-heading__eyebrow">
            <span className="eyebrow">Viernes, 30 de octubre</span>
            <SampleBadge />
          </div>
          <h1>Buenos días, {currentUser.name.split(" ")[0]}</h1>
          <p>Esta es la operación de la Ciudad de México en este momento.</p>
        </div>
        <div className="page-heading__actions">
          <Link href="/gobierno/reportes" className="button button--primary">
            <Inbox size={17} /> Abrir bandeja
          </Link>
          <Link href="/gobierno/inteligencia" className="button button--secondary">
            <Sparkles size={17} /> Ver inteligencia
          </Link>
        </div>
      </div>

      <div className="attention-strip">
        <span className="attention-strip__icon"><AlertTriangle size={17} /></span>
        <p>
          <strong>{dashboard.counts.pendingVerification} intervenciones</strong> esperan verificación y{" "}
          <strong>{dashboard.counts.priority} casos prioritarios</strong> requieren seguimiento hoy.
        </p>
        <Link href="/gobierno/reportes?priority=critical">Revisar prioridades <ArrowRight size={14} /></Link>
      </div>

      <div className="metric-grid metric-grid--seven">
        <MetricCard
          label="Reportes abiertos"
          value={dashboard.counts.open}
          detail="+8 esta semana"
          icon={Inbox}
          tone="blue"
          href="/gobierno/reportes"
        />
        <MetricCard
          label="Requieren revisión"
          value={dashboard.counts.review}
          detail="Mesa de gobierno"
          icon={ScanSearch}
          tone="amber"
          href="/gobierno/reportes?status=under_review"
        />
        <MetricCard
          label="Casos prioritarios"
          value={dashboard.counts.priority}
          detail="Alta y crítica"
          icon={ShieldAlert}
          tone="red"
          href="/gobierno/reportes?priority=critical"
        />
        <MetricCard
          label="Sin asignación"
          value={dashboard.counts.unassigned}
          detail="Requieren área"
          icon={ClipboardList}
          tone="slate"
          href="/gobierno/reportes?status=reported"
        />
        <MetricCard
          label="Intervenciones activas"
          value={dashboard.counts.activeInterventions}
          detail="En campo"
          icon={HardHat}
          tone="blue"
          href="/gobierno/reportes?status=in_progress"
        />
        <MetricCard
          label="Por verificar"
          value={dashboard.counts.pendingVerification}
          detail="Evidencia cargada"
          icon={ClipboardCheck}
          tone="violet"
          href="/gobierno/reportes?status=pending_verification"
        />
        <MetricCard
          label="Completadas"
          value={dashboard.counts.completedInterventions}
          detail="Últimos 30 días"
          icon={BadgeCheck}
          tone="green"
          href="/gobierno/resultados"
        />
      </div>

      <div className="overview-grid">
        <section className="panel panel--trend">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Demanda operativa</span>
              <h2>Flujo de reportes</h2>
            </div>
            <div className="panel__head-actions">
              <span className="trend-delta"><TrendingUp size={14} /> +12.4%</span>
              <select aria-label="Periodo de la gráfica" defaultValue="30">
                <option value="30">Últimos 30 días</option>
                <option value="60">Últimos 60 días</option>
              </select>
            </div>
          </div>
          <TrendChart data={dashboard.trend} />
          <div className="panel__footnote">
            <span>Recibidos: <strong>281</strong></span>
            <span>Resueltos: <strong>209</strong></span>
            <span>Tiempo medio de cierre: <strong>4.8 días</strong></span>
          </div>
        </section>

        <section className="panel panel--map">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Territorio</span>
              <h2>Distribución geográfica</h2>
            </div>
            <Link href="/gobierno/mapa" className="text-link">Abrir mapa <ArrowUpRight size={14} /></Link>
          </div>
          <CityMap
            cases={mapCases}
            compact
            onSelectCase={(id) => router.push(`/gobierno/reportes/${id}`)}
          />
          <div className="map-top-colonias">
            <span>Mayor volumen</span>
            <strong>Centro <em>3 casos</em></strong>
            <strong>Narvarte <em>3 casos</em></strong>
            <strong>Roma Norte <em>1 caso</em></strong>
          </div>
        </section>
      </div>

      <div className="overview-grid overview-grid--lower">
        <section className="panel">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Mezcla actual</span>
              <h2>Casos por categoría</h2>
            </div>
            <Link href="/gobierno/reportes" className="text-link">Ver bandeja</Link>
          </div>
          <CategoryBars data={dashboard.categories} total={dashboard.counts.open} />
        </section>

        <section className="panel ai-preview-card">
          <div className="ai-preview-card__glow" />
          <div className="ai-preview-card__head">
            <span className="ai-label"><Sparkles size={15} /> Inteligencia del caso</span>
            <SampleBadge>Análisis simulado</SampleBadge>
          </div>
          <h2>{dashboard.aiInsight.title}</h2>
          <p>{dashboard.aiInsight.body}</p>
          <div className="ai-preview-card__meta">
            <span><ScanSearch size={14} /> {dashboard.aiInsight.support}</span>
            <span>Revisión humana requerida</span>
          </div>
          <Link href={`/gobierno/reportes/${dashboard.aiInsight.caseId}`} className="ai-preview-card__link">
            Abrir inteligencia del caso <ArrowRight size={16} />
          </Link>
        </section>

        <section className="panel panel--activity">
          <div className="panel__head">
            <div>
              <span className="eyebrow">Bitácora</span>
              <h2>Actividad reciente</h2>
            </div>
            <span className="live-label"><i /> En vivo</span>
          </div>
          <div className="activity-list">
            {dashboard.activity.slice(0, 5).map((item) => (
              <Link
                href={item.caseId ? `/gobierno/reportes/${item.caseId}` : "/gobierno/reportes"}
                className="activity-item"
                key={item.id}
              >
                <span className={`activity-item__mark activity-item__mark--${item.kind}`} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <time>{relativeTime(item.at)}</time>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="panel preventive-preview">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Inteligencia preventiva</span>
            <h2>Señales para inspección anticipada</h2>
            <p>Concentraciones observadas en datos de muestra. No son predicciones.</p>
          </div>
          <Link href="/gobierno/inteligencia" className="button button--secondary button--small">
            Explorar señales <ArrowRight size={15} />
          </Link>
        </div>
        <div className="preventive-preview__grid">
          {dashboard.preventivePreview.map((signal) => (
            <Link href="/gobierno/inteligencia" className="signal-mini-card" key={signal.id}>
              <div className="signal-mini-card__head">
                <span className={`signal-strength signal-strength--${signal.strength}`}>
                  {STRENGTH_LABELS[signal.strength]}
                </span>
                <Sparkline values={signal.sparkline} color={CATEGORY_COLORS[signal.category]} width={64} height={24} />
              </div>
              <strong>{signal.title}</strong>
              <p><MapPin size={13} /> {signal.colonias.join(" · ")}</p>
              <div className="signal-mini-card__foot">
                <span>{signal.reportCount} reportes</span>
                <span>{signal.windowLabel}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="quick-links">
        <Link href="/gobierno/resultados" className="quick-link">
          <span className="quick-link__icon"><TrendingUp size={19} /></span>
          <div><strong>Resultados operativos</strong><p>Tendencias, evidencia y cierres publicados.</p></div>
          <ArrowUpRight size={17} />
        </Link>
        <Link href="/gobierno/equipo" className="quick-link">
          <span className="quick-link__icon"><Clock3 size={19} /></span>
          <div><strong>Carga del equipo</strong><p>Revisa responsables y capacidad de la mesa.</p></div>
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </div>
  );
}
