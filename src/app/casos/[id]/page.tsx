import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, FileText, MapPin, ShieldCheck } from "lucide-react";
import { CaseCard } from "@/components/case-card";
import { CaseMap } from "@/components/map/case-map";
import { CategoryChip } from "@/components/category-chip";
import { IssueSupportButton } from "@/components/issues/issue-support-button";
import { VerificationPanel } from "@/components/issues/verification-panel";
import { EvidenceUploader } from "@/components/issues/evidence-uploader";
import { buttonStyles } from "@/components/ui/button";
import { ORIGIN_META } from "@/lib/taxonomy";
import { formatDate, formatNumber, isUnoptimizedImage } from "@/lib/utils";
import { getParticipant } from "@/server/auth/session";
import { getCaseService } from "@/server/services/container";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const issue = await getCaseService().getIssue(id);
  if (!issue) return { title: "Caso no encontrado" };
  return { title: `${issue.display_id} · ${issue.title}` };
}

const OPERATIONAL_LABEL: Record<string, string> = {
  new: "Nuevo",
  triaged: "Clasificado",
  assigned: "Asignado",
  in_progress: "En proceso",
  completed: "Trabajo completado",
  cancelled: "Cancelado",
};

export default async function IssuePage({ params }: PageProps) {
  const { id } = await params;
  const participant = await getParticipant();
  const issue = await getCaseService().getIssue(id, participant);
  if (!issue) notFound();

  const statusHistories = new Map(
    await Promise.all(
      issue.official_records.map(async (record) => [
        record.official_record_id,
        await getCaseService().getOfficialRecordStatusHistory(record.official_record_id),
      ] as const),
    ),
  );

  const origin = ORIGIN_META[issue.origin];
  const hasCoordinates = typeof issue.latitude === "number" && typeof issue.longitude === "number";

  return (
    <div className="bg-surface">
      <div className="border-b border-line">
        <div className="container-page py-5">
          <Link
            href="/explorar"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-royal-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Explorar
          </Link>
        </div>
      </div>

      <div className="container-page grid gap-8 py-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CategoryChip category={issue.category} />
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                style={{ color: origin.color, backgroundColor: `${origin.color}12` }}
              >
                {origin.label}
              </span>
              <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[11px] font-semibold text-navy-700">
                {issue.display_id}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight">{issue.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-500">
              {issue.colonia ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden /> {issue.colonia}
                </span>
              ) : null}
              <span>{formatNumber(issue.support_count)} apoyos</span>
              <span>{formatNumber(issue.report_count)} reporte(s)</span>
              <span>{formatNumber(issue.official_record_count)} registro(s) oficial(es)</span>
            </p>
          </div>

          <section aria-labelledby="estado" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <h2 id="estado" className="text-base font-extrabold">Estado del caso</h2>
            <dl className="mt-4 grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-royal-200 bg-royal-50/60 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-royal-800">VotaVía</dt>
                <dd className="mt-1 text-sm font-bold text-navy-900">
                  {OPERATIONAL_LABEL[issue.operational_status]}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-surface p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-navy-600">
                  Oficial
                </dt>
                <dd className="mt-1 text-sm font-bold text-navy-900">
                  {issue.external_status ?? "Sin dato oficial"}
                </dd>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                  Comunidad
                </dt>
                <dd className="mt-1 text-sm font-bold text-navy-900">
                  {issue.community_verification_status === "unreviewed"
                    ? "Sin verificar"
                    : issue.community_verification_status.replace(/_/g, " ")}
                </dd>
              </div>
            </dl>
            <div className="mt-4 rounded-xl border border-line bg-surface p-3">
              <VerificationPanel
                issueId={issue.issue_id}
                initial={issue.verification}
                authenticated={Boolean(participant.user_id)}
                loginHref={`/login?next=${encodeURIComponent(`/casos/${issue.issue_id}`)}`}
              />
            </div>
          </section>

          {hasCoordinates ? (
            <section aria-labelledby="mapa" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <h2 id="mapa" className="text-base font-extrabold">Ubicación</h2>
              <CaseMap
                className="mt-3 h-[300px]"
                cases={[
                  {
                    case_id: issue.issue_id,
                    display_id: issue.display_id,
                    title: issue.title,
                    colonia: issue.colonia ?? "",
                    category: issue.category,
                    status: "reported",
                    support_count: issue.support_count,
                    latitude: issue.latitude as number,
                    longitude: issue.longitude as number,
                    origin: issue.origin,
                    href: `/casos/${issue.issue_id}`,
                  },
                ]}
                center={[issue.latitude as number, issue.longitude as number]}
                zoom={15}
              />
            </section>
          ) : null}

          {issue.official_records.length ? (
            <section aria-labelledby="oficiales" className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
              <h2 id="oficiales" className="flex items-center gap-2 text-base font-extrabold">
                <Building2 className="h-4 w-4 text-teal-700" aria-hidden /> Registros oficiales
              </h2>
              <p className="mt-1 text-xs text-navy-600">
                Fuente original del gobierno. No se modifican desde VotaVía.
              </p>
              <ul className="mt-3 space-y-2">
                {issue.official_records.map((record) => (
                  <li key={record.official_record_id} className="rounded-xl border border-teal-200 bg-white p-3">
                    <p className="text-[11px] font-semibold text-teal-800">
                      {record.source_system} · <span className="font-mono">{record.external_folio}</span>
                      {record.original_status ? ` · ${record.original_status}` : ""}
                    </p>
                    <p className="mt-1 text-sm font-bold text-navy-900">
                      {record.title ?? record.original_category ?? "Registro oficial"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-navy-500">
                      Sincronizado: {record.last_synced_at ? formatDate(record.last_synced_at) : "—"}
                      {record.license ? ` · Licencia: ${record.license}` : ""}
                    </p>
                    {record.source_url ? (
                      <a
                        href={record.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-flex text-[11px] font-semibold text-royal-700"
                      >
                        Ver en el sistema de origen
                      </a>
                    ) : null}

                    {(statusHistories.get(record.official_record_id) ?? []).length ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] font-semibold text-navy-700">
                          Historial de estado oficial (
                          {statusHistories.get(record.official_record_id)?.length})
                        </summary>
                        <ol className="mt-1.5 space-y-1 border-l-2 border-teal-200 pl-2.5">
                          {(statusHistories.get(record.official_record_id) ?? []).map((entry) => (
                            <li key={entry.history_id} className="text-[11px] text-navy-600">
                              <span
                                className={
                                  entry.is_current ? "font-bold text-navy-900" : "font-medium"
                                }
                              >
                                {entry.status_text}
                              </span>
                              <span className="text-navy-500">
                                {" · "}
                                {entry.changed_at
                                  ? `cambio ${formatDate(entry.changed_at)}`
                                  : `observado ${formatDate(entry.observed_at)}`}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {issue.evidence.length ? (
            <section aria-labelledby="evidencia" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <h2 id="evidencia" className="text-base font-extrabold">Evidencia</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {issue.evidence.map((entry) => (
                  <figure key={entry.evidence_id} className="overflow-hidden rounded-xl border border-line">
                    <div className="relative aspect-[4/3] bg-navy-50">
                      <Image
                        src={entry.url}
                        alt={entry.caption ?? "Evidencia"}
                        fill
                        sizes="240px"
                        className="object-cover"
                        unoptimized={isUnoptimizedImage(entry.url)}
                      />
                    </div>
                    <figcaption className="px-2 py-1.5 text-[10px] text-navy-600">
                      <span className="font-bold">
                        {entry.uploader_role === "government" ? "Gobierno" : "Comunidad"}
                      </span>
                      {entry.caption ? ` · ${entry.caption}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          {issue.reports.length ? (
            <section aria-labelledby="reportes">
              <h2 id="reportes" className="text-lg font-extrabold">
                Reportes de la comunidad
              </h2>
              <p className="mt-1 text-xs text-navy-500">
                Este caso agrupa {issue.reports.length} reporte(s). Ninguno se elimina al agruparse.
              </p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {issue.reports.map((report) => (
                  <CaseCard key={report.case_id} item={report} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <IssueSupportButton
              issueId={issue.issue_id}
              initialCount={issue.support_count}
              initialSupported={issue.supported_by_me}
              authenticated={Boolean(participant.user_id)}
            />
            <p className="mt-3 text-center text-[11px] text-navy-500">
              Última actualización: {formatDate(issue.updated_at)}
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4">
            <p className="text-sm font-bold text-navy-900">Agregar evidencia</p>
            <p className="mt-0.5 text-[11px] text-navy-500">
              Fotos de seguimiento con atribución a la comunidad.
            </p>
            <div className="mt-2.5">
              <EvidenceUploader issueId={issue.issue_id} />
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
              <ShieldCheck className="h-4 w-4 text-royal-600" aria-hidden /> Transparencia
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-navy-500">
              Los estados de VotaVía, del gobierno y de la comunidad se muestran por separado. Un
              aviso de gobierno no marca el caso como resuelto sin verificación ciudadana.
            </p>
            <Link href="/resultados" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-royal-700">
              Ver resultados públicos <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
              <FileText className="h-4 w-4 text-royal-600" aria-hidden /> ¿Falta información?
            </p>
            <p className="mt-1.5 text-xs text-navy-500">
              Si el problema sigue o la resolución no es real, regístralo en la verificación.
            </p>
            <Link href="/reportar" className={buttonStyles({ variant: "secondary", size: "sm" }) + " mt-2 w-full"}>
              Reportar otro problema
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
