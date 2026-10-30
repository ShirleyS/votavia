"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Clock3,
  FileText,
  HardHat,
  Image as ImageIcon,
  Link2,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  DEPARTMENTS,
  DISPATCH_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  formatDate,
  getDepartment,
  relativeTime,
} from "@/lib/government/display";
import type {
  CaseAnalysis,
  CasePriority,
  DispatchOrder,
  DispatchState,
  GovernmentCase,
  InterventionEvidence,
  SpecialistRecommendation,
} from "@/lib/government/types";
import { useGovernment } from "./GovernmentProvider";
import { CaseAnalysisPanel } from "./CaseAnalysis";
import {
  CaseStatusOverview,
  CommunityPriorityPanel,
  GovernmentInterventionPanel,
  LinkedReportsPanel,
  OperatorAssignmentPanel,
  ResolutionDisputePanel,
} from "./CaseGovernance";
import { CityMap } from "./CityMap";
import {
  CategoryBadge,
  InitialsAvatar,
  PriorityBadge,
  ProgressBar,
  SampleBadge,
  StatusBadge,
} from "./ui";

export function CaseDetailView({ caseId }: { caseId: string }) {
  const {
    cases,
    loading,
    currentUser,
    updatePriority,
    updateStatus,
    assignDepartment,
    authorizeDispatch,
    advanceDispatch,
    verifyIntervention,
    publishOutcome,
    getCaseAnalysis,
    getDispatchOrder,
    getDispatchRecommendations,
    dataSource,
    can,
    permissionReason,
  } = useGovernment();
  const currentCase = cases.find((item) => item.id === caseId);
  const [analysis, setAnalysis] = useState<CaseAnalysis | null>(null);
  const [order, setOrder] = useState<DispatchOrder | null>(null);
  const [recommendations, setRecommendations] = useState<SpecialistRecommendation[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [selectedSpecialist, setSelectedSpecialist] = useState<string | null>(null);
  const [dispatchConfirm, setDispatchConfirm] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [verifyPanel, setVerifyPanel] = useState(false);
  const [publishPanel, setPublishPanel] = useState(false);
  const [outcomeText, setOutcomeText] = useState("");
  const [previewImage, setPreviewImage] = useState<InterventionEvidence | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getCaseAnalysis(caseId),
      getDispatchOrder(caseId),
      getDispatchRecommendations(caseId),
    ]).then(([nextAnalysis, nextOrder, nextRecommendations]) => {
      if (!active) return;
      setAnalysis(nextAnalysis);
      setOrder(nextOrder);
      setRecommendations(nextRecommendations);
    });
    return () => {
      active = false;
    };
  }, [caseId]);

  useEffect(() => {
    let active = true;
    void getDispatchOrder(caseId).then((next) => {
      if (active) setOrder(next);
    });
    return () => {
      active = false;
    };
  }, [caseId, currentCase?.updatedAt]);

  useEffect(() => {
    if (currentCase?.departmentId) setSelectedDepartment(currentCase.departmentId);
  }, [currentCase?.departmentId]);

  useEffect(() => {
    if (currentCase) setOutcomeText(currentCase.publicOutcome ?? defaultOutcome(currentCase));
  }, [currentCase]);

  const department = getDepartment(currentCase?.departmentId);
  const specialist = useMemo(
    () => recommendations.find((item) => item.specialist.id === selectedSpecialist)?.specialist ?? null,
    [recommendations, selectedSpecialist],
  );
  const orderSpecialist = order
    ? recommendations.find((item) => item.specialist.id === order.specialistId)?.specialist
    : null;

  if (loading) {
    return (
      <div className="page-stack">
        <div className="case-detail-skeleton">
          <span /><span /><span /><span />
        </div>
      </div>
    );
  }

  if (!currentCase) {
    return (
      <div className="page-stack">
        <div className="empty-state empty-state--page">
          <strong>No encontramos este caso</strong>
          <p>{dataSource === "core"
            ? "El núcleo no devolvió este expediente o tu organización no tiene acceso a él."
            : "Puede haber sido eliminado del conjunto de muestra."}</p>
          <Link href="/gobierno/reportes" className="button button--primary">Volver a la bandeja</Link>
        </div>
      </div>
    );
  }

  const run = async (key: string, task: () => Promise<void>) => {
    setActionBusy(key);
    try {
      await task();
    } catch {
      // El proveedor ya muestra el aviso de error correspondiente.
    } finally {
      setActionBusy(null);
    }
  };

  const canManage = can("case:manage", currentCase);
  const canAssign = can("case:assign", currentCase);
  const canDispatch = can("dispatch:authorize", currentCase);
  const canPublish = can("outcome:publish", currentCase);

  const handleAuthorize = async () => {
    if (!specialist) return;
    await run("authorize", async () => {
      await authorizeDispatch(currentCase.id, specialist.name, specialist.id);
      setDispatchConfirm(false);
      setSelectedSpecialist(null);
      const nextOrder = await getDispatchOrder(currentCase.id);
      setOrder(nextOrder);
    });
  };

  const handleAdvance = async (state: DispatchState) => {
    await run(`advance-${state}`, async () => {
      await advanceDispatch(currentCase.id, state);
      setOrder(await getDispatchOrder(currentCase.id));
    });
  };

  const handleVerify = async (decision: "verified" | "returned") => {
    await run(`verify-${decision}`, async () => {
      await verifyIntervention(currentCase.id, decision);
      setVerifyPanel(false);
      setOrder(await getDispatchOrder(currentCase.id));
    });
  };

  const handlePublish = async () => {
    if (!outcomeText.trim()) return;
    await run("publish", async () => {
      await publishOutcome(currentCase.id, outcomeText);
      setPublishPanel(false);
    });
  };

  const nextOrderAction: { state: DispatchState; label: string } | null =
    order?.state === "authorized"
      ? { state: "accepted", label: "Registrar aceptación" }
      : order?.state === "accepted"
        ? { state: "scheduled", label: "Programar visita" }
        : order?.state === "scheduled"
          ? { state: "in_progress", label: "Iniciar trabajo" }
          : order?.state === "in_progress"
            ? { state: "completed", label: "Marcar trabajo terminado" }
            : null;

  return (
    <div className="page-stack case-detail">
      <div className="case-detail__topline">
        <Link href="/gobierno/reportes" className="back-link"><ArrowLeft size={15} /> Bandeja de reportes</Link>
        <span className="case-detail__updated">Actualizado {relativeTime(currentCase.updatedAt)}</span>
      </div>

      <header className="case-detail__header">
        <div className="case-detail__header-main">
          <div className="case-detail__badges">
            <span className="case-folio">{currentCase.folio}</span>
            <StatusBadge status={currentCase.status} />
            <PriorityBadge priority={currentCase.priority} />
            <CategoryBadge category={currentCase.category} />
            {currentCase.relatedCaseIds.length > 0 ? (
              <span className="related-badge"><Link2 size={12} /> {currentCase.relatedCaseIds.length} relacionados</span>
            ) : null}
          </div>
          <h1>{currentCase.title}</h1>
          <div className="case-detail__location">
            <MapPin size={15} /> {currentCase.address} <span>·</span> {currentCase.colonia}
          </div>
          <div className="case-detail__meta">
            <span><CalendarClock size={14} /> Reportado {formatDate(currentCase.reportedAt, true)}</span>
            <span><Users size={14} /> {currentCase.citizen.supportCount} apoyos ciudadanos</span>
            <span><MessageSquare size={14} /> {currentCase.observations.length} observaciones</span>
            <SampleBadge />
          </div>
        </div>
        <div className="case-detail__header-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void run("review", () => updateStatus(currentCase.id, "under_review"))}
            disabled={!canManage || currentCase.status !== "reported" || actionBusy === "review"}
          >
            {actionBusy === "review" ? <span className="button-spinner" /> : <ClipboardCheck size={16} />}
            {currentCase.status === "reported" ? "Revisar caso" : "Caso revisado"}
          </button>
          <button type="button" className="icon-action" aria-label="Más acciones"><ChevronDown size={17} /></button>
        </div>
      </header>

      <div className="case-health-strip">
        <div>
          <span>Progreso del caso</span>
          <ProgressBar value={currentCase.progress} tone={currentCase.status === "resolved" || currentCase.status === "closed" ? "green" : "blue"} />
        </div>
        <div><span>Área responsable</span><strong>{department?.shortName ?? "Sin asignar"}</strong></div>
        <div><span>Especialista</span><strong>{orderSpecialist?.name ?? (order ? "Por confirmar" : "Sin despacho")}</strong></div>
        <div>
          <span>Verificación ciudadana</span>
          <strong>
            {currentCase.communityVerification?.status === "verified"
              ? "Verificada por vecinos"
              : currentCase.communityVerification?.status === "disputed"
                ? "En disputa"
                : currentCase.communityVerification?.status === "pending"
                  ? "En revisión vecinal"
                  : "Sin iniciar"}
          </strong>
        </div>
      </div>

      <CaseStatusOverview item={currentCase} />
      <ResolutionDisputePanel item={currentCase} />
      <CommunityPriorityPanel item={currentCase} />

      <div className="case-detail-layout">
        <div className="case-detail-main">
          <section className="panel citizen-report">
            <div className="panel__head">
              <div><span className="eyebrow">Reporte ciudadano</span><h2>Lo que reportó la comunidad</h2></div>
              <span className="report-source">Canal ciudadano <i /></span>
            </div>

            <div className="citizen-report__body">
              <div className="citizen-report__story">
                <p className="citizen-description">{currentCase.description}</p>

                <div className="photo-gallery">
                  {currentCase.photos.map((photo, index) => (
                    <figure className={`photo-tile photo-tile--${photo.tone} photo-tile--${index === 0 ? "lead" : "small"}`} key={photo.id}>
                      <img src={photo.url} alt={photo.alt} />
                      <figcaption>
                        <span><ImageIcon size={12} /> Foto {index + 1}</span>
                        {photo.caption}
                      </figcaption>
                    </figure>
                  ))}
                </div>

                <div className="citizen-summary-grid">
                  <div className="citizen-summary">
                    <InitialsAvatar initials={initials(currentCase.citizen.name)} tone="blue" size="md" />
                    <div>
                      <span>Reporta</span>
                      <strong>{currentCase.citizen.name}</strong>
                      <small>{currentCase.citizen.reportsCount} reportes previos · identidad protegida</small>
                    </div>
                  </div>
                  <div className="citizen-contact">
                    <span><Phone size={13} /> {currentCase.citizen.phoneMasked}</span>
                    <span>{currentCase.citizen.emailMasked}</span>
                  </div>
                  <div className="support-counter">
                    <strong>{currentCase.citizen.supportCount}</strong>
                    <span>vecinos apoyan</span>
                  </div>
                </div>

                {currentCase.citizen.safetyConcern ? (
                  <div className="safety-callout">
                    <span><ShieldAlert size={18} /></span>
                    <div>
                      <strong>Preocupación de seguridad señalada</strong>
                      <p>{currentCase.citizen.safetyNote}</p>
                    </div>
                  </div>
                ) : null}

                <div className="community-observations">
                  <div className="subhead">
                    <div><h3>Observaciones de la comunidad</h3><span>{currentCase.observations.length} actualizaciones</span></div>
                    <span className="verified-community"><UserCheck size={14} /> Vecinos verificados</span>
                  </div>
                  {currentCase.observations.length === 0 ? (
                    <p className="analysis-empty">Este reporte todavía no tiene observaciones adicionales.</p>
                  ) : (
                    currentCase.observations.map((observation) => (
                      <div className="observation" key={observation.id}>
                        <InitialsAvatar initials={observation.initials} tone="slate" size="sm" />
                        <div>
                          <div className="observation__head">
                            <strong>{observation.author}</strong>
                            {observation.verifiedNeighbor ? <span>Vecino verificado</span> : <span className="muted">Comunidad</span>}
                            <time>{relativeTime(observation.createdAt)}</time>
                          </div>
                          <p>{observation.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <aside className="citizen-location">
                <div className="subhead">
                  <div><h3>Ubicación</h3><span>Referencia del reporte</span></div>
                  <MapPin size={16} />
                </div>
                <div className="case-mini-map">
                  <CityMap cases={[currentCase]} compact showLabels={false} />
                </div>
                <dl className="location-details">
                  <div><dt>Dirección</dt><dd>{currentCase.address}</dd></div>
                  <div><dt>Colonia</dt><dd>{currentCase.colonia}</dd></div>
                  <div><dt>Coordenadas</dt><dd>{currentCase.coordinates.x.toFixed(2)}, {currentCase.coordinates.y.toFixed(2)}</dd></div>
                  <div><dt>Categoría</dt><dd>{CATEGORY_LABELS[currentCase.category]}</dd></div>
                </dl>
              </aside>
            </div>
          </section>

          <LinkedReportsPanel item={currentCase} />

          {analysis ? <CaseAnalysisPanel analysis={analysis} /> : <div className="analysis-panel-loading"><Sparkles size={20} /><span>Preparando inteligencia del caso…</span></div>}

          <GovernmentInterventionPanel item={currentCase} />

          {order ? (
            <section className="panel order-panel" id="orden-trabajo">
              <div className="panel__head">
                <div><span className="eyebrow">Despacho</span><h2>Orden de trabajo y evidencia</h2></div>
                <span className={`order-state order-state--${order.state}`}>
                  <CircleDot size={13} /> {DISPATCH_LABELS[order.state]}
                </span>
              </div>
              <div className="order-assigned">
                <InitialsAvatar initials={orderSpecialist?.initials ?? "ES"} tone="cyan" size="md" />
                <div>
                  <span>Especialista asignado</span>
                  <strong>{orderSpecialist?.name ?? "Especialista por confirmar"}</strong>
                  <p>{orderSpecialist?.organization ?? "Orden autorizada por la mesa de gobierno"}</p>
                </div>
                <div className="order-assigned__meta">
                  <span>Orden</span>
                  <strong>#{order.id.replace("ord-", "OT-")}</strong>
                </div>
              </div>

              <div className="dispatch-timeline">
                {order.timeline.map((event, index) => (
                  <div className={`dispatch-timeline__event ${index === order.timeline.length - 1 ? "is-current" : ""}`} key={event.id}>
                    <span className="dispatch-timeline__dot">{index === order.timeline.length - 1 ? <CircleDot size={13} /> : <Check size={12} />}</span>
                    <div>
                      <strong>{event.label}</strong>
                      <p>{event.detail}</p>
                    </div>
                    <time>{formatDate(event.at, true)}</time>
                  </div>
                ))}
              </div>

              {nextOrderAction ? (
                <button
                  type="button"
                  className="button button--secondary order-next"
                  onClick={() => void handleAdvance(nextOrderAction.state)}
                  disabled={Boolean(actionBusy)}
                >
                  {actionBusy?.startsWith("advance") ? <span className="button-spinner button-spinner--dark" /> : <ArrowRight size={16} />}
                  {nextOrderAction.label}
                </button>
              ) : null}

              <div className="order-evidence">
                <div className="subhead">
                  <div><h3>Evidencia de trabajo</h3><span>{order.evidence.length} archivos cargados por el especialista</span></div>
                  <span className="evidence-private"><ShieldAlert size={13} /> Solo uso interno</span>
                </div>
                {order.evidence.length === 0 ? (
                  <p className="analysis-empty">El especialista todavía no ha cargado evidencia.</p>
                ) : (
                  <div className="evidence-grid">
                    {order.evidence.map((evidence) => (
                      <button type="button" className="evidence-card" key={evidence.id} onClick={() => setPreviewImage(evidence)}>
                        <span className="evidence-card__image">
                          <img src={evidence.url} alt={evidence.alt} />
                          <span className="evidence-card__kind">{evidence.kind === "before" ? "Antes" : evidence.kind === "after" ? "Después" : evidence.kind === "document" ? "Documento" : "Firma"}</span>
                          <span className="evidence-card__zoom"><Search size={14} /></span>
                        </span>
                        <strong>{evidence.title}</strong>
                        <span>{formatDate(evidence.submittedAt, true)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {["completed", "returned"].includes(order.state) || currentCase.status === "pending_verification" ? (
                <div className="verification-zone">
                  <div className="verification-zone__copy">
                    <span className="verification-zone__icon"><BadgeCheck size={19} /></span>
                    <div>
                      <strong>Verificación de gobierno</strong>
                      <p>El trabajo del especialista no resuelve el caso automáticamente. Revisa la evidencia y decide.</p>
                    </div>
                  </div>
                  {!verifyPanel ? (
                    <button type="button" className="button button--primary button--small" onClick={() => setVerifyPanel(true)} disabled={!canDispatch}>
                      Verificar intervención
                    </button>
                  ) : (
                    <div className="verification-actions">
                      <label className="checkline">
                        <input type="checkbox" defaultChecked />
                        <span>Revisé las fotografías, el alcance del trabajo y las observaciones vecinales. Esta aprobación es operativa y no sustituye la verificación ciudadana.</span>
                      </label>
                      <div>
                        <button type="button" className="button button--success button--small" onClick={() => void handleVerify("verified")} disabled={!canDispatch || Boolean(actionBusy)}>
                          {actionBusy === "verify-verified" ? <span className="button-spinner" /> : <CheckCircle2 size={15} />} Aprobar cierre operativo
                        </button>
                        <button type="button" className="button button--danger-ghost button--small" onClick={() => void handleVerify("returned")} disabled={!canDispatch || Boolean(actionBusy)}>
                          Devolver para corrección
                        </button>
                        <button type="button" className="button button--ghost button--small" onClick={() => setVerifyPanel(false)}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="panel no-order-panel">
              <span className="no-order-panel__icon"><HardHat size={22} /></span>
              <div>
                <h2>Aún no hay una orden de trabajo</h2>
                <p>Autoriza un especialista desde el panel de gestión para iniciar el despacho.</p>
              </div>
              <button type="button" className="button button--secondary button--small" onClick={() => setShowRecommendations(true)}>
                Buscar especialistas
              </button>
            </section>
          )}

          {(currentCase.status === "resolved" || currentCase.status === "closed") ? (
            <section className="panel outcome-panel">
              <div className="panel__head">
                <div><span className="eyebrow">Resultado ciudadano</span><h2>{currentCase.status === "closed" ? "Resultado publicado" : "Listo para publicar"}</h2></div>
                {currentCase.status === "closed" ? <span className="published-chip"><CheckCircle2 size={13} /> Publicado</span> : <span className="pending-chip"><Clock3 size={13} /> Borrador</span>}
              </div>
              {currentCase.status === "closed" ? (
                <div className="published-outcome">
                  <p>{currentCase.publicOutcome}</p>
                  <span>Publicado el {formatDate(currentCase.publishedAt ?? currentCase.updatedAt, true)}</span>
                </div>
              ) : !publishPanel ? (
                <div className="outcome-cta">
                  <p>La evidencia ya fue verificada. Publica un resumen claro del trabajo y su resultado.</p>
                  <button type="button" className="button button--primary button--small" onClick={() => setPublishPanel(true)} disabled={!canPublish}>Publicar resultado</button>
                </div>
              ) : (
                <div className="outcome-editor">
                  <label>
                    <span>Resumen público del cierre</span>
                    <textarea value={outcomeText} onChange={(event) => setOutcomeText(event.target.value)} rows={4} />
                    <small>Este texto será visible para la ciudadanía en el modo conectado.</small>
                  </label>
                  <div>
                    <button type="button" className="button button--primary button--small" onClick={() => void handlePublish()} disabled={!canPublish || !outcomeText.trim() || actionBusy === "publish"}>
                      {actionBusy === "publish" ? <span className="button-spinner" /> : <CheckCircle2 size={15} />} Publicar y cerrar caso
                    </button>
                    <button type="button" className="button button--ghost button--small" onClick={() => setPublishPanel(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <section className="panel case-timeline">
            <div className="panel__head">
              <div><span className="eyebrow">Trazabilidad</span><h2>Historial del caso</h2></div>
              <span>{currentCase.events.length} eventos</span>
            </div>
            <div className="case-timeline__list">
              {[...currentCase.events].reverse().map((event) => (
                <div className="case-timeline__event" key={event.id}>
                  <span className={`case-timeline__icon case-timeline__icon--${event.actor.toLowerCase()}`}>
                    {event.actor === "Citizen" ? <MessageSquare size={14} /> : event.actor === "Specialist" ? <HardHat size={14} /> : event.actor === "System" ? <Sparkles size={14} /> : <Building2 size={14} />}
                  </span>
                  <div>
                    <strong>{event.label}</strong>
                    <p>{event.detail}</p>
                  </div>
                  <time>{formatDate(event.at, true)}</time>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="case-detail-aside">
          <OperatorAssignmentPanel item={currentCase} />

          <section className="panel management-panel">
            <div className="panel__head">
              <div><span className="eyebrow">Mesa de gobierno</span><h2>Gestión del caso</h2></div>
              <span className="management-panel__dot" />
            </div>

            <div className="management-field">
              <label htmlFor="case-priority">Prioridad</label>
              <select
                id="case-priority"
                value={currentCase.priority}
                onChange={(event) => void run("priority", () => updatePriority(currentCase.id, event.target.value as CasePriority))}
                disabled={!canManage || actionBusy === "priority"}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <div className="management-field">
              <label htmlFor="case-department">Departamento responsable</label>
              <select id="case-department" value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)} disabled={!canAssign}>
                <option value="">Seleccionar área</option>
                {DEPARTMENTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button
                type="button"
                className="button button--secondary button--full button--small"
                disabled={!canAssign || !selectedDepartment || selectedDepartment === currentCase.departmentId || actionBusy === "department"}
                onClick={() => void run("department", () => assignDepartment(currentCase.id, selectedDepartment))}
              >
                {actionBusy === "department" ? <span className="button-spinner button-spinner--dark" /> : <Building2 size={15} />}
                {currentCase.departmentId ? "Actualizar asignación" : "Asignar departamento"}
              </button>
              {dataSource === "core" ? (
                <p className="management-hint">
                  Asignación local etiquetada: el núcleo sólo acepta <code>organization_id</code> en
                  el cambio operativo, no un departamento distinto.
                </p>
              ) : null}
            </div>

            <div className="management-actions">
              <div className="management-actions__head"><span>Acciones rápidas</span></div>
              <button type="button" onClick={() => void run("review", () => updateStatus(currentCase.id, "under_review"))} disabled={!canManage || ["resolved", "closed"].includes(currentCase.status)}>
                <ClipboardCheck size={16} /> <span>Marcar en revisión</span>
              </button>
              <button type="button" onClick={() => void run("progress", () => updateStatus(currentCase.id, "in_progress"))} disabled={!canManage || !order || ["resolved", "closed", "pending_verification"].includes(currentCase.status)}>
                <HardHat size={16} /> <span>Registrar avance</span>
              </button>
              <button type="button" onClick={() => setShowRecommendations(true)}>
                <Search size={16} /> <span>Buscar especialistas</span>
              </button>
            </div>

            {!canManage ? <p className="permission-note">{permissionReason("case:manage", currentCase)}</p> : null}
            {!canAssign ? <p className="permission-note">{permissionReason("case:assign", currentCase)}</p> : null}

            <div className="management-footnote">
              <SampleBadge />
              <p>{dataSource === "core"
                ? "Los cambios de estado y la evidencia se envían al núcleo de Session 1. La asignación de área y operador aún no tiene endpoint y se guarda de forma local y etiquetada."
                : "Los cambios viven solo en este navegador. No modifican la base de datos real."}</p>
            </div>
          </section>

          <section className="panel dispatch-panel" id="despacho">
            <div className="panel__head">
              <div><span className="eyebrow">Especialistas</span><h2>Despacho recomendado</h2></div>
              <span className="approved-count"><BadgeCheck size={14} /> Solo aprobados</span>
            </div>

            {dataSource === "core" ? (
              <div className="dispatch-source-note" role="note">
                <ShieldAlert size={14} />
                <span>Fixture del contrato de despacho (Ismael): todavía no existe un backend HTTP. Las órdenes son simuladas y no representan asignaciones reales.</span>
              </div>
            ) : null}
            {!canDispatch ? <p className="permission-note">{permissionReason("dispatch:authorize", currentCase)}</p> : null}

            {order ? (
              <div className="current-dispatch">
                <span className="current-dispatch__label">Despacho actual</span>
                <div>
                  <InitialsAvatar initials={orderSpecialist?.initials ?? "ES"} tone="cyan" size="sm" />
                  <div><strong>{orderSpecialist?.name ?? "Por confirmar"}</strong><span>{DISPATCH_LABELS[order.state]}</span></div>
                </div>
                <Link href="#orden-trabajo" className="text-link">Ver orden y evidencia <ArrowRight size={13} /></Link>
              </div>
            ) : null}

            {!showRecommendations ? (
              <button type="button" className="dispatch-search-cta" onClick={() => setShowRecommendations(true)}>
                <span><Search size={19} /></span>
                <div><strong>Buscar especialistas</strong><p>Consulta cobertura, disponibilidad y cualificación.</p></div>
                <ArrowRight size={16} />
              </button>
            ) : (
              <div className="specialist-recommendations">
                <div className="specialist-recommendations__head">
                  <span>{recommendations.length} recomendaciones para {CATEGORY_LABELS[currentCase.category].toLowerCase()}</span>
                  <button type="button" onClick={() => setShowRecommendations(false)} aria-label="Cerrar recomendaciones"><X size={14} /></button>
                </div>
                {recommendations.map((recommendation) => {
                  const item = recommendation.specialist;
                  const selected = selectedSpecialist === item.id;
                  return (
                    <button
                      type="button"
                      className={`specialist-card ${selected ? "is-selected" : ""}`}
                      key={item.id}
                      onClick={() => { setSelectedSpecialist(item.id); setDispatchConfirm(false); }}
                    >
                      <div className="specialist-card__top">
                        <InitialsAvatar initials={item.initials} tone={item.id === "sp-2" ? "blue" : item.id === "sp-1" ? "amber" : "cyan"} size="md" />
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.specialty}</span>
                        </div>
                        <span className="specialist-approved"><BadgeCheck size={13} /> Aprobado</span>
                      </div>
                      <div className="specialist-card__facts">
                        <span><Star size={13} /> {item.yearsExperience} años de experiencia</span>
                        <span><Clock3 size={13} /> Respuesta media {item.responseTime}</span>
                        <span><HardHat size={13} /> {item.dispatchCount} despachos</span>
                      </div>
                      <div className="specialist-card__detail">
                        <p><strong>Cualificación:</strong> {recommendation.qualificationMatch}</p>
                        <p><strong>Cobertura:</strong> {recommendation.coverageNote}</p>
                        <p><strong>Disponibilidad:</strong> {item.availability}</p>
                      </div>
                      <span className={`availability-pill availability-pill--${item.availabilityTone}`}>
                        <i /> {item.availabilityTone === "available" ? "Disponible" : item.availabilityTone === "limited" ? "Cupo limitado" : "Con agenda"}
                      </span>
                      <span className="specialist-card__select">{selected ? <><Check size={14} /> Seleccionado</> : "Seleccionar"}</span>
                    </button>
                  );
                })}

                {dispatchConfirm && specialist ? (
                  <div className="dispatch-confirm">
                    <span className="dispatch-confirm__icon"><ShieldAlert size={18} /></span>
                    <strong>Autorizar a {specialist.name}</strong>
                    <p>Se creará una orden de trabajo simulada. La asignación no resuelve el caso; deberás verificar la evidencia al terminar.</p>
                    <div>
                      <button type="button" className="button button--primary button--small" onClick={() => void handleAuthorize()} disabled={!canDispatch || actionBusy === "authorize"}>
                        {actionBusy === "authorize" ? <span className="button-spinner" /> : <Check size={15} />} Autorizar asignación
                      </button>
                      <button type="button" className="button button--ghost button--small" onClick={() => setDispatchConfirm(false)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button button--primary button--full"
                    disabled={!canDispatch || !selectedSpecialist}
                    onClick={() => setDispatchConfirm(true)}
                  >
                    <UserCheck size={16} /> Revisar y autorizar asignación
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="panel aside-notes">
            <span className="eyebrow">Nota de la mesa</span>
            <p>La recomendación de IA es un insumo. La decisión final, la prioridad y la autorización del despacho son humanas.</p>
            <span className="aside-notes__by"><InitialsAvatar initials={currentUser.initials} tone="blue" size="sm" /> {currentUser.name}</span>
          </section>
        </aside>
      </div>

      {previewImage ? (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Vista ampliada de evidencia">
          <button type="button" className="image-lightbox__scrim" onClick={() => setPreviewImage(null)} aria-label="Cerrar imagen" />
          <div className="image-lightbox__content">
            <div className="image-lightbox__head">
              <div><strong>{previewImage.title}</strong><span>{formatDate(previewImage.submittedAt, true)}</span></div>
              <button type="button" onClick={() => setPreviewImage(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <img src={previewImage.url} alt={previewImage.alt} />
            <p>{previewImage.note}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function defaultOutcome(item: GovernmentCase): string {
  return `Se completó la intervención de ${CATEGORY_LABELS[item.category].toLowerCase()} en ${item.colonia}. La evidencia fue validada operativamente por la mesa de gobierno. La verificación ciudadana se muestra por separado y conserva su propio resultado.`;
}
