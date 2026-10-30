import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  MessageSquare,
  ShieldCheck,
  ThumbsUp,
  Users,
} from "lucide-react";
import { CaseMap } from "@/components/map/case-map";
import { CategoryChip } from "@/components/category-chip";
import { StatusBadge } from "@/components/status-badge";
import { SupportButton } from "@/components/support-button";
import { ObservationForm } from "@/components/observation-form";
import { Timeline } from "@/components/timeline";
import { ClaimReport } from "@/components/report/claim-report";
import { IssueSupportButton } from "@/components/issues/issue-support-button";
import { VerificationPanel } from "@/components/issues/verification-panel";
import { EvidenceUploader } from "@/components/issues/evidence-uploader";
import { CategoryIcon } from "@/components/category-icon";
import { buttonStyles } from "@/components/ui/button";
import { CATEGORY_META, OBSERVATION_META, STATUS_META, ORIGIN_META } from "@/lib/taxonomy";
import { cn, formatDate, formatNumber, relativeTime } from "@/lib/utils";
import { getParticipant } from "@/server/auth/session";
import { getCaseService } from "@/server/services/container";
import { hasSupabaseAuth } from "@/server/env";
import type {
  CasePhotograph,
  CommunityVerificationStatus,
  IssueOperationalStatus,
  ReportObservation,
} from "@/shared/votavia-contract";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const item = await getCaseService().getCase(id);
  if (!item) return { title: "Reporte no encontrado" };
  return {
    title: `${item.display_id} · ${item.title}`,
    description: item.description.slice(0, 160),
  };
}

