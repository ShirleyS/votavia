"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  FileWarning,
  GitCompareArrows,
  Link2,
  LoaderCircle,
  Quote,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  CATEGORY_SHORT_LABELS,
  formatDate,
  getDepartment,
} from "@/lib/government/display";
import type { CaseAnalysis } from "@/lib/government/types";
import { SampleBadge } from "./ui";

export function CaseAnalysisPanel({ analysis }: { analysis: CaseAnalysis }) {
  if (analysis.state === "loading") {
    return (
      <section className="panel analysis-panel analysis-panel--state">
        <div className="analysis-state">
          <LoaderCircle size={28} className="spin" />
          <strong>Preparando el análisis del caso</strong>
          <p>La inteligencia del caso aparecerá sin que tengas que solicitarla.</p>
          <div className="analysis-state__skeleton"><span /><span /><span /></div>
        </div>
      </section>
    );
  }

  if (analysis.state === "failed") {
    return (
      <section className="panel analysis-panel analysis-panel--state">
        <div className="analysis-state analysis-state--error">
          <FileWarning size={28} />
          <strong>No pudimos mostrar el análisis</strong>
          <p>El servicio de inteligencia no respondió. El caso sigue disponible para revisión manual.</p>
          <button type="button" className="button button--secondary button--small" disabled>
            Reintentar cuando el servicio esté conectado
          </button>
        </div>
      </section>
    );
  }

  if (analysis.state === "unavailable" || !analysis.summary) {
    return (
      <section className="panel analysis-panel analysis-panel--state">
        <div className="analysis-state">
          <Sparkles size={28} />
          <strong>Análisis no disponible para este caso</strong>
          <p>
            Este expediente no tiene un análisis previo. En la versión conectada, el motor de
            inteligencia lo generaría al recibir el reporte y lo dejaría listo aquí.
          </p>
          <span className="analysis-state__hint">
            No se requiere una acción de tu parte para consultar análisis existentes.
          </span>
        </div>
      </section>
    );
  }

  const department = getDepartment(analysis.recommendedDepartmentId);

  return (
    <section className="analysis-panel" aria-labelledby="analysis-title">
      <div className="analysis-panel__header">
        <div className="analysis-panel__title">
          <span className="ai-icon"><Sparkles size={20} /></span>
          <div>
            <span className="eyebrow">Inteligencia del caso</span>
            <h2 id="analysis-title">Análisis para revisión humana</h2>
          </div>
        </div>
        <div className="analysis-panel__meta">
          <SampleBadge>Análisis simulado</SampleBadge>
          <span>Generado {analysis.generatedAt ? formatDate(analysis.generatedAt, true) : "previamente"}</span>
          <span className="human-review-chip"><ShieldAlert size={13} /> Requiere revisión humana</span>
        </div>
      </div>

      <div className="analysis-summary">
        <div className="analysis-summary__label"><Sparkles size={15} /> Resumen del caso</div>
        <p>{analysis.summary}</p>
        {analysis.keyFindings?.length ? (
          <ul className="key-findings">
            {analysis.keyFindings.map((finding) => (
              <li key={finding}><CheckCircle2 size={15} /> {finding}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="analysis-grid">
        {analysis.duplicates ? (
          <AnalysisBlock
            icon={GitCompareArrows}
            title="Reportes relacionados y posibles duplicados"
            note="Coincidencias para comparar, no para fusionar automáticamente."
          >
            {analysis.duplicates.length === 0 ? (
              <p className="analysis-empty">No se identificaron reportes suficientemente cercanos.</p>
            ) : (
              <div className="duplicate-list">
                {analysis.duplicates.map((duplicate) => (
                  <div className="duplicate-item" key={duplicate.id}>
                    <div className="duplicate-item__top">
                      <span className={`duplicate-label ${duplicate.similarityLabel === "Posible duplicado" ? "duplicate-label--strong" : ""}`}>
                        <Link2 size={12} /> {duplicate.similarityLabel}
                      </span>
                      <span>{duplicate.daysApart} días de diferencia</span>
                    </div>
                    <strong>{duplicate.folio} · {duplicate.colonia}</strong>
                    <p>{duplicate.reason}</p>
                    <Link href={`/gobierno/reportes/${duplicate.id}`} className="text-link">
                      Comparar expediente <ArrowRight size={13} />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </AnalysisBlock>
        ) : null}

        {analysis.risks ? (
          <AnalysisBlock
            icon={TriangleAlert}
            title="Riesgos observados"
            note="Señales cualitativas presentes en el reporte y sus observaciones."
          >
            <div className="risk-observations">
              {analysis.risks.map((risk) => (
                <div className={`risk-observation risk-observation--${risk.level}`} key={risk.title}>
                  <span className="risk-observation__icon">
                    {risk.level === "high" ? <ShieldAlert size={16} /> : <AlertCircle size={16} />}
                  </span>
                  <div>
                    <strong>{risk.title}</strong>
                    <p>{risk.detail}</p>
                  </div>
                  <span className={`risk-level risk-level--${risk.level}`}>
                    {risk.level === "high" ? "Atención alta" : risk.level === "medium" ? "Atención media" : "Atención baja"}
                  </span>
                </div>
              ))}
            </div>
          </AnalysisBlock>
        ) : null}
      </div>

      {analysis.historicalEvidence ? (
        <AnalysisBlock
          icon={BookOpen}
          title="Contexto histórico y datos públicos"
          note="Evidencia de referencia consultada. Verifica la fuente antes de usarla en una resolución."
        >
          <div className="evidence-citations">
            {analysis.historicalEvidence.map((evidence) => (
              <div className="citation-card" key={evidence.id}>
                <div className="citation-card__top">
                  <span><Quote size={14} /> Evidencia citada</span>
                  <time>{formatDate(evidence.date)}</time>
                </div>
                <strong>{evidence.title}</strong>
                <span className="citation-card__institution">{evidence.institution}</span>
                <p>{evidence.excerpt}</p>
                <button type="button" className="citation-card__source">{evidence.urlLabel} <ArrowRight size={12} /></button>
              </div>
            ))}
          </div>
        </AnalysisBlock>
      ) : null}

      <div className="analysis-recommendations">
        {department ? (
          <div className="department-recommendation">
            <span className="department-recommendation__icon" style={{ background: `${department.color}18`, color: department.color }}>
              <Building2 size={20} />
            </span>
            <div>
              <span className="eyebrow">Departamento recomendado</span>
              <strong>{department.name}</strong>
              <p>{analysis.recommendedDepartmentReason}</p>
            </div>
            <span className="recommendation-tag">Sugerencia</span>
          </div>
        ) : null}

        {analysis.recommendedActions?.length ? (
          <div className="recommended-actions">
            <div className="recommended-actions__head">
              <span className="eyebrow">Pasos sugeridos</span>
              <strong>Acciones recomendadas</strong>
            </div>
            {analysis.recommendedActions.map((action, index) => (
              <div className="recommended-action" key={action.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{action.title}</strong>
                  <p>{action.detail}</p>
                </div>
                <em>{action.owner}</em>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="analysis-limitations">
        <strong>Limitaciones del análisis</strong>
        <ul>
          {analysis.limitations?.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
        <p>
          Este panel presenta resultados de un análisis simulado. En producción, el motor de IA
          proporcionará resúmenes y citas con sus propias limitaciones y trazabilidad.
        </p>
      </div>
    </section>
  );
}

function AnalysisBlock({
  icon: Icon,
  title,
  note,
  children,
}: {
  icon: React.ElementType;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="analysis-block">
      <div className="analysis-block__head">
        <span><Icon size={17} /></span>
        <div>
          <h3>{title}</h3>
          <p>{note}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
