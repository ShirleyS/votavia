"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  ImagePlus,
  Landmark,
  Link2 as LinkIcon,
  ChevronRight,
  LockKeyhole,
  MapPin,
  MessageSquare,
  ShieldAlert,
  Upload,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  COMMUNITY_VERIFICATION_LABELS,
  DATA_FRESHNESS_LABELS,
  DEPARTMENTS,
  STATUS_LABELS,
  formatDate,
  getDepartment,
  relativeTime,
} from "@/lib/government/display";
import type {
  GovernmentCase,
  GovernmentEvidenceRecord,
} from "@/lib/government/types";
import { useGovernment } from "./GovernmentProvider";
import { SampleBadge, StatusBadge } from "./ui";
import { stockPhoto } from "@/lib/stock-photos";

const KIND_LABELS: Record<GovernmentEvidenceRecord["kind"], string> = {
  before: "Antes",
  after: "Después",
  document: "Documento",
};

function daysOpen(iso: string): number {
  return Math.max(
    0,
    Math.ceil((Date.now() - new Date(iso).getTime()) / 86_400_000),
  );
}

function localDateTimeValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

export function CaseStatusOverview({ item }: { item: GovernmentCase }) {
  const verification = item.communityVerification;
  const official = item.officialRecord;
  const department = getDepartment(item.departmentId);

  return (
    <section className="panel status-separation">
      <div className="panel__head">
        <div>
          <span className="eyebrow">Estados independientes</span>
          <h2>Tres fuentes, tres estados</h2>
          <p>Un cierre operativo no reescribe el registro oficial ni la verificación ciudadana.</p>
        </div>
        <SampleBadge>Datos ficticios</SampleBadge>
      </div>

      <div className="status-separation__grid">
        <article className="status-lane status-lane--operational">
          <div className="status-lane__head">
            <span className="status-lane__icon"><Building2 size={18} /></span>
            <div><span>VotaVía</span><strong>Estado operativo</strong></div>
          </div>
          <StatusBadge status={item.status} />
          <dl className="status-lane__facts">
            <div><dt>Área responsable</dt><dd>{department?.shortName ?? "Sin asignar"}</dd></div>
            <div><dt>Responsable</dt><dd>{item.assignedOperatorName ?? "Sin operador"}</dd></div>
            <div><dt>Avance del trabajo</dt><dd>{item.progress}%</dd></div>
          </dl>
          <p className="status-lane__note">La mesa de gobierno puede actualizar este estado. Es el único estado que controla directamente.</p>
        </article>

        <article className="status-lane status-lane--official">
          <div className="status-lane__head">
            <span className="status-lane__icon"><Landmark size={18} /></span>
            <div><span>Registro importado</span><strong>Estado de la fuente</strong></div>
          </div>
          {official ? (
            <>
              <div className="official-source-line">
                <span>{official.reportedStatus}</span>
                <em className={`freshness-chip freshness-chip--${official.freshness}`}>
                  {DATA_FRESHNESS_LABELS[official.freshness]}
                </em>
              </div>
              <dl className="status-lane__facts">
                <div><dt>Fuente</dt><dd>{official.sourceName}</dd></div>
                <div><dt>Folio de origen</dt><dd><code>{official.sourceFolio}</code></dd></div>
                <div><dt>Dependencia reportada</dt><dd>{official.agency}</dd></div>
                <div><dt>Importado</dt><dd>{formatDate(official.importedAt, true)}</dd></div>
                <div><dt>Última lectura</dt><dd>{formatDate(official.refreshedAt, true)}</dd></div>
              </dl>
              <p className="status-lane__note"><LockKeyhole size={13} /> {official.note}</p>
            </>
          ) : (
            <div className="status-lane__empty">
              <FileText size={20} />
              <strong>Sin folio oficial vinculado</strong>
              <p>El caso existe en VotaVía, pero no hay un registro externo importado para mostrar.</p>
            </div>
          )}
        </article>

        <article className={`status-lane status-lane--community status-lane--${verification?.status ?? "not_started"}`}>
          <div className="status-lane__head">
            <span className="status-lane__icon"><Users size={18} /></span>
            <div><span>Ciudadanía</span><strong>Verificación comunitaria</strong></div>
          </div>
          <span className={`community-verification-chip community-verification-chip--${verification?.status ?? "not_started"}`}>
            {verification?.status === "disputed" ? <AlertTriangle size={13} /> : verification?.status === "verified" ? <BadgeCheck size={13} /> : <Clock3 size={13} />}
            {COMMUNITY_VERIFICATION_LABELS[verification?.status ?? "not_started"]}
          </span>
          <p className="community-outcome">{verification?.outcome ?? "La comunidad todavía no inicia la verificación."}</p>
          <dl className="status-lane__facts">
            <div><dt>Vecinos que revisaron</dt><dd>{verification?.verifiedNeighbors ?? 0}</dd></div>
            <div><dt>Actualizado</dt><dd>{verification ? formatDate(verification.updatedAt, true) : "Sin fecha"}</dd></div>
          </dl>
          <p className="status-lane__note"><LockKeyhole size={13} /> {verification?.note ?? "Sólo la ciudadanía puede modificar este estado."}</p>
        </article>
      </div>
    </section>
  );
}

