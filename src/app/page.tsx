import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  MapPin,
  MessageSquare,
  Search,
  Send,
  ThumbsUp,
  Users,
} from "lucide-react";
import { CaseCard } from "@/components/case-card";
import { CaseMap } from "@/components/map/case-map";
import { StatCard } from "@/components/stat-card";
import { CategoryIcon } from "@/components/category-icon";
import { DemoSeedButton } from "@/components/demo-seed-button";
import { buttonStyles } from "@/components/ui/button";
import { CATEGORY_META, STATUS_META } from "@/lib/taxonomy";
import { formatNumber, isUnoptimizedImage } from "@/lib/utils";
import { currentBackend, getCaseService } from "@/server/services/container";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: Send,
    title: "Reporta",
    body: "Describe el problema, marca el punto en el mapa y adjunta fotos si puedes.",
  },
  {
    icon: ThumbsUp,
    title: "Apoya",
    body: "Si tu colonia tiene el mismo problema, apoya el reporte en lugar de duplicarlo.",
  },
  {
    icon: Search,
    title: "Da seguimiento",
    body: "Consulta el estado, las observaciones de la comunidad y las actualizaciones publicadas.",
  },
  {
    icon: BadgeCheck,
    title: "Verifica resultados",
    body: "Cuando hay una intervención, revisa la evidencia disponible en el reporte.",
  },
];

