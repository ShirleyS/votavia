import Link from "next/link";
import Image from "next/image";
import { ArrowRight, List, Map as MapIcon, Search, SlidersHorizontal, ThumbsUp, X } from "lucide-react";
import { CaseMap } from "@/components/map/case-map";
import { CategoryChip } from "@/components/category-chip";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { buttonStyles } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";
import { CATEGORY_META, COLONIAS, STATUS_META, ORIGIN_META } from "@/lib/taxonomy";
import { cn, formatNumber, relativeTime } from "@/lib/utils";
import { CASE_CATEGORIES, CASE_STATUSES, type Case, type CaseCategory, type CaseStatus } from "@/shared/votavia-contract";
import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explorar reportes",
  description: "Mapa y lista de reportes ciudadanos en Alcaldía Cuauhtémoc.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExplorarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const category = single(params.category) as CaseCategory | undefined;
  const status = single(params.status) as CaseStatus | undefined;
  const colonia = single(params.colonia);
  const query = single(params.q);
  const sort = (single(params.sort) as "recent" | "supported" | undefined) ?? "recent";
  const vista = single(params.vista) ?? "mapa";
  const page = Number(single(params.page) ?? 1) || 1;

  const categoryIsValid = category && CASE_CATEGORIES.includes(category);
  const statusIsValid = status && CASE_STATUSES.includes(status);

  const participant = await getParticipant();
  const includeOfficial = single(params.oficial) !== "0";
  const [result, officialIssues] = await Promise.all([
    getCaseService().listCases(
    {
      categories: categoryIsValid ? [category] : undefined,
      statuses: statusIsValid ? [status] : undefined,
      colonia: colonia || undefined,
      query: query || undefined,
      sort,
        page,
        pageSize: 9,
      },
      participant,
    ),
    includeOfficial
      ? getCaseService().listIssues({ origins: ["official", "mixed"], pageSize: 40 })
      : Promise.resolve({ items: [], total: 0 }),
  ]);

  const activeFilters = [
    categoryIsValid ? { label: CATEGORY_META[category].shortLabel, href: buildHref(params, { category: undefined, page: undefined }) } : null,
    statusIsValid ? { label: STATUS_META[status].label, href: buildHref(params, { status: undefined, page: undefined }) } : null,
    colonia ? { label: colonia, href: buildHref(params, { colonia: undefined, page: undefined }) } : null,
    query ? { label: `“${query}”`, href: buildHref(params, { q: undefined, page: undefined }) } : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;

  const mapCases = [
    ...result.items.map((item) => ({
      case_id: item.case_id,
      display_id: item.display_id,
      title: item.title,
      colonia: item.colonia,
      category: item.category,
      status: item.status,
      support_count: item.support_count,
      latitude: item.latitude,
      longitude: item.longitude,
      origin: item.origin ?? ("citizen" as const),
      href: `/reportes/${item.case_id}`,
    })),
    ...officialIssues.items
      .filter(
        (issue) =>
          issue.origin !== "citizen" &&
          issue.report_count === 0 &&
          typeof issue.latitude === "number" &&
          typeof issue.longitude === "number",
      )
      .map((issue) => ({
        case_id: issue.issue_id,
        display_id: issue.display_id,
        title: issue.title,
        colonia: issue.colonia ?? "",
        category: issue.category,
        status: "reported" as const,
        support_count: issue.support_count,
        latitude: issue.latitude as number,
        longitude: issue.longitude as number,
        origin: issue.origin,
        href: `/casos/${issue.issue_id}`,
        status_label:
          issue.operational_status === "completed"
            ? "Atendido"
            : issue.operational_status === "in_progress"
              ? "En proceso"
              : "Registro oficial",
      })),
  ];

  return (
    <div className="bg-surface">
      <div className="border-b border-line bg-white">
        <div className="container-page py-8 sm:py-10">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-royal-700">Explorar</p>
              <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Prioridades de la comunidad</h1>
              <p className="mt-2 max-w-2xl text-sm text-navy-500 sm:text-base">
                Conoce los problemas más importantes para las vecinas y vecinos de Cuauhtémoc.
                Explora, apoya y da seguimiento a lo que nuestra comunidad necesita.
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
              <Link
                href={buildHref(params, { vista: "mapa" })}
                aria-current={vista !== "lista" ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold",
                  vista !== "lista" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-900",
                )}
              >
                <MapIcon className="h-4 w-4" aria-hidden /> Mapa
              </Link>
              <Link
                href={buildHref(params, { vista: "lista" })}
                aria-current={vista === "lista" ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold",
                  vista === "lista" ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-900",
                )}
              >
                <List className="h-4 w-4" aria-hidden /> Lista
              </Link>
            </div>
          </div>

          <form id="buscar" action="/explorar" method="get" className="mt-6 rounded-2xl border border-line bg-surface p-3 sm:p-4">
            <input type="hidden" name="vista" value={vista} />
            <div className="grid gap-2.5 md:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-500" aria-hidden />
                <label htmlFor="q" className="sr-only">
                  Buscar por colonia, calle o folio
                </label>
                <input
                  id="q"
                  name="q"
                  defaultValue={query ?? ""}
                  placeholder="Buscar colonia, calle o folio…"
                  className={cn(inputStyles, "pl-9")}
                />
              </div>
              <div>
                <label htmlFor="category" className="sr-only">
                  Categoría
                </label>
                <select id="category" name="category" defaultValue={categoryIsValid ? category : ""} className={inputStyles}>
                  <option value="">Todas las categorías</option>
                  {CASE_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {CATEGORY_META[value].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="status" className="sr-only">
                  Estado
                </label>
                <select id="status" name="status" defaultValue={statusIsValid ? status : ""} className={inputStyles}>
                  <option value="">Todos los estados</option>
                  {CASE_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_META[value].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="colonia" className="sr-only">
                  Colonia
                </label>
                <select id="colonia" name="colonia" defaultValue={colonia ?? ""} className={inputStyles}>
                  <option value="">Todas las colonias</option>
                  {COLONIAS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={buttonStyles({ size: "md" })}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filtrar
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-navy-500">Ordenar:</span>
              <SortLink params={params} value="recent" label="Más recientes" active={sort === "recent"} />
              <SortLink params={params} value="supported" label="Más apoyados" active={sort === "supported"} />
              {activeFilters.length ? (
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {activeFilters.map((filter) => (
                    <Link
                      key={filter.label}
                      href={filter.href}
                      className="inline-flex items-center gap-1 rounded-full bg-royal-50 px-2.5 py-1 text-xs font-semibold text-royal-700 hover:bg-royal-100"
                    >
                      {filter.label} <X className="h-3 w-3" aria-hidden />
                    </Link>
                  ))}
                  <Link href="/explorar" className="text-xs font-semibold text-navy-500 underline">
                    Limpiar todo
                  </Link>
                </div>
              ) : null}
            </div>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-navy-500">
              <span className="font-semibold text-navy-900">{formatNumber(result.total)}</span>{" "}
              {result.total === 1 ? "reporte encontrado" : "reportes encontrados"}
            </p>
            <Link href="/reportar" className="inline-flex items-center gap-1 font-semibold text-royal-700 hover:text-royal-800">
              Reportar un problema <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      <div className="container-page py-6 sm:py-8">
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" aria-hidden />}
            title="No encontramos reportes con esos filtros"
            description="Prueba con otra categoría, colonia o palabra. También puedes ser la primera persona en reportar este problema."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/explorar" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  Ver todos los reportes
                </Link>
                <Link href="/reportar" className={buttonStyles({ size: "sm" })}>
                  Reportar un problema
                </Link>
              </div>
            }
          />
        ) : vista === "lista" ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((item) => (
                <FullCard key={item.case_id} item={item} />
              ))}
            </div>
            <div className="mt-8">
              <Pagination page={result.page} pageSize={result.pageSize} total={result.total} basePath="/explorar" params={flatten(params)} />
            </div>
          </>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.1fr_1fr]">
            <div className="space-y-2.5">
              {result.items.map((item) => (
                <RowCard key={item.case_id} item={item} />
              ))}
              <div className="pt-3">
                <Pagination page={result.page} pageSize={result.pageSize} total={result.total} basePath="/explorar" params={flatten(params)} />
              </div>
            </div>
            <div className="space-y-2 lg:sticky lg:top-24 lg:self-start">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-white px-3 py-2 text-[11px] font-semibold text-navy-600">
                {(Object.keys(ORIGIN_META) as Array<keyof typeof ORIGIN_META>).map((origin) => (
                  <span key={origin} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white"
                      style={{
                        backgroundColor: ORIGIN_META[origin].color,
                        boxShadow: `0 0 0 1px ${ORIGIN_META[origin].color}`,
                      }}
                      aria-hidden
                    />
                    {ORIGIN_META[origin].label}
                  </span>
                ))}
                <Link
                  href={buildHref(params, { oficial: includeOfficial ? "0" : undefined })}
                  className="ml-auto text-[11px] font-semibold text-royal-700 hover:text-royal-800"
                >
                  {includeOfficial ? "Ocultar registros oficiales" : "Mostrar registros oficiales"}
                </Link>
              </div>
              <CaseMap cases={mapCases} className="h-[420px] lg:h-[calc(100vh-8rem)] lg:min-h-[560px]" />
              <p className="mt-2 text-[11px] leading-relaxed text-navy-500">
                Los puntos muestran reportes en el mapa. Si varios coinciden en la misma zona, se
                agrupan; haz clic en un grupo para acercarte.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildHref(
  current: Record<string, string | string[] | undefined>,
  patch: Record<string, string | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const entry = Array.isArray(value) ? value[0] : value;
    if (entry) search.set(key, entry);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) search.delete(key);
    else search.set(key, value);
  }
  const query = search.toString();
  return query ? `/explorar?${query}` : "/explorar";
}