export function CommunityPriorityPanel({ item }: { item: GovernmentCase }) {
  const breakdown = item.priorityBreakdown;
  const verification = item.communityVerification;
  const department = getDepartment(item.departmentId);
  const concentration = breakdown?.items.find((entry) => entry.key === "concentration")?.detail;

  return (
    <section className="panel priority-intel">
      <div className="panel__head">
        <div>
          <span className="eyebrow">Priorización comunitaria</span>
          <h2>Por qué este caso está en esta posición</h2>
          <p>La seguridad pesa más que la popularidad; cada factor muestra su aporte.</p>
        </div>
        <div className="priority-intel__score">
          <strong>{breakdown?.score ?? 0}</strong>
          <span>de {breakdown?.maxScore ?? 100} puntos</span>
        </div>
      </div>

      <div className="priority-intel__facts">
        <div><span><Users size={15} /> Apoyos únicos</span><strong>{item.citizen.supportCount}</strong><small>Personas, no firmas repetidas</small></div>
        <div><span><FileText size={15} /> Reportes independientes</span><strong>{item.independentReportCount ?? 1}</strong><small>Expedientes separados</small></div>
        <div><span><CalendarClock size={15} /> Antigüedad</span><strong>{daysOpen(item.reportedAt)} días</strong><small>Desde el primer reporte</small></div>
        <div><span><MapPin size={15} /> Concentración</span><strong>{item.colonia}</strong><small>{concentration ?? "Revisar mapa del caso"}</small></div>
        <div><span><ShieldAlert size={15} /> Seguridad</span><strong>{item.citizen.safetyConcern ? "Riesgo señalado" : "Sin alerta"}</strong><small>{item.citizen.safetyNote ?? "Sin nota de seguridad"}</small></div>
        <div><span><Building2 size={15} /> Acción existente</span><strong>{department?.shortName ?? "Sin área"}</strong><small>{STATUS_LABELS[item.status]}</small></div>
        <div><span><BadgeCheck size={15} /> Verificación</span><strong>{COMMUNITY_VERIFICATION_LABELS[verification?.status ?? "not_started"]}</strong><small>{verification?.outcome ?? "Sin revisión vecinal"}</small></div>
      </div>

      <div className="priority-intel__breakdown">
        <div className="priority-intel__breakdown-head">
          <strong>Desglose transparente</strong>
          <span>Máximo 100 puntos</span>
        </div>
        {breakdown?.items.map((entry) => (
          <div className="priority-factor" key={entry.key}>
            <div className="priority-factor__label">
              <strong>{entry.label}</strong>
              <span>{entry.points}/{entry.maxPoints}</span>
            </div>
            <div className="priority-factor__track">
              <span style={{ width: `${Math.min(100, (entry.points / entry.maxPoints) * 100)}%` }} />
            </div>
            <p>{entry.detail}</p>
          </div>
        ))}
        <p className="priority-intel__note"><ShieldAlert size={14} /> {breakdown?.note ?? "El orden combina severidad, evidencia y apoyo ciudadano."}</p>
      </div>
    </section>
  );
}