export default async function HomePage() {
  const service = getCaseService();
  const demoAvailable = currentBackend() === "demo";
  const [stats, recent] = await Promise.all([
    service.getPublicStats(),
    service.listCases({ pageSize: 6 }),
  ]);

  const topCategories = stats.by_category.slice(0, 5);
  const maxCategory = Math.max(1, ...topCategories.map((entry) => entry.count));
  const mapCases = recent.items.map((item) => ({
    case_id: item.case_id,
    display_id: item.display_id,
    title: item.title,
    colonia: item.colonia,
    category: item.category,
    status: item.status,
    support_count: item.support_count,
    latitude: item.latitude,
    longitude: item.longitude,
  }));
  const heroImage = process.env.NEXT_PUBLIC_HERO_IMAGE_URL?.trim();
  const topColonias = stats.by_colonia.slice(0, 4);

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative isolate overflow-hidden border-b border-line bg-surface">
        <div
          className={heroImage ? "absolute inset-0 bg-cover bg-center" : "hero-day absolute inset-0"}
          style={
            heroImage
              ? {
                  backgroundImage: `linear-gradient(90deg, #f7f4ed 0%, rgba(247,244,237,.97) 32%, rgba(247,244,237,.86) 48%, rgba(247,244,237,.32) 68%, rgba(247,244,237,.04) 86%), url(${heroImage})`,
                  backgroundPosition: "center 58%",
                }
              : undefined
          }
          aria-hidden
        />

        <div className="container-page relative py-14 sm:py-16 lg:py-24">
          <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-navy-600 sm:text-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-royal-600" aria-hidden />
            Cuauhtémoc más segura, más conectada
          </p>

          <h1 className="mt-5 max-w-[13em] text-[33px] font-black uppercase leading-[0.92] tracking-[-0.035em] text-navy-900 sm:text-[64px] lg:text-[82px]">
            Tu colonia.
            <br />
            Tus prioridades.
            <br />
            <span className="mt-2 inline-block border-b-[10px] border-[#FFD84D] pb-1 sm:border-b-[14px]">
              Más resultados.
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-navy-700 sm:text-lg">
            Reporta, apoya y da seguimiento a los problemas de tu comunidad en Cuauhtémoc.
            Juntos podemos construir una alcaldía más habitable.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/explorar" className={buttonStyles({ size: "lg" })}>
              Explorar reportes <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            {demoAvailable ? <DemoSeedButton hero label="Probar la demo" /> : null}
            <Link
              href="/#como-funciona"
              className={buttonStyles({ variant: "secondary", size: "lg" })}
            >
              Cómo funciona
            </Link>
            <Link
              href="/reportar"
              className="inline-flex h-12 items-center gap-1.5 px-2 text-[15px] font-semibold text-navy-800 underline decoration-navy-100 decoration-2 underline-offset-[6px] hover:text-royal-700 hover:decoration-royal-400"
            >
              Reportar un problema
            </Link>
          </div>

          <p className="mt-9 max-w-lg text-[11px] leading-relaxed text-navy-500">
            Plataforma ciudadana independiente. No representa un canal oficial de la Alcaldía
            Cuauhtémoc.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------------- stats */}
      <div className="container-page relative z-10 -mt-9">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={<ClipboardGlyph />}
            value={formatNumber(stats.total_cases)}
            label="Reportes recibidos en Cuauhtémoc"
            tone="rose"
          />
          <StatCard
            icon={<Users className="h-6 w-6" />}
            value={formatNumber(stats.total_supports)}
            label="Apoyos de la comunidad"
            tone="amber"
          />
          <StatCard
            icon={<CheckCircle2 className="h-6 w-6" />}
            value={formatNumber(stats.resolved_cases)}
            label="Casos resueltos con evidencia"
            tone="emerald"
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 px-1">
          <p className="hidden text-[11px] font-medium text-navy-500 sm:block">
            Cifras actualizadas con los reportes de este entorno.
          </p>
          {stats.is_demo ? (
            <p className="ml-auto text-[10px] font-bold uppercase tracking-[0.16em] text-navy-500">
              Demo · cifras ilustrativas
            </p>
          ) : null}
        </div>
      </div>

      {/* ---------------------------------------------------------- priorities */}
      <section id="prioridades" className="container-page scroll-mt-24 py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-royal-700">
              Lo que más importa hoy
            </p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Prioridades de la comunidad</h2>
            <p className="mt-3 max-w-2xl text-navy-500">
              Conoce los problemas que más reportan las vecinas y vecinos de Cuauhtémoc. Los apoyos
              muestran interés de la comunidad; no equivalen a una prioridad oficial del gobierno.
            </p>
          </div>
          <Link href="/explorar?sort=supported" className={buttonStyles({ variant: "outline", size: "md" })}>
            Ver todas las prioridades <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_1fr]">
          <div className="space-y-3">
            {topCategories.map((entry, index) => {
              const meta = CATEGORY_META[entry.category];
              return (
                <Link
                  key={entry.category}
                  href={`/explorar?category=${entry.category}`}
                  className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-royal-200 hover:shadow-[var(--shadow-float)]"
                >
                  <span className="w-5 text-center text-base font-black tabular-nums text-navy-900">
                    {index + 1}
                  </span>
                  <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${meta.chip}`}>
                    <CategoryIcon category={entry.category} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-bold text-navy-900 group-hover:text-royal-700">
                        {meta.label}
                      </p>
                      <p className="shrink-0 text-xs font-semibold tabular-nums text-navy-500">
                        {entry.count} {entry.count === 1 ? "reporte" : "reportes"}
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-50">
                      <div
                        className={`h-full rounded-full ${meta.dot}`}
                        style={{ width: `${Math.max(12, (entry.count / maxCategory) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700 transition-colors group-hover:bg-royal-50 group-hover:text-royal-700">
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              );
            })}

            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-navy-500">
                Colonias con más actividad
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {topColonias.map((colonia) => (
                  <li key={colonia.colonia}>
                    <Link
                      href={`/explorar?colonia=${encodeURIComponent(colonia.colonia)}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-royal-50 hover:text-royal-700"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {colonia.colonia}
                      <span className="tabular-nums text-navy-500">{colonia.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <CaseMap cases={mapCases} className="min-h-[420px] lg:min-h-full" />
        </div>
      </section>

      {/* ------------------------------------------------------ recent reports */}
      <section className="border-y border-line py-16 sm:py-20">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-royal-700">
                Actividad reciente
              </p>
              <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Reportes de tu comunidad</h2>
              <p className="mt-3 max-w-xl text-navy-500">
                Problemas reportados por vecinas y vecinos. Apoya los que también te afectan.
              </p>
            </div>
            <Link href="/explorar" className={buttonStyles({ variant: "secondary", size: "md" })}>
              Explorar todos <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recent.items.slice(0, 6).map((item, index) => (
              <CaseCard key={item.case_id} item={item} priority={index < 2} />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- process */}
      <section id="como-funciona" className="container-page scroll-mt-24 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-royal-700">Cómo funciona</p>
          <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">
            De un reporte a una solución verificable
          </h2>
          <p className="mt-3 text-navy-500">
            VotaVía ordena la participación ciudadana en cuatro pasos claros. Cada acción queda
            registrada y es visible para toda la comunidad.
          </p>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-royal-50 text-royal-700">
                <step.icon className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-navy-500">
                Paso {index + 1}
              </p>
              <h3 className="mt-1 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-500">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="relative mt-10 overflow-hidden rounded-2xl bg-royal-600 p-6 text-white shadow-[var(--shadow-float)] sm:p-9">
          <span
            className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[#FFD84D]/25 blur-2xl"
            aria-hidden
          />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
                Menos de dos minutos
              </p>
              <h3 className="mt-2 text-xl font-extrabold sm:text-2xl">
                Un reporte tarda menos de dos minutos
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                No necesitas cuenta para reportar. Si quieres guardar tu reporte y recibir
                actualizaciones, puedes usar tu correo al final.
              </p>
            </div>
            <Link
              href="/reportar"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-base font-bold text-navy-900 shadow-[0_14px_30px_-18px_rgba(0,0,0,.5)] hover:bg-[#fffdf8]"
            >
              Reportar ahora <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- results */}
      <section className="border-t border-line bg-white py-16 sm:py-20">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-royal-700">Resultados</p>
              <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">
                Lo que la comunidad ya logró
              </h2>
              <p className="mt-3 max-w-xl text-navy-500">
                Casos con evidencia publicada. Cuando un reporte se marca como resuelto, aquí
                mostramos el antes y el después.
              </p>
            </div>
            <Link href="/resultados" className={buttonStyles({ variant: "outline", size: "md" })}>
              Ver resultados públicos <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {stats.recent_resolved.length ? (
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {stats.recent_resolved.map((item) => {
                const before = item.photos.find((photo) => photo.kind === "before");
                const after = item.photos.find((photo) => photo.kind === "after");
                return (
                  <Link
                    key={item.case_id}
                    href={`/reportes/${item.case_id}`}
                    className="group overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]"
                  >
                    <div className="grid grid-cols-2 gap-px bg-line">
                      <div className="relative aspect-[4/3] bg-navy-50">
                        {before ? (
                          <Image src={before.url} alt={`Antes: ${item.title}`} fill sizes="220px" className="object-cover" unoptimized={isUnoptimizedImage(before.url)} />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-xs text-navy-500">Sin foto previa</span>
                        )}
                        <span className="absolute left-2 top-2 rounded bg-navy-900/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Antes</span>
                      </div>
                      <div className="relative aspect-[4/3] bg-navy-50">
                        {after ? (
                          <Image src={after.url} alt={`Después: ${item.title}`} fill sizes="220px" className="object-cover" unoptimized={isUnoptimizedImage(after.url)} />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-xs text-navy-500">Sin foto final</span>
                        )}
                        <span className="absolute left-2 top-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Después</span>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-navy-500">
                        <span>{item.display_id}</span>
                        <span aria-hidden>·</span>
                        <span>{item.colonia}</span>
                        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">
                          {STATUS_META[item.status].label}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-bold leading-snug text-navy-900 group-hover:text-royal-700">
                        {item.title}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-line p-8 text-center">
              <p className="text-sm text-navy-500">
                Todavía no hay casos resueltos con evidencia. Los resultados aparecerán aquí.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm text-navy-500">
            <span className="inline-flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-royal-600" aria-hidden />
              {formatNumber(stats.total_observations)} observaciones de la comunidad
            </span>
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-royal-600" aria-hidden />
              {stats.by_colonia.length} colonias con actividad
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-royal-600" aria-hidden />
              {stats.by_category.length} categorías de servicio
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

function ClipboardGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="4" width="14" height="17" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M9 3.5h6a1.5 1.5 0 0 1 0 3H9a1.5 1.5 0 1 1 0-3Z" fill="currentColor" />
      <path d="M9 11h6M9 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