function PhotoGrid({ photos, title }: { photos: CasePhotograph[]; title: string }) {
  if (!photos.length) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl border border-dashed border-line bg-navy-50 text-sm text-navy-500">
        Este reporte no incluye fotografías.
      </div>
    );
  }
  const [first, ...rest] = photos;
  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-line bg-navy-50">
        <Image
          src={first.url}
          alt={`Fotografía del reporte: ${title}`}
          fill
          sizes="(min-width: 1024px) 720px, 100vw"
          className="object-cover"
          priority
          unoptimized={first.url.endsWith(".svg")}
        />
        {first.kind !== "report" ? (
          <span
            className={cn(
              "absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white",
              first.kind === "before" ? "bg-navy-900/85" : "bg-emerald-600",
            )}
          >
            {first.kind === "before" ? "Antes" : "Después"}
          </span>
        ) : null}
      </div>
      {rest.length ? (
        <div className="grid grid-cols-3 gap-2">
          {rest.map((photo) => (
            <div key={photo.photo_id} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-navy-50">
              <Image
                src={photo.url}
                alt={photo.caption ?? `Fotografía del reporte: ${title}`}
                fill
                sizes="220px"
                className="object-cover"
                unoptimized={photo.url.endsWith(".svg")}
              />
              {photo.kind !== "report" ? (
                <span
                  className={cn(
                    "absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase text-white",
                    photo.kind === "before" ? "bg-navy-900/85" : "bg-emerald-600",
                  )}
                >
                  {photo.kind === "before" ? "Antes" : "Después"}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const OPERATIONAL_LABEL: Record<IssueOperationalStatus, string> = {
  new: "Nuevo",
  triaged: "Clasificado",
  assigned: "Asignado",
  in_progress: "En proceso",
  completed: "Trabajo completado",
  cancelled: "Cancelado",
};

const VERIFICATION_LABEL: Record<CommunityVerificationStatus, string> = {
  unreviewed: "Sin verificar por la comunidad",
  confirmed: "La comunidad confirma que sigue",
  disputed: "La comunidad disputa el resultado",
  verified_resolved: "Resolución verificada por la comunidad",
};

function ObservationItem({ item }: { item: ReportObservation }) {
  const meta = OBSERVATION_META[item.kind];
  return (
    <li className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
          {meta.label}
        </span>
        <span className="text-[11px] text-navy-500">{item.author_label}</span>
        <time dateTime={item.created_at} className="ml-auto text-[11px] text-navy-500">
          {relativeTime(item.created_at)}
        </time>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-navy-700">{item.body}</p>
    </li>
  );
}

export default async function ReportePage({ params }: PageProps) {
  const { id } = await params;
  const participant = await getParticipant();
  const service = getCaseService();
  const item = await service.getCase(id, participant);
  if (!item) notFound();

  const issue = item.issue_id ? await service.getIssue(item.issue_id, participant) : null;
  const officialStatusHistories = new Map(
    await Promise.all(
      (issue?.official_records ?? []).map(async (record) => [
        record.official_record_id,
        await service.getOfficialRecordStatusHistory(record.official_record_id),
      ] as const),
    ),
  );

  const [timeline, observations, related] = await Promise.all([
    service.getCaseTimeline(item.case_id),
    service.getCaseObservations(item.case_id),
    service.findNearbyCases({
      latitude: item.latitude,
      longitude: item.longitude,
      category: item.category,
      radiusMeters: 600,
      limit: 4,
    }),
  ]);

  const categoryMeta = CATEGORY_META[item.category];
  const statusMeta = STATUS_META[item.status];
  const nearby = related.filter((entry) => entry.case_id !== item.case_id).slice(0, 3);
  const progress = Math.min(100, Math.round((statusMeta.step / 5) * 100));
  const photos = item.photos;
  const before = photos.find((photo) => photo.kind === "before");
  const after = photos.find((photo) => photo.kind === "after");

  return (
    <div className="bg-surface">
      <div className="border-b border-line bg-white">
        <div className="container-page py-5">
          <Link
            href="/explorar"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-royal-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Explorar reportes
          </Link>
        </div>
      </div>

      <div className="container-page py-6 sm:py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryChip category={item.category} />
                <StatusBadge status={item.status} />
                {item.origin ? (
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset"
                    style={{
                      color: ORIGIN_META[item.origin].color,
                      backgroundColor: `${ORIGIN_META[item.origin].color}12`,
                      boxShadow: `inset 0 0 0 1px ${ORIGIN_META[item.origin].color}40`,
                    }}
                  >
                    {ORIGIN_META[item.origin].label}
                  </span>
                ) : null}
                {item.is_demo ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-200">
                    Datos de demostración
                  </span>
                ) : null}
                {item.is_mine ? (
                  <span className="rounded-full bg-royal-50 px-2.5 py-1 text-[11px] font-bold text-royal-700 ring-1 ring-inset ring-royal-200">
                    Tu reporte
                  </span>
                ) : null}
              </div>
              <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-[2.15rem]">{item.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-navy-500">
                <span className="font-semibold tabular-nums text-navy-700">{item.display_id}</span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden /> {item.colonia}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" aria-hidden /> {formatDate(item.created_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ThumbsUp className="h-4 w-4" aria-hidden /> {formatNumber(item.support_count)} apoyos
                </span>
              </div>
            </div>

            <PhotoGrid photos={photos} title={item.title} />

            {before && after ? (
              <section aria-labelledby="antes-despues" className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                <h2 id="antes-despues" className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Evidencia del resultado
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[before, after].map((photo) => (
                    <figure key={photo.photo_id} className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={photo.url}
                          alt={photo.caption ?? (photo.kind === "before" ? "Antes" : "Después")}
                          fill
                          sizes="320px"
                          className="object-cover"
                          unoptimized={photo.url.endsWith(".svg")}
                        />
                      </div>
                      <figcaption className="px-2 py-1.5 text-[11px] font-semibold text-navy-700">
                        {photo.kind === "before" ? "Antes" : "Después"}
                        {photo.caption ? ` · ${photo.caption}` : ""}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            ) : null}

            <section aria-labelledby="descripcion" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <h2 id="descripcion" className="text-base font-extrabold">Descripción</h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-navy-700">
                {item.description}
              </p>
              {item.location.address_hint ? (
                <p className="mt-3 inline-flex items-start gap-1.5 rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-600">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {item.location.address_hint}
                </p>
              ) : null}
              {item.has_safety_concern || item.has_accessibility_concern ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.has_safety_concern ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Riesgo de seguridad
                    </span>
                  ) : null}
                  {item.has_accessibility_concern ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-200">
                      <Users className="h-3.5 w-3.5" aria-hidden /> Barrera de accesibilidad
                    </span>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section aria-labelledby="estado" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <h2 id="estado" className="text-base font-extrabold">Estado del caso</h2>
              <p className="mt-1 text-xs text-navy-500">
                Tres fuentes distintas de información. No se mezclan: el avance de VotaVía no
                reemplaza el estado oficial ni la verificación ciudadana.
              </p>
              <dl className="mt-4 grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-royal-200 bg-royal-50/60 p-3">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-royal-800">
                    Avance en VotaVía
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-navy-900">
                    {issue ? OPERATIONAL_LABEL[issue.operational_status] : STATUS_META[item.status].label}
                  </dd>
                  <dd className="mt-1 text-[11px] text-navy-600">
                    Flujo de trabajo operativo de la plataforma.
                  </dd>
                </div>
                <div className="rounded-xl border border-line bg-surface p-3">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-navy-600">
                    Estado oficial
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-navy-900">
                    {issue?.external_status ?? "Sin dato oficial"}
                  </dd>
                  <dd className="mt-1 text-[11px] text-navy-600">
                    {issue && issue.official_record_count > 0
                      ? `${issue.official_record_count} registro(s) de gobierno vinculado(s).`
                      : "Este caso no tiene registros oficiales vinculados."}
                  </dd>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                    Verificación ciudadana
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-navy-900">
                    {VERIFICATION_LABEL[issue?.community_verification_status ?? "unreviewed"]}
                  </dd>
                  <dd className="mt-1 text-[11px] text-navy-600">
                    {issue ? `${formatNumber(issue.verification.total)} verificaciones activas.` : "Aún sin verificaciones."}
                  </dd>
                </div>
              </dl>

              {issue ? (
                <div className="mt-4 rounded-xl border border-line bg-surface p-3">
                  <p className="text-sm font-bold text-navy-900">Verifica tú mismo</p>
                  <p className="mt-0.5 text-[11px] text-navy-500">
                    Solo la comunidad puede marcar un caso como resuelto. El aviso de gobierno abre
                    la verificación, no la sustituye.
                  </p>
                  <div className="mt-3">
                    <VerificationPanel
                      issueId={issue.issue_id}
                      initial={issue.verification}
                      authenticated={Boolean(participant.user_id)}
                      loginHref={`/login?next=${encodeURIComponent(`/reportes/${item.case_id}`)}`}
                    />
                  </div>
                </div>
              ) : null}
            </section>

            {issue && issue.official_records.length ? (
              <section aria-labelledby="registros-oficiales" className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
                <h2 id="registros-oficiales" className="text-base font-extrabold">
                  Registros oficiales vinculados
                </h2>
                <p className="mt-1 text-xs text-navy-600">
                  Datos importados de sistemas de gobierno. Son fuente original, no reportes
                  ciudadanos, y no se actualizan desde aquí.
                </p>
                <ul className="mt-3 space-y-2">
                  {issue.official_records.map((record) => (
                    <li key={record.official_record_id} className="rounded-xl border border-teal-200 bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-teal-800">
                        <span className="rounded-full bg-teal-50 px-2 py-0.5">{record.source_system}</span>
                        <span className="font-mono text-navy-700">{record.external_folio}</span>
                        {record.original_status ? (
                          <span className="rounded-full bg-navy-50 px-2 py-0.5 text-navy-700">
                            {record.original_status}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm font-bold text-navy-900">
                        {record.title ?? record.original_category ?? "Registro oficial"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-navy-500">
                        {[record.colonia, record.reported_at ? formatDate(record.reported_at) : null]
                          .filter(Boolean)
                          .join(" · ")}
                        {record.imported_at ? ` · importado el ${formatDate(record.imported_at)}` : ""}
                      </p>
                      {record.source_url ? (
                        <a
                          href={record.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-1.5 inline-flex text-[11px] font-semibold text-royal-700 hover:text-royal-800"
                        >
                          Ver en el sistema de origen
                        </a>
                      ) : null}
                      <p className="mt-1 text-[10px] text-navy-500">
                        Fuente:{" "}
                        {record.attribution ??
                          String(record.provenance?.attribution ?? record.source_system)}
                        {record.license ? ` · ${record.license}` : ""}
                        {record.last_synced_at
                          ? ` · sincronizado ${formatDate(record.last_synced_at)}`
                          : ""}
                      </p>
                      {(officialStatusHistories.get(record.official_record_id) ?? []).length ? (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[10px] font-semibold text-teal-800">
                            Historial de estado oficial
                          </summary>
                          <ol className="mt-1 space-y-0.5 border-l-2 border-teal-200 pl-2">
                            {(officialStatusHistories.get(record.official_record_id) ?? []).map(
                              (entry) => (
                                <li key={entry.history_id} className="text-[10px] text-navy-600">
                                  <span className={entry.is_current ? "font-bold text-navy-900" : ""}>
                                    {entry.status_text}
                                  </span>
                                  {entry.changed_at
                                    ? ` · ${formatDate(entry.changed_at)}`
                                    : ` · observado ${formatDate(entry.observed_at)}`}
                                </li>
                              ),
                            )}
                          </ol>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {issue ? (
              <section aria-labelledby="evidencia" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
                <h2 id="evidencia" className="text-base font-extrabold">Evidencia y seguimiento</h2>
                <p className="mt-1 text-xs text-navy-500">
                  Fotos adicionales de la comunidad y evidencia de intervención de gobierno, con
                  atribución visible.
                </p>

                {issue.evidence.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {issue.evidence.map((entry) => (
                      <figure key={entry.evidence_id} className="overflow-hidden rounded-xl border border-line bg-navy-50">
                        <div className="relative aspect-[4/3]">
                          <Image
                            src={entry.url}
                            alt={entry.caption ?? "Evidencia del caso"}
                            fill
                            sizes="240px"
                            className="object-cover"
                            unoptimized={entry.url.endsWith(".svg")}
                          />
                        </div>
                        <figcaption className="px-2 py-1.5 text-[10px] leading-snug text-navy-600">
                          <span className="font-bold text-navy-800">
                            {entry.uploader_role === "government" ? "Gobierno" : "Comunidad"}
                          </span>
                          {entry.caption ? ` · ${entry.caption}` : ""}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-500">
                    Todavía no hay evidencia adicional publicada.
                  </p>
                )}

                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-sm font-bold text-navy-900">Agregar evidencia</p>
                  <p className="mt-0.5 text-[11px] text-navy-500">
                    Tu foto y descripción se publican con la atribución “Comunidad”.
                  </p>
                  <div className="mt-2.5">
                    <EvidenceUploader issueId={issue.issue_id} />
                  </div>
                </div>
              </section>
            ) : null}

            <section aria-labelledby="ubicacion" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <h2 id="ubicacion" className="text-base font-extrabold">Ubicación</h2>
              <p className="mt-1 text-xs text-navy-500">
                El punto se muestra aproximado para proteger la privacidad de quien reportó.
              </p>
              <CaseMap
                className="mt-3 h-[300px]"
                cases={[
                  {
                    case_id: item.case_id,
                    display_id: item.display_id,
                    title: item.title,
                    colonia: item.colonia,
                    category: item.category,
                    status: item.status,
                    support_count: item.support_count,
                    latitude: item.latitude,
                    longitude: item.longitude,
                    origin: item.origin ?? "citizen",
                  },
                ]}
                center={[item.latitude, item.longitude]}
                zoom={15.4}
              />
            </section>

            <section aria-labelledby="seguimiento" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-3">
                <h2 id="seguimiento" className="text-base font-extrabold">Seguimiento</h2>
                <span className="text-xs font-semibold text-navy-500">{progress}% del proceso</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy-100" aria-hidden>
                <div className="h-full rounded-full bg-royal-600" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-navy-500">{statusMeta.description}</p>
              <div className="mt-5">
                <Timeline events={timeline} emptyMessage="Todavía no hay movimientos publicados para este reporte." />
              </div>
            </section>

            <section aria-labelledby="observaciones" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-2">
                <h2 id="observaciones" className="text-base font-extrabold">Voces de la comunidad</h2>
                <span className="inline-flex items-center gap-1 text-xs text-navy-500">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden /> {observations.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-navy-500">
                Confirma si el problema sigue, agrega contexto o señala un riesgo. No incluyas datos personales.
              </p>
              <div className="mt-4">
                <ObservationForm caseId={item.case_id} />
              </div>
              {observations.length ? (
                <ul className="mt-5 space-y-2.5">
                  {observations.map((observation) => (
                    <ObservationItem key={observation.observation_id} item={observation} />
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-500">
                  Aún no hay observaciones. Sé la primera persona en dar contexto.
                </p>
              )}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start gap-3">
                <span className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", categoryMeta.chip)}>
                  <CategoryIcon category={item.category} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-navy-900">{categoryMeta.label}</p>
                  <p className="mt-0.5 text-xs text-navy-500">
                    {item.colonia} · {formatDate(item.updated_at)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                {issue ? (
                  <IssueSupportButton
                    issueId={issue.issue_id}
                    initialCount={issue.support_count}
                    initialSupported={issue.supported_by_me}
                    authenticated={Boolean(participant.user_id)}
                  />
                ) : (
                  <>
                    <SupportButton
                      caseId={item.case_id}
                      initialCount={item.support_count}
                      initialSupported={item.supported_by_me}
                      size="lg"
                      className="w-full"
                    />
                    <p className="mt-2 text-center text-[11px] text-navy-500">
                      Apoyar ayuda a priorizar el caso. Un apoyo por persona.
                    </p>
                  </>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 text-center">
                <div>
                  <dt className="text-[11px] text-navy-500">Apoyos</dt>
                  <dd className="text-lg font-extrabold tabular-nums text-navy-900">
                    {formatNumber(issue?.support_count ?? item.support_count)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-navy-500">Observaciones</dt>
                  <dd className="text-lg font-extrabold tabular-nums text-navy-900">
                    {formatNumber(item.observation_count)}
                  </dd>
                </div>
              </dl>
            </div>

            {!item.is_mine ? (
              <ClaimReport
                caseId={item.case_id}
                displayId={item.display_id}
                demoAuth={!hasSupabaseAuth()}
              />
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                  <ClipboardCheck className="h-4 w-4" aria-hidden /> Este reporte está en tu cuenta
                </p>
                <p className="mt-1 text-xs text-emerald-900/80">
                  Recibirás actualizaciones cuando cambie el estado.
                </p>
                <Link href="/mis-reportes" className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "mt-3 w-full")}>
                  Ver mis reportes
                </Link>
              </div>
            )}

            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
                <ShieldCheck className="h-4 w-4 text-royal-600" aria-hidden /> Privacidad
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-navy-500">
                Los datos de contacto nunca se publican. Las fotografías y el punto del mapa son
                visibles para la comunidad y los equipos de atención.
              </p>
            </div>

            {nearby.length ? (
              <div className="rounded-2xl border border-line bg-white p-4">
                <p className="text-sm font-bold text-navy-900">Reportes relacionados</p>
                <ul className="mt-2 space-y-2">
                  {nearby.map((entry) => (
                    <li key={entry.case_id}>
                      <Link
                        href={`/reportes/${entry.case_id}`}
                        className="group flex items-start justify-between gap-2 rounded-xl px-1 py-1.5 hover:bg-navy-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-navy-800 group-hover:text-royal-700">
                            {entry.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-navy-500">
                            {entry.display_id} · a {Math.round(entry.distance_meters / 10) * 10} m
                          </span>
                        </span>
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-400" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
