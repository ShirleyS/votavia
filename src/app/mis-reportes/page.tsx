import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, LogIn, PlusCircle, ThumbsUp } from "lucide-react";
import { CaseCard } from "@/components/case-card";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { buttonStyles } from "@/components/ui/button";
import { formatNumber, maskEmail } from "@/lib/utils";
import { getParticipant, getSessionUser } from "@/server/auth/session";
import { getCaseService } from "@/server/services/container";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis reportes",
  description: "Consulta y da seguimiento a los reportes que enviaste y apoyaste en VotaVía.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MisReportesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="bg-surface">
        <div className="container-page py-12 sm:py-16">
          <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-7 text-center shadow-[var(--shadow-card)]">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-royal-50 text-royal-700">
              <LogIn className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold">Entra para ver tus reportes</h1>
            <p className="mt-2 text-sm text-navy-500">
              Vincula los reportes que enviaste a tu correo y consulta su estado, apoyos y
              actualizaciones en un solo lugar.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/login?next=/mis-reportes" className={buttonStyles({ size: "md" })}>
                Entrar con mi correo
              </Link>
              <Link href="/reportar" className={buttonStyles({ variant: "secondary" })}>
                Reportar sin cuenta
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const participant = await getParticipant();
  const service = getCaseService();
  const page = Math.max(1, Number(single(params.page) ?? 1) || 1);
  const [mine, supported] = await Promise.all([
    service.listCases({ ownerId: user.user_id, page, pageSize: 9 }, participant),
    service.listCases(
      { supportedBy: participant.participant_key, page: 1, pageSize: 6, sort: "supported" },
      participant,
    ),
  ]);

  const guardado = single(params.guardado) === "1";
  const claimError = single(params.claim_error) === "1";

  return (
    <div className="bg-surface">
      <div className="border-b border-line">
        <div className="container-page py-8 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-royal-700">Tu cuenta</p>
              <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Mis reportes</h1>
              <p className="mt-2 max-w-xl text-sm text-navy-500 sm:text-base">
                Sesión iniciada como <span className="font-semibold text-navy-700">{maskEmail(user.email)}</span>.
                Tus datos de contacto nunca se publican.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/mi-cuenta" className={buttonStyles({ variant: "secondary", size: "md" })}>
                Mi cuenta
              </Link>
              <Link href="/reportar" className={buttonStyles({ size: "md" })}>
                <PlusCircle className="h-4 w-4" aria-hidden /> Nuevo reporte
              </Link>
            </div>
          </div>

          <dl className="mt-6 grid max-w-md grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-surface p-4">
              <dt className="text-xs text-navy-500">Reportes enviados</dt>
              <dd className="mt-1 text-2xl font-extrabold tabular-nums">{formatNumber(mine.total)}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4">
              <dt className="text-xs text-navy-500">Reportes que apoyas</dt>
              <dd className="mt-1 text-2xl font-extrabold tabular-nums">{formatNumber(supported.total)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="container-page space-y-8 py-6 sm:py-8">
        {guardado ? (
          <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>Listo. Vinculamos el reporte a tu cuenta y ya aparece en esta lista.</p>
          </div>
        ) : null}
        {claimError ? (
          <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              No pudimos vincular ese reporte. Verifica que el correo coincida con el que usaste al
              reportarlo o solicita un enlace nuevo desde el reporte.
            </p>
          </div>
        ) : null}

        <section aria-labelledby="enviados">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-royal-600" aria-hidden />
            <h2 id="enviados" className="text-xl font-extrabold">Enviados por ti</h2>
          </div>
          {mine.items.length ? (
            <>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {mine.items.map((item, index) => (
                  <CaseCard key={item.case_id} item={item} priority={index < 3} />
                ))}
              </div>
              <div className="mt-6">
                <Pagination
                  page={mine.page}
                  pageSize={mine.pageSize}
                  total={mine.total}
                  basePath="/mis-reportes"
                  params={{}}
                />
              </div>
            </>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={<ClipboardList className="h-6 w-6" aria-hidden />}
                title="Aún no tienes reportes en esta cuenta"
                description="Si reportaste sin cuenta, abre el reporte y verifica tu correo para vincularlo. También puedes crear uno nuevo."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link href="/reportar" className={buttonStyles({ size: "sm" })}>
                      Reportar un problema
                    </Link>
                    <Link href="/explorar" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      Explorar reportes
                    </Link>
                  </div>
                }
              />
            </div>
          )}
        </section>

        <section aria-labelledby="apoyados">
          <div className="flex items-center gap-2">
            <ThumbsUp className="h-5 w-5 text-royal-600" aria-hidden />
            <h2 id="apoyados" className="text-xl font-extrabold">Reportes que apoyas</h2>
          </div>
          {supported.items.length ? (
            <>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {supported.items.map((item) => (
                  <CaseCard key={item.case_id} item={item} />
                ))}
              </div>
              <Link
                href="/explorar?sort=supported"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-royal-700 hover:text-royal-800"
              >
                Ver todos los reportes más apoyados <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-line bg-white/70 p-5 text-sm text-navy-500">
              Todavía no has apoyado reportes. Cuando apoyes uno, aparecerá aquí para que puedas
              seguirle la pista.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
