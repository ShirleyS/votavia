import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Building2, CheckCircle2, MapPin, MessageSquare, ThumbsUp, TrendingUp } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { buttonStyles } from "@/components/ui/button";
import { CATEGORY_META, STATUS_META } from "@/lib/taxonomy";
import { cn, formatDate, formatNumber, isUnoptimizedImage } from "@/lib/utils";
import { getCaseService } from "@/server/services/container";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resultados públicos",
  description:
    "Consulta los avances y resultados de los reportes ciudadanos atendidos en Cuauhtémoc, con evidencia antes y después.",
};

export default async function ResultadosPage() {
  const service = getCaseService();
  const [stats, resolved] = await Promise.all([
    service.getPublicStats(),
    service.listCases({ statuses: ["resolved"], pageSize: 12 }),
  ]);

  const maxCategory = Math.max(1, ...stats.by_category.map((entry) => entry.count));
  const topColonias = stats.by_colonia.slice(0, 8);
  const resolvedWithEvidence = resolved.items.filter((item) =>
    item.photos.some((photo) => photo.kind === "before" || photo.kind === "after"),
  );
  const showcase = resolvedWithEvidence.length ? resolvedWithEvidence : resolved.items;

  return (
    <div className="bg-surface">
      <section className="border-b border-line">
        <div className="container-page py-10 sm:py-12">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-royal-700">Transparencia</p>
              <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.03em] text-royal-700 sm:text-[38px]">Resultados públicos</h1>
              <p className="mt-2 max-w-2xl text-sm text-navy-500 sm:text-base">
                Lo que la comunidad reportó y lo que ya cambió. Cada resultado incluye evidencia
                cuando está disponible; los datos de demostración se muestran etiquetados.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/explorar" className={buttonStyles({ variant: "secondary", size: "md" })}>
                Explorar reportes
              </Link>
              <Link href="/reportar" className={buttonStyles({ size: "md" })}>
                Reportar un problema
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<MapPin className="h-5 w-5" aria-hidden />} value={formatNumber(stats.total_cases)} label="Reportes publicados" tone="royal" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5" aria-hidden />} value={formatNumber(stats.resolved_cases)} label="Reportes resueltos" tone="emerald" />
            <StatCard icon={<ThumbsUp className="h-5 w-5" aria-hidden />} value={formatNumber(stats.total_supports)} label="Apoyos ciudadanos" tone="amber" />
            <StatCard icon={<MessageSquare className="h-5 w-5" aria-hidden />} value={formatNumber(stats.total_observations)} label="Observaciones de la comunidad" tone="violet" />
          </div>
        </div>
      </section>

      <div className="container-page space-y-10 py-8 sm:py-10">
        <section aria-labelledby="antes-despues">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="antes-despues" className="text-2xl font-extrabold">Antes y después</h2>
              <p className="mt-1 text-sm text-navy-500">
                Casos con evidencia publicada de la intervención.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> {formatNumber(stats.resolved_cases)} resueltos
            </span>
          </div>

          {showcase.length ? (
            <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {showcase.map((item) => {
                const before = item.photos.find((photo) => photo.kind === "before");
                const after = item.photos.find((photo) => photo.kind === "after");
                return (
                  <article key={item.case_id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
                    <div className="grid grid-cols-2 gap-px bg-line">
                      <div className="relative aspect-[4/3] bg-navy-50">
                        {before ? (
                          <Image src={before.url} alt={`Antes: ${item.title}`} fill sizes="260px" className="object-cover" unoptimized={isUnoptimizedImage(before.url)} />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] text-navy-500">Sin foto previa</span>
                        )}
                        <span className="absolute left-2 top-2 rounded bg-navy-900/85 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Antes</span>
                      </div>
                      <div className="relative aspect-[4/3] bg-navy-50">
                        {after ? (
                          <Image src={after.url} alt={`Después: ${item.title}`} fill sizes="260px" className="object-cover" unoptimized={isUnoptimizedImage(after.url)} />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] text-navy-500">Sin foto final</span>
                        )}
                        <span className="absolute left-2 top-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Después</span>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-navy-500">
                        <span>{item.display_id}</span>
                        <span aria-hidden>·</span>
                        <span>{item.colonia}</span>
                        {item.is_demo ? (
                          <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Demo</span>
                        ) : (
                          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">
                            {STATUS_META[item.status].label}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 text-sm font-bold leading-snug text-navy-900">
                        <Link href={`/reportes/${item.case_id}`} className="hover:text-royal-700">
                          {item.title}
                        </Link>
                      </h3>
                      <p className="mt-1.5 text-xs text-navy-500">
                        {item.resolved_at ? `Resuelto el ${formatDate(item.resolved_at)}` : `Actualizado el ${formatDate(item.updated_at)}`}
                        {" · "}
                        {formatNumber(item.support_count)} apoyos
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState
                icon={<BadgeCheck className="h-6 w-6" aria-hidden />}
                title="Todavía no hay resultados publicados"
                description="Cuando un reporte se marque como resuelto y se publique evidencia, aparecerá aquí."
                action={
                  <Link href="/explorar" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    Ver reportes en seguimiento
                  </Link>
                }
              />
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section aria-labelledby="por-colonia" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-royal-600" aria-hidden />
              <h2 id="por-colonia" className="text-lg font-extrabold">Resultados por colonia</h2>
            </div>
            <p className="mt-1 text-xs text-navy-500">
              Reportes publicados, resueltos y apoyos acumulados.
            </p>
            {topColonias.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-wide text-navy-500">
                      <th scope="col" className="py-2 pr-3 font-semibold">Colonia</th>
                      <th scope="col" className="py-2 px-2 text-right font-semibold">Reportes</th>
                      <th scope="col" className="py-2 px-2 text-right font-semibold">Resueltos</th>
                      <th scope="col" className="py-2 pl-2 text-right font-semibold">Apoyos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topColonias.map((row) => (
                      <tr key={row.colonia} className="border-b border-line/70 last:border-0">
                        <th scope="row" className="py-2.5 pr-3 font-semibold text-navy-800">
                          <Link href={`/explorar?colonia=${encodeURIComponent(row.colonia)}`} className="hover:text-royal-700">
                            {row.colonia}
                          </Link>
                        </th>
                        <td className="py-2.5 px-2 text-right tabular-nums text-navy-600">{formatNumber(row.count)}</td>
                        <td className={cn("py-2.5 px-2 text-right font-semibold tabular-nums", row.resolved ? "text-emerald-700" : "text-navy-400")}>
                          {formatNumber(row.resolved)}
                        </td>
                        <td className="py-2.5 pl-2 text-right tabular-nums text-navy-600">{formatNumber(row.supports)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-navy-500">Aún no hay actividad por colonia.</p>
            )}
          </section>

          <section aria-labelledby="por-categoria" className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-royal-600" aria-hidden />
              <h2 id="por-categoria" className="text-lg font-extrabold">Temas más reportados</h2>
            </div>
            <p className="mt-1 text-xs text-navy-500">Distribución de reportes y resultados por categoría.</p>
            {stats.by_category.length ? (
              <ul className="mt-4 space-y-3">
                {stats.by_category.map((entry) => {
                  const meta = CATEGORY_META[entry.category];
                  return (
                    <li key={entry.category}>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md", meta.chip)}>
                          <CategoryIcon category={entry.category} className="h-3.5 w-3.5" />
                        </span>
                        <Link href={`/explorar?category=${entry.category}`} className="font-semibold text-navy-800 hover:text-royal-700">
                          {meta.shortLabel}
                        </Link>
                        <span className="ml-auto tabular-nums text-navy-500">
                          {formatNumber(entry.count)} · {formatNumber(entry.resolved)} resueltos
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy-50" aria-hidden>
                        <div
                          className={cn("h-full rounded-full", meta.dot)}
                          style={{ width: `${Math.max(6, Math.round((entry.count / maxCategory) * 100))}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-navy-500">Aún no hay datos por categoría.</p>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-royal-200 bg-royal-50 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold text-navy-900">¿Tu colonia tiene un pendiente?</h2>
              <p className="mt-1 max-w-xl text-sm text-navy-600">
                Reporta el problema o apoya un caso que ya existe. La prioridad se construye entre
                todas y todos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/reportar" className={buttonStyles({ size: "md" })}>
                Reportar un problema
              </Link>
              <Link href="/explorar" className={buttonStyles({ variant: "secondary", size: "md" })}>
                Explorar reportes
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