export function GovernmentInterventionPanel({ item }: { item: GovernmentCase }) {
  const {
    currentUser,
    can,
    permissionReason,
    uploadEvidence,
    recordCompletion,
    dataSource,
  } = useGovernment();
  const [mode, setMode] = useState<"evidence" | "claim" | null>(null);
  const [kind, setKind] = useState<GovernmentEvidenceRecord["kind"]>("after");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [performedAt, setPerformedAt] = useState(localDateTimeValue());
  const [departmentId, setDepartmentId] = useState(item.departmentId ?? currentUser.departmentId ?? "obras");
  const [operatorName, setOperatorName] = useState(currentUser.name);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [claimSummary, setClaimSummary] = useState("");
  const [claimEvidence, setClaimEvidence] = useState<string[]>(
    (item.governmentEvidence ?? []).slice(-3).map((entry) => entry.id),
  );
  const [claimDepartment, setClaimDepartment] = useState(item.departmentId ?? currentUser.departmentId ?? "obras");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const evidence = item.governmentEvidence ?? [];
  const claims = item.completionClaims ?? [];
  const canUpload = can("evidence:upload", item);
  const canClaim = can("case:manage", item);
  const sampleImages = useMemo(() => {
    const fallback = item.photos.map((photo) => photo.url);
    return [...new Set([...fallback, stockPhoto("acta")])].slice(0, 4);
  }, [item.photos]);

  const resetEvidenceForm = () => {
    setTitle("");
    setNote("");
    setKind("after");
    setPerformedAt(localDateTimeValue());
    setPreviewUrl("");
    setFileName("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_500_000) {
      setError("La imagen supera 1.5 MB. Usa un archivo más pequeño o una imagen de muestra.");
      return;
    }
    try {
      setPreviewUrl(await readFileAsDataUrl(file));
      setFileName(file.name);
      setError(null);
    } catch {
      setError("No pudimos leer la imagen. Intenta con otro archivo.");
    }
  };

  const submitEvidence = async () => {
    setError(null);
    if (!title.trim() || !note.trim() || !previewUrl) {
      setError("Completa título, descripción y una fotografía o documento.");
      return;
    }
    setBusy("evidence");
    try {
      const record = await uploadEvidence(item.id, {
        kind,
        title,
        note,
        url: previewUrl,
        fileName: fileName || undefined,
        performedAt: new Date(performedAt).toISOString(),
        departmentId,
        operatorName,
        authorId: currentUser.id,
      });
      setClaimEvidence((current) => [...new Set([...current, record.id])]);
      resetEvidenceForm();
      setMode(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la evidencia.");
    } finally {
      setBusy(null);
    }
  };

  const submitClaim = async () => {
    setError(null);
    if (!claimSummary.trim()) {
      setError("Explica qué intervención se realizó.");
      return;
    }
    if (claimEvidence.length === 0) {
      setError("Selecciona al menos una evidencia para respaldar el cierre operativo.");
      return;
    }
    setBusy("claim");
    try {
      await recordCompletion(item.id, {
        summary: claimSummary,
        evidenceIds: claimEvidence,
        departmentId: claimDepartment,
        claimedBy: operatorName || currentUser.name,
      });
      setClaimSummary("");
      setMode(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el cierre.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="panel government-evidence">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Evidencia de gobierno</span>
            <h2>Intervención y evidencia propia</h2>
            <p>Fotos antes/después, explicación, fecha, área y operador quedan en un historial auditable.</p>
          </div>
          {canUpload ? (
            <button type="button" className="button button--primary button--small" onClick={() => { setMode(mode === "evidence" ? null : "evidence"); setError(null); }}>
              <ImagePlus size={15} /> Cargar evidencia
            </button>
          ) : (
            <span className="permission-chip"><LockKeyhole size={13} /> Solo lectura</span>
          )}
        </div>

        {!canUpload ? <p className="permission-note">{permissionReason("evidence:upload", item)}</p> : null}

        {mode === "evidence" && canUpload ? (
          <div className="gov-evidence-form">
            <div className="gov-evidence-form__grid">
              <label>
                <span>Tipo de evidencia</span>
                <select value={kind} onChange={(event) => setKind(event.target.value as GovernmentEvidenceRecord["kind"])}>
                  <option value="before">Antes de la intervención</option>
                  <option value="after">Después de la intervención</option>
                  <option value="document">Documento o acta</option>
                </select>
              </label>
              <label>
                <span>Fecha y hora de la intervención</span>
                <input type="datetime-local" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} />
              </label>
              <label>
                <span>Área responsable</span>
                <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                  {(currentUser.departmentId
                    ? DEPARTMENTS.filter((department) => department.id === currentUser.departmentId)
                    : DEPARTMENTS
                  ).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
              <label>
                <span>Operador que realizó el trabajo</span>
                <input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} placeholder="Nombre del operador" />
              </label>
            </div>
            <label>
              <span>Título de la evidencia</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Bacheo terminado y señalizado" />
            </label>
            <label>
              <span>¿Qué se hizo y qué debe saber la ciudadanía?</span>
              <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe el alcance, materiales y cualquier limitación visible." />
            </label>

            <div className="gov-upload-row">
              <input ref={fileInput} type="file" accept="image/*,application/pdf" onChange={(event) => void chooseFile(event.target.files?.[0])} hidden />
              <button type="button" className="button button--secondary button--small" onClick={() => fileInput.current?.click()}>
                <Upload size={15} /> Elegir archivo
              </button>
              <div className="sample-upload-list">
                <span>o usa una imagen de muestra:</span>
                {sampleImages.map((url, index) => (
                  <button type="button" key={url} className={previewUrl === url ? "is-selected" : ""} onClick={() => { setPreviewUrl(url); setFileName(`muestra-${index + 1}.svg`); }}>
                    <img src={url} alt={`Muestra ${index + 1}`} />
                  </button>
                ))}
              </div>
            </div>
            {previewUrl ? (
              <div className="gov-upload-preview">
                <img src={previewUrl} alt="Vista previa de la evidencia" />
                <div><strong>{fileName || "Archivo seleccionado"}</strong><span>{dataSource === "core" ? "Se enviará al núcleo de Session 1 como evidencia de gobierno." : "Se guardará como datos de demostración en este navegador."}</span></div>
                <button type="button" onClick={() => { setPreviewUrl(""); setFileName(""); }} aria-label="Quitar archivo"><X size={15} /></button>
              </div>
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button type="button" className="button button--primary button--small" onClick={() => void submitEvidence()} disabled={busy === "evidence"}>
                {busy === "evidence" ? <span className="button-spinner" /> : <Check size={15} />} Guardar evidencia
              </button>
              <button type="button" className="button button--ghost button--small" onClick={() => setMode(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}

        {evidence.length === 0 ? (
          <div className="empty-state empty-state--inline">
            <Camera size={20} />
            <strong>Aún no hay evidencia de gobierno</strong>
            <p>La evidencia del especialista, si existe, se conserva por separado en la orden de trabajo.</p>
          </div>
        ) : (
          <div className="gov-evidence-grid">
            {evidence.map((entry) => (
              <a href={entry.url} target="_blank" rel="noreferrer" className="gov-evidence-card" key={entry.id}>
                <div className="gov-evidence-card__media">
                  {entry.kind === "document" ? <span className="document-thumb"><FileText size={26} /></span> : <img src={entry.url} alt={entry.title} />}
                  <span>{KIND_LABELS[entry.kind]}</span>
                </div>
                <strong>{entry.title}</strong>
                <p>{entry.note}</p>
                <div className="gov-evidence-card__meta">
                  <span><User size={12} /> {entry.operatorName}</span>
                  <span>{getDepartment(entry.departmentId)?.shortName ?? entry.departmentId}</span>
                  <time>{formatDate(entry.performedAt, true)}</time>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="panel completion-claim">
        <div className="panel__head">
          <div>
            <span className="eyebrow">Cierre operativo</span>
            <h2>Aviso de trabajo terminado</h2>
            <p>Este aviso es una declaración de gobierno. No sustituye la validación de la comunidad.</p>
          </div>
          {canClaim ? (
            <button type="button" className="button button--secondary button--small" onClick={() => { setMode(mode === "claim" ? null : "claim"); setClaimSummary(claimSummary || `Se completó la intervención de ${CATEGORY_LABELS[item.category].toLowerCase()} en ${item.colonia}.`); setError(null); }}>
              <CheckCircle2 size={15} /> {claims.length > 0 ? "Nuevo aviso de cierre" : "Declarar trabajo terminado"}
            </button>
          ) : <span className="permission-chip"><LockKeyhole size={13} /> Solo lectura</span>}
        </div>

        {!canClaim ? <p className="permission-note">{permissionReason("case:manage", item)}</p> : null}

        {mode === "claim" && canClaim ? (
          <div className="completion-form">
            <label>
              <span>Resumen de la intervención realizada</span>
              <textarea rows={3} value={claimSummary} onChange={(event) => setClaimSummary(event.target.value)} />
            </label>
            <div className="claim-evidence-picker">
              <span>Evidencia asociada</span>
              {evidence.length === 0 ? <p>Primero carga al menos una fotografía o documento.</p> : evidence.map((entry) => (
                <label key={entry.id} className="checkline">
                  <input
                    type="checkbox"
                    checked={claimEvidence.includes(entry.id)}
                    onChange={(event) => setClaimEvidence((current) => event.target.checked ? [...new Set([...current, entry.id])] : current.filter((id) => id !== entry.id))}
                  />
                  <span>{entry.title} · {KIND_LABELS[entry.kind]}</span>
                </label>
              ))}
            </div>
            <div className="claim-meta-row">
              <label><span>Área que declara</span><select value={claimDepartment} onChange={(event) => setClaimDepartment(event.target.value)}>{DEPARTMENTS.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <div><span>Declara</span><strong>{operatorName || currentUser.name}</strong><small>{currentUser.organizationName}</small></div>
            </div>
            <div className="immutability-note">
              <ShieldAlert size={15} />
              <p>El aviso no reescribe el folio SUAC, no marca la verificación ciudadana como exitosa y no borra evidencia ni disputas anteriores.</p>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button type="button" className="button button--primary button--small" onClick={() => void submitClaim()} disabled={busy === "claim"}>
                {busy === "claim" ? <span className="button-spinner" /> : <CheckCircle2 size={15} />} Registrar cierre operativo
              </button>
              <button type="button" className="button button--ghost button--small" onClick={() => setMode(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}

        {claims.length === 0 ? (
          <p className="analysis-empty">Todavía no existe un aviso de cierre operativo de gobierno.</p>
        ) : (
          <div className="claim-history">
            {[...claims].reverse().map((claim, index) => {
              const claimEvidenceItems = evidence.filter((entry) => claim.evidenceIds.includes(entry.id));
              return (
                <article className="claim-record" key={claim.id}>
                  <div className="claim-record__head">
                    <div><strong>{index === 0 ? "Aviso vigente" : "Aviso anterior"}</strong><span>{formatDate(claim.claimedAt, true)} · {claim.claimedBy}</span></div>
                    <span className="claim-status"><Clock3 size={12} /> Cierre operativo</span>
                  </div>
                  <p>{claim.summary}</p>
                  <div className="claim-record__evidence">
                    {claimEvidenceItems.map((entry) => <a href={entry.url} target="_blank" rel="noreferrer" key={entry.id}>{KIND_LABELS[entry.kind]} · {entry.title}</a>)}
                  </div>
                  <small>{claim.note}</small>
                </article>
              );
            })}
          </div>
        )}

        {dataSource === "core" ? (
          <p className="permission-note">
            En modo núcleo, el cierre se registra como cambio de estado operativo
            (POST /issues/[id]/operational). La publicación de un resultado público sigue pendiente de contrato.
          </p>
        ) : null}
      </section>
    </>
  );
}

export function ResolutionDisputePanel({ item }: { item: GovernmentCase }) {
  const {
    currentUser,
    can,
    permissionReason,
    respondDispute,
    dataSource,
  } = useGovernment();
  const [response, setResponse] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState("Evidencia de seguimiento");
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpUrl, setFollowUpUrl] = useState("");
  const [followUpFileName, setFollowUpFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dispute = item.dispute;

  if (!dispute) return null;

  const claim = (item.completionClaims ?? []).find((entry) => entry.id === dispute.claimId);
  const claimEvidence = (item.governmentEvidence ?? []).filter((entry) => claim?.evidenceIds.includes(entry.id));
  const canRespond = can("dispute:respond", item);
  const sampleImage = item.photos[0]?.url ?? stockPhoto("acta");

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_500_000) {
      setError("El archivo supera 1.5 MB. Usa uno más pequeño o una imagen de muestra.");
      return;
    }
    try {
      setFollowUpUrl(await readFileAsDataUrl(file));
      setFollowUpFileName(file.name);
      setError(null);
    } catch {
      setError("No pudimos leer el archivo de seguimiento.");
    }
  };

  const submit = async () => {
    setError(null);
    if (!response.trim()) {
      setError("Escribe una respuesta antes de enviarla.");
      return;
    }
    setBusy(true);
    try {
      await respondDispute(item.id, {
        text: response,
        authorId: currentUser.id,
        authorName: currentUser.name,
        departmentId: item.departmentId ?? currentUser.departmentId ?? "obras",
        followUpEvidence: followUpOpen && followUpUrl ? {
          kind: "document",
          title: followUpTitle,
          note: followUpNote || "Evidencia de seguimiento agregada para atender la disputa.",
          url: followUpUrl,
          fileName: followUpFileName || undefined,
          performedAt: new Date().toISOString(),
          departmentId: item.departmentId ?? currentUser.departmentId ?? "obras",
          operatorName: currentUser.name,
          authorId: currentUser.id,
        } : undefined,
      });
      setResponse("");
      setFollowUpOpen(false);
      setFollowUpUrl("");
      setFollowUpNote("");
      setFollowUpTitle("Evidencia de seguimiento");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar la respuesta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`panel dispute-panel dispute-panel--${dispute.status}`}>
      <div className="panel__head">
        <div>
          <span className="eyebrow">Disputa ciudadana</span>
          <h2>La comunidad no valida este cierre</h2>
          <p>La disputa se conserva aunque exista un aviso operativo de trabajo terminado.</p>
        </div>
        <span className={`dispute-status dispute-status--${dispute.status}`}><AlertTriangle size={13} /> {dispute.status === "open" ? "Abierta" : "Con respuesta de gobierno"}</span>
      </div>

      <div className="dispute-summary">
        <div className="dispute-summary__icon"><AlertTriangle size={22} /></div>
        <div>
          <span>{dispute.citizenName} · {formatDate(dispute.openedAt, true)}</span>
          <strong>{dispute.reason}</strong>
          <p>{dispute.detail}</p>
        </div>
      </div>

      <div className="dispute-evidence-grid">
        <figure className="dispute-evidence">
          {dispute.evidence ? <img src={dispute.evidence.url} alt={dispute.evidence.caption} /> : null}
          <figcaption><Camera size={13} /> {dispute.evidence?.caption ?? "Sin fotografía ciudadana adjunta."}</figcaption>
        </figure>
        <div className="dispute-original-claim">
          <span className="dispute-original-claim__label"><LockKeyhole size={13} /> Aviso original conservado</span>
          {claim ? (
            <>
              <strong>{claim.claimedBy} · {formatDate(claim.claimedAt, true)}</strong>
              <p>{claim.summary}</p>
              <div className="claim-record__evidence">
                {claimEvidence.map((entry) => <a href={entry.url} target="_blank" rel="noreferrer" key={entry.id}>{KIND_LABELS[entry.kind]} · {entry.title}</a>)}
              </div>
            </>
          ) : <p>El aviso original ya no está disponible, pero la disputa se conserva.</p>}
        </div>
      </div>

      <div className="dispute-responses">
        <h3>Respuestas de gobierno</h3>
        {dispute.responses.length === 0 ? (
          <p className="analysis-empty">Aún no hay respuesta oficial. La mesa puede explicar el siguiente paso y adjuntar evidencia adicional.</p>
        ) : dispute.responses.map((entry) => {
          const evidenceItems = (item.governmentEvidence ?? []).filter((evidence) => entry.followUpEvidenceIds.includes(evidence.id));
          return (
            <article className="dispute-response" key={entry.id}>
              <Initials name={entry.respondedBy} />
              <div>
                <div className="dispute-response__head"><strong>{entry.respondedBy}</strong><time>{formatDate(entry.respondedAt, true)}</time></div>
                <p>{entry.text}</p>
                {evidenceItems.length > 0 ? <div className="claim-record__evidence">{evidenceItems.map((evidence) => <a href={evidence.url} target="_blank" rel="noreferrer" key={evidence.id}>{KIND_LABELS[evidence.kind]} · {evidence.title}</a>)}</div> : null}
              </div>
            </article>
          );
        })}
      </div>

      {canRespond ? (
        <div className="dispute-response-form">
          <label>
            <span>Respuesta para la ciudadanía</span>
            <textarea rows={3} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Explica qué revisará el área, qué evidencia adicional existe y cuándo habrá una nueva actualización." />
          </label>
          <button type="button" className="text-link dispute-followup-toggle" onClick={() => setFollowUpOpen((value) => !value)}>
            <ImagePlus size={14} /> {followUpOpen ? "Quitar evidencia de seguimiento" : "Adjuntar evidencia de seguimiento"}
          </button>
          {followUpOpen ? (
            <div className="dispute-followup">
              <label><span>Título</span><input value={followUpTitle} onChange={(event) => setFollowUpTitle(event.target.value)} /></label>
              <label><span>Qué muestra la evidencia</span><textarea rows={2} value={followUpNote} onChange={(event) => setFollowUpNote(event.target.value)} placeholder="Ej. Segunda inspección, fisura medida y nuevo colado programado." /></label>
              <div className="gov-upload-row">
                <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={(event) => void chooseFile(event.target.files?.[0])} />
                <button type="button" className="button button--secondary button--small" onClick={() => fileInput.current?.click()}><Upload size={15} /> Elegir archivo</button>
                <button type="button" className={`sample-followup ${followUpUrl === sampleImage ? "is-selected" : ""}`} onClick={() => { setFollowUpUrl(sampleImage); setFollowUpFileName("muestra-seguimiento.svg"); }}>Usar imagen de muestra</button>
              </div>
              {followUpUrl ? <div className="gov-upload-preview"><img src={followUpUrl} alt="Evidencia de seguimiento" /><div><strong>{followUpFileName || "Archivo de seguimiento"}</strong><span>Se conservará junto a esta respuesta.</span></div><button type="button" onClick={() => setFollowUpUrl("")} aria-label="Quitar evidencia"><X size={15} /></button></div> : null}
            </div>
          ) : null}
          <div className="immutability-note">
            <LockKeyhole size={15} />
            <p>La respuesta no cambia la verificación ciudadana ni cierra la disputa. Sólo la ciudadanía puede actualizar su resultado.</p>
          </div>
          {dataSource === "core" ? (
            <p className="permission-note">
              En modo núcleo, la evidencia de seguimiento se envía a la API. El texto de respuesta
              se registra en el núcleo y queda visible para la ciudadanía.
            </p>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions">
            <button type="button" className="button button--primary button--small" onClick={() => void submit()} disabled={busy}>
              {busy ? <span className="button-spinner" /> : <MessageSquare size={15} />} Enviar respuesta
            </button>
          </div>
        </div>
      ) : (
        <p className="permission-note"><LockKeyhole size={13} /> {permissionReason("dispute:respond", item)}</p>
      )}
    </section>
  );
}


export function LinkedReportsPanel({ item }: { item: GovernmentCase }) {
  const { cases } = useGovernment();
  const linked = item.relatedCaseIds
    .map((id) => cases.find((entry) => entry.id === id))
    .filter((entry): entry is GovernmentCase => Boolean(entry));

  if (linked.length === 0) return null;

  return (
    <section className="panel linked-reports">
      <div className="panel__head">
        <div>
          <span className="eyebrow">Reportes vinculados</span>
          <h2>Otros reportes ciudadanos de este mismo problema</h2>
          <p>Se muestran por separado para no inflar apoyos ni duplicar la evidencia.</p>
        </div>
        <span className="linked-reports__count">
          <Link2Icon /> {linked.length} vinculados
        </span>
      </div>
      <div className="linked-report-list">
        {linked.map((entry) => (
          <Link href={`/gobierno/reportes/${entry.id}`} className="linked-report" key={entry.id}>
            <span className="linked-report__folio">{entry.folio}</span>
            <div className="linked-report__body">
              <strong>{entry.title}</strong>
              <span>
                <MapPin size={12} /> {entry.colonia} · Reportado {relativeTime(entry.reportedAt)}
              </span>
            </div>
            <div className="linked-report__facts">
              <span><Users size={12} /> {entry.citizen.supportCount} apoyos</span>
              <StatusBadge status={entry.status} />
            </div>
            <span className="linked-report__open">Abrir <ChevronRightIcon /></span>
          </Link>
        ))}
      </div>
      <p className="linked-reports__note">
        <FileText size={14} /> El caso principal suma {item.independentReportCount ?? 1} reportes independientes.
        Los apoyos de cada expediente no se suman como si fueran personas distintas.
      </p>
    </section>
  );
}

function Link2Icon() {
  return <LinkIcon size={13} />;
}

function ChevronRightIcon() {
  return <ChevronRight size={13} />;
}

export function OperatorAssignmentPanel({ item }: { item: GovernmentCase }) {
  const { operatorRoster, can, permissionReason, assignOperator, dataSource } = useGovernment();
  const [operatorId, setOperatorId] = useState(item.assignedOperatorId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAssign = can("case:assign", item);
  const options = operatorRoster.filter(
    (user) => user.role === "department_operator" && user.departmentId === item.departmentId,
  );

  const submit = async () => {
    if (!operatorId) return;
    setBusy(true);
    setError(null);
    try {
      await assignOperator(item.id, operatorId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo asignar al operador.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel operator-panel">
      <div className="panel__head">
        <div>
          <span className="eyebrow">Responsable operativo</span>
          <h2>Seguimiento del área</h2>
        </div>
        <UserCheck size={18} />
      </div>
      {dataSource === "core" ? (
        <div className="dispatch-source-note" role="note">
          <LockKeyhole size={14} />
          <span>
            Roster simulado: el núcleo no expone operadores. Esta lista son cuentas de
            demostración y la asignación de operador queda registrada en el núcleo.
          </span>
        </div>
      ) : null}
      <div className="operator-panel__current">
        <span className="operator-panel__avatar">
          {(item.assignedOperatorName ?? "Sin asignar").split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
        </span>
        <div>
          <strong>{item.assignedOperatorName ?? "Sin operador asignado"}</strong>
          <span>{getDepartment(item.departmentId)?.shortName ?? "Sin área responsable"}</span>
        </div>
      </div>
      {!item.departmentId ? (
        <p className="permission-note"><LockKeyhole size={13} /> Asigna primero un área responsable para habilitar operadores.</p>
      ) : !canAssign ? (
        <p className="permission-note"><LockKeyhole size={13} /> {permissionReason("case:assign", item)}</p>
      ) : options.length === 0 ? (
        <p className="permission-note"><LockKeyhole size={13} /> No hay operadores de demostración para esta área.</p>
      ) : (
        <div className="operator-panel__form">
          <label>
            <span>Operador del área</span>
            <select value={operatorId} onChange={(event) => setOperatorId(event.target.value)}>
              <option value="">Seleccionar operador</option>
              {options.map((user) => (
                <option key={user.id} value={user.id}>{user.name} · {user.title}</option>
              ))}
            </select>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button
            type="button"
            className="button button--secondary button--full button--small"
            disabled={!operatorId || operatorId === item.assignedOperatorId || busy}
            onClick={() => void submit()}
          >
            {busy ? <span className="button-spinner button-spinner--dark" /> : <UserCheck size={15} />}
            {item.assignedOperatorId ? "Reasignar responsable" : "Asignar responsable"}
          </button>
        </div>
      )}
    </section>
  );
}

function Initials({ name }: { name: string }) {
  return <span className="dispute-avatar">{name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}