function flatten(params: Record<string, string | string[] | undefined>) {
  const entries: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    entries[key] = Array.isArray(value) ? value[0] : value;
  }
  return entries;
}

function SortLink({
  params,
  value,
  label,
  active,
}: {
  params: Record<string, string | string[] | undefined>;
  value: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={buildHref(params, { sort: value === "recent" ? undefined : value, page: undefined })}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        active ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-white",
      )}
    >
      {label}
    </Link>
  );
}

function RowCard({ item }: { item: Case }) {
  const photo = item.photos[0];
  return (
    <article className="group flex items-stretch gap-3 rounded-2xl border border-line bg-white p-2.5 shadow-[var(--shadow-card)] transition-colors hover:border-royal-200 sm:p-3">
      <Link href={`/reportes/${item.case_id}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-navy-50 sm:h-28 sm:w-32">
        {photo ? (
          <Image
            src={photo.url}
            alt={`Fotografía: ${item.title}`}
            fill
            sizes="128px"
            className="object-cover"
            unoptimized={photo.url.endsWith(".svg")}
          />
        ) : (
          <span className="flex h-full items-center justify-center px-2 text-center text-[10px] font-semibold text-navy-500">
            {CATEGORY_META[item.category].shortLabel}
          </span>
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-navy-700">
          {item.display_id}
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-navy-900 sm:text-[15px]">
              <Link href={`/reportes/${item.case_id}`} className="hover:text-royal-700">
                {item.title}
              </Link>
            </h3>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-1 truncate text-xs text-navy-500">
            {item.colonia} · {relativeTime(item.created_at)}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <CategoryChip category={item.category} size="sm" />
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-navy-700">
            <ThumbsUp className="h-3.5 w-3.5 text-royal-600" aria-hidden />
            {formatNumber(item.support_count)}
            <span className="font-normal text-navy-500">apoyos</span>
          </span>
        </div>
      </div>
      <Link
        href={`/reportes/${item.case_id}`}
        aria-label={`Ver reporte ${item.display_id}`}
        className="flex w-8 shrink-0 items-center justify-center rounded-full text-navy-500 transition-colors group-hover:bg-royal-50 group-hover:text-royal-700"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

function FullCard({ item }: { item: Case }) {
  const photo = item.photos[0];
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
      <Link href={`/reportes/${item.case_id}`} className="relative block aspect-[16/10] bg-navy-50">
        {photo ? (
          <Image
            src={photo.url}
            alt={`Fotografía: ${item.title}`}
            fill
            sizes="(min-width: 1024px) 360px, 100vw"
            className="object-cover"
            unoptimized={photo.url.endsWith(".svg")}
          />
        ) : null}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-navy-700">
          {item.display_id}
        </span>
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <CategoryChip category={item.category} size="sm" />
          <StatusBadge status={item.status} />
        </div>
        <h3 className="text-base font-bold leading-snug">
          <Link href={`/reportes/${item.case_id}`} className="hover:text-royal-700">
            {item.title}
          </Link>
        </h3>
        <p className="text-xs text-navy-500">
          {item.colonia} · {relativeTime(item.created_at)} · {formatNumber(item.support_count)} apoyos
        </p>
      </div>
    </article>
  );
}
