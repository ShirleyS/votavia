import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { isLiveMode } from "@/public-api/config";
import { ApiPlayground } from "./_components/ApiPlayground";
import { CodeBlock } from "./_components/CodeBlock";
import { CodeTabs } from "./_components/CodeTabs";
import { ApiHero } from "./_components/ApiHero";
import {
  CATEGORY_LABELS,
  EXTERNAL_STATUS_KIND_LABELS,
  FRESHNESS_LABELS,
  ORIGIN_LABELS,
  RISK_LEVEL_LABELS,
  SAMPLE_CASE,
  SAMPLE_CASE_DETAIL,
  SAMPLE_CATEGORIES,
  SAMPLE_ERROR,
  SAMPLE_GEOJSON,
  SAMPLE_HEALTH,
  SAMPLE_OFFICIAL_REPORTS,
  SAMPLE_RISK,
  SAMPLE_STATISTICS,
  SIGNAL_TYPE_LABELS,
  STATUS_LABELS,
  VERIFICATION_LABELS,
  categoriesCurl,
  categoriesFetch,
  detailCurl,
  detailFetch,
  detailPython,
  geoJsonCurl,
  geoJsonFetch,
  healthCurl,
  healthFetch,
  listCurl,
  listFetch,
  listPython,
  officialReportsCurl,
  officialReportsFetch,
  openApiCurl,
  riskCurl,
  riskFetch,
  riskPython,
  statsCurl,
  statsFetch,
  statsPython,
} from "./content";

export const metadata: Metadata = {
  title: "Portal para desarrolladores",
  description:
    "Documentación en español de la API pública de VotaVía: casos urbanos publicados, GeoJSON, estadísticas, procedencia y señales preventivas aprobadas.",
};

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "") || "https://votavia.mx";
const LIVE = isLiveMode();
const HERO_IMAGE = process.env.NEXT_PUBLIC_API_HERO_IMAGE_URL?.trim() || undefined;

const NAV_ITEMS = [
  { href: "#introduccion", label: "Introducción" },
  { href: "#endpoints", label: "Endpoints" },
  { href: "#guia-rapida", label: "Guía rápida" },
  { href: "#datos", label: "Datos" },
  { href: "#procedencia", label: "Procedencia" },
  { href: "#privacidad", label: "Privacidad" },
  { href: "#integracion", label: "Integración" },
  { href: "#preguntas", label: "Preguntas" },
];

const endpointSummary = [
  {
    href: "#endpoint-casos",
    method: "GET",
    path: "/api/v1/public/cases",
    title: "Lista de casos",
    body: "Filtra por alcaldía, colonia, categoría, origen, verificación, fechas, apoyos o bbox.",
  },
  {
    href: "#endpoint-detalle",
    method: "GET",
    path: "/api/v1/public/cases/:id",
    title: "Detalle del caso",
    body: "Consulta un caso publicado con su línea de tiempo y observaciones públicas.",
  },
  {
    href: "#endpoint-geojson",
    method: "GET",
    path: "/api/v1/public/cases.geojson",
    title: "GeoJSON",
    body: "Colección FeatureCollection con coordenadas redondeadas y atributos seguros.",
  },
  {
    href: "#endpoint-categorias",
    method: "GET",
    path: "/api/v1/public/categories",
    title: "Categorías",
    body: "Catálogo de las ocho categorías con conteos y orígenes presentes en el dataset.",
  },
  {
    href: "#endpoint-oficiales",
    method: "GET",
    path: "/api/v1/public/official-reports",
    title: "Registros oficiales",
    body: "Solo registros importados con licencia y permiso verificados; el feed está apagado por defecto.",
  },
  {
    href: "#endpoint-estadisticas",
    method: "GET",
    path: "/api/v1/public/statistics",
    title: "Estadísticas",
    body: "Totales, tasa de resolución y desgloses por categoría, estado, colonia y origen.",
  },
  {
    href: "#endpoint-senales",
    method: "GET",
    path: "/api/v1/public/risk-signals",
    title: "Señales preventivas",
    body: "Salidas ya aprobadas del motor preventivo, con su nivel de atención y limitaciones.",
  },
  {
    href: "#endpoint-salud",
    method: "GET",
    path: "/api/v1/public/health",
    title: "Salud del servicio",
    body: "Estado de la fuente de datos, del feed oficial, de las señales y del límite de solicitudes.",
  },
];

const caseFields = [
  ["case_id", "UUID", "Identidad estable del caso. Es la única llave para el detalle."],
  ["display_id", "texto", "Referencia legible para personas, por ejemplo VOT-0001."],
  ["category", "enum", "Una de las ocho categorías del contrato compartido."],
  ["votavia_operational_status", "enum", "Estado operativo canónico del caso en VotaVía (Case.status de Session 1)."],
  ["status", "enum", "Espejo obsoleto de votavia_operational_status. Se mantiene por compatibilidad."],
  ["external_government_status", "objeto o null", "Estado reportado por una autoridad externa. kind: closed no significa resuelto."],
  ["community_verification_status", "enum", "Resultado de verificación comunitaria, independiente de los dos estados anteriores."],
  ["community_verification", "objeto", "El mismo resultado con resumen y fecha de verificación."],
  ["record_origin", "enum", "citizen, community o government_import. Distingue quién produjo el registro."],
  ["provenance", "objeto o null", "Fuente, folio, URL, licencia, permiso y frescura de los registros importados."],
  ["title", "texto", "Título depurado de datos personales, hasta 160 caracteres."],
  ["description", "texto", "Descripción depurada de correos, teléfonos y enlaces mágicos."],
  ["location", "objeto", "Colonia, alcaldía y coordenadas redondeadas; 110 m normal y 1 100 m si hay riesgo de seguridad."],
  ["photos", "arreglo", "Hasta 8 fotografías con URL, tipo, leyenda y fecha."],
  ["support_count", "entero", "Número de apoyos ciudadanos registrados."],
  ["observation_count", "entero", "Cantidad de observaciones públicas."],
  ["has_safety_concern", "booleano", "El reporte menciona un riesgo de seguridad."],
  ["has_accessibility_concern", "booleano", "El reporte menciona una barrera de accesibilidad."],
  ["is_demo", "booleano", "Distingue datos de demostración de datos reales."],
  ["created_at / updated_at", "fecha ISO", "Creación y última actualización del caso."],
  ["resolved_at", "fecha ISO o null", "Fecha de resolución cuando existe."],
  ["permalink", "URL", "Enlace al caso en la plataforma ciudadana."],
  ["timeline", "arreglo", "Solo en el detalle: eventos marcados como públicos."],
  ["observations", "arreglo", "Solo en el detalle: observaciones ciudadanas publicadas."],
];

function SectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-forest-2">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl leading-tight text-forest sm:text-4xl">{title}</h2>
      {lead ? <p className="mt-4 text-[15px] leading-7 text-slate-soft">{lead}</p> : null}
    </div>
  );
}

function MethodBadge({ method = "GET" }: { method?: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-lime px-2 py-1 font-mono text-[11px] font-bold tracking-wider text-forest">
      {method}
    </span>
  );
}

function EndpointHeader({
  anchor,
  path,
  title,
  description,
}: {
  anchor: string;
  path: string;
  title: string;
  description: string;
}) {
  return (
    <div id={anchor} className="scroll-mt-28">
      <div className="flex flex-wrap items-center gap-3">
        <MethodBadge />
        <code className="break-all rounded-lg bg-forest px-3 py-1.5 font-mono text-[12.5px] text-lime">
          {path}
        </code>
      </div>
      <h3 className="mt-4 font-display text-2xl text-forest sm:text-3xl">{title}</h3>
      <p className="mt-2 max-w-3xl text-[14.5px] leading-7 text-slate-soft">{description}</p>
    </div>
  );
}

function ParamsTable({
  rows,
}: {
  rows: Array<{ name: string; type: string; description: string }>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-forest/10">
      <table className="w-full border-collapse text-left text-[12.5px]">
        <thead className="bg-forest/[0.045] text-[10.5px] uppercase tracking-[0.14em] text-slate-soft">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Parámetro</th>
            <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Tipo</th>
            <th className="px-3 py-2.5 font-semibold">Descripción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-forest/10 bg-white">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-[11.5px] text-forest">
                {row.name}
              </td>
              <td className="hidden px-3 py-2.5 align-top text-slate-soft sm:table-cell">{row.type}</td>
              <td className="px-3 py-2.5 align-top leading-5 text-ink/80">{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UseCases({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-forest/12 bg-paper px-3 py-1 text-[11.5px] text-forest"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function SampleDetails({ children, open = false }: { children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group mt-5 rounded-xl border border-forest/10 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12px] font-semibold text-forest">
        <span>Respuesta JSON de ejemplo</span>
        <span className="text-slate-soft transition group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <div className="border-t border-forest/10 p-3">
        <CodeBlock code={children as string} label="application/json" tone="light" />
      </div>
    </details>
  );
}

function EndpointCard({
  endpoint,
  params,
  tabs,
  sample,
  useCases,
  note,
  openSample = false,
}: {
  endpoint: { anchor: string; path: string; title: string; description: string };
  params: Array<{ name: string; type: string; description: string }>;
  tabs: Array<{ label: string; code: string }>;
  sample: string;
  useCases: string[];
  note?: string;
  openSample?: boolean;
}) {
  return (
    <article className="rounded-[1.75rem] border border-forest/12 bg-white/85 p-5 shadow-[0_20px_60px_-48px_rgba(13,59,51,0.6)] sm:p-7">
      <EndpointHeader {...endpoint} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-soft">
            Parámetros
          </h4>
          <div className="mt-2.5">
            <ParamsTable rows={params} />
          </div>
          {note ? (
            <p className="mt-3 rounded-lg border border-forest/10 bg-paper px-3 py-2.5 text-[12px] leading-5 text-slate-soft">
              {note}
            </p>
          ) : null}
          <h4 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-soft">
            Casos de uso
          </h4>
          <UseCases items={useCases} />
        </div>
        <div>
          <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-soft">
            Ejemplo de solicitud
          </h4>
          <CodeTabs tabs={tabs} />
        </div>
      </div>
      <SampleDetails open={openSample}>{sample}</SampleDetails>
    </article>
  );
}

export default function DeveloperPortalPage() {
  return (
    <div className="min-h-screen bg-paper">
      <ApiHero live={LIVE} heroImage={HERO_IMAGE} />

      <nav className="sticky top-0 z-40 border-b border-forest/10 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-3 sm:px-8">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-3.5 text-[12px] font-medium text-slate-soft transition hover:border-lime hover:text-forest"
            >
              {item.label}
            </a>
          ))}
          <a
            href="/api/v1/public/openapi.json"
            className="ml-auto hidden whitespace-nowrap rounded-full bg-forest px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-forest-2 sm:inline-block"
          >
            Descargar OpenAPI
          </a>
        </div>
      </nav>

      {!LIVE ? (
        <div className="border-b border-forest/10 bg-lime/35">
          <p className="mx-auto max-w-7xl px-5 py-2.5 text-center text-[11.5px] text-forest sm:px-8">
            <strong className="font-semibold">Entorno de demostración.</strong> Los ejemplos y la
            consola usan casos ficticios identificados con{" "}
            <code className="rounded bg-white/50 px-1 py-0.5 font-mono text-[10.5px]">is_demo: true</code>{" "}
            y <code className="rounded bg-white/50 px-1 py-0.5 font-mono text-[10.5px]">dataset: &quot;demo&quot;</code>.
            No representan reportes reales.
          </p>
        </div>
      ) : null}

      <main>
        <section id="introduccion" className="scroll-mt-28">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-20">
            <div>
              <SectionHeading
                eyebrow="Introducción"
                title="Un punto de acceso común a la ciudad que se reporta."
                lead="VotaVía conecta a residentes con el seguimiento de problemas urbanos. Esta API abre únicamente la capa pública: lo que ya fue publicado, lo que ya fue aprobado y lo que no expone la identidad de nadie."
              />
              <div className="prose-civic mt-6 space-y-4 text-[14px] leading-7 text-slate-soft">
                <p>
                  Los datos se leen de la misma plataforma que atiende los casos ciudadanos. No hay
                  una segunda base de datos ni una copia que pueda desincronizarse: la API pública
                  proyecta los registros publicados y elimina los campos privados antes de responder.
                </p>
                <p>
                  La respuesta siempre usa una envoltura <code className="font-mono text-forest">data + meta</code>.
                  Cada error también es JSON, con un código estable y un{" "}
                  <code className="font-mono text-forest">request_id</code> para dar seguimiento.
                </p>
              </div>
              <div className="mt-7 rounded-2xl border border-forest/12 bg-white p-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-soft">
                  Base de la API
                </p>
                <code className="mt-1.5 block break-all font-mono text-[13px] text-forest">{BASE}</code>
                <p className="mt-2 text-[11.5px] leading-5 text-slate-soft">
                  Todos los endpoints viven bajo <code className="font-mono">/api/v1/public</code>.
                  Si integras desde otro dominio, la API responde con CORS abierto para lecturas.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {[
                {
                  number: "01",
                  title: "Casos publicados",
                  body: "Reportes aprobados para publicación, con su avance y evidencia pública.",
                },
                {
                  number: "02",
                  title: "Agregados abiertos",
                  body: "Conteos por categoría, estado y colonia para entender tendencias, no personas.",
                },
                {
                  number: "03",
                  title: "Señales aprobadas",
                  body: "Hallazgos del motor preventivo que pasaron revisión humana y pueden publicarse.",
                },
              ].map((card) => (
                <div
                  key={card.number}
                  className="rounded-2xl border border-forest/12 bg-white/80 p-5 shadow-[0_14px_40px_-38px_rgba(13,59,51,0.6)]"
                >
                  <span className="font-mono text-[10.5px] text-clay">{card.number}</span>
                  <h3 className="mt-2 font-display text-xl text-forest">{card.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-slate-soft">{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="endpoints" className="scroll-mt-28 border-y border-forest/10 bg-paper-2/50">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <SectionHeading
              eyebrow="Endpoints"
              title="Ocho lecturas. Cero escrituras."
              lead="La API no crea, edita ni elimina casos. Cada endpoint responde a GET, admite CORS, valida sus parámetros y devuelve caché, ETag y encabezados de límite de solicitudes."
            />
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {endpointSummary.map((item) => (
                <a
                  key={item.path}
                  href={item.href}
                  className="group rounded-2xl border border-forest/12 bg-white p-4 transition hover:-translate-y-0.5 hover:border-forest/30 hover:shadow-lg"
                >
                  <div className="flex items-center gap-2">
                    <MethodBadge method={item.method} />
                    <code className="break-all font-mono text-[10.5px] text-slate-soft">
                      {item.path}
                    </code>
                  </div>
                  <h3 className="mt-3 font-display text-xl text-forest">{item.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-5 text-slate-soft">{item.body}</p>
                  <span className="mt-3 inline-block text-[11px] font-semibold text-forest-2 transition group-hover:translate-x-0.5">
                    Ver documentación →
                  </span>
                </a>
              ))}
            </div>

            <div className="mt-10 space-y-6">
              <EndpointCard
                endpoint={{
                  anchor: "endpoint-casos",
                  path: "/api/v1/public/cases",
                  title: "Lista de casos publicados",
                  description:
                    "Devuelve una página de casos aprobados para publicación. Puedes combinar filtros y buscar texto en título, descripción y colonia. La paginación es estable y el total refleja todos los resultados del filtro.",
                }}
                params={[
                  { name: "category", type: "texto CSV", description: "Una o más categorías separadas por coma." },
                  { name: "status", type: "texto CSV", description: "Estado operativo de VotaVía. Nunca infiere resolución por un cierre externo." },
                  { name: "verification", type: "texto CSV", description: "unverified, community_confirmed, community_disputed o not_applicable." },
                  { name: "origin", type: "texto CSV", description: "citizen, community o government_import." },
                  { name: "alcaldia", type: "texto", description: "Coincidencia por alcaldía, hasta 80 caracteres." },
                  { name: "colonia", type: "texto", description: "Coincidencia por colonia, hasta 80 caracteres." },
                  { name: "created_from / created_to", type: "fecha", description: "Rango de creación en formato AAAA-MM-DD o ISO 8601." },
                  { name: "min_support", type: "entero", description: "Solo casos con al menos ese número de apoyos." },
                  { name: "bbox", type: "texto", description: "min_lon,min_lat,max_lon,max_lat. El área debe medir 5° o menos por lado." },
                  { name: "q", type: "texto", description: "Búsqueda en título, descripción y colonia." },
                  { name: "page", type: "entero", description: "Página desde 1. Predeterminado: 1." },
                  { name: "page_size", type: "entero", description: "Resultados por página, 1 a 50. Predeterminado: 20." },
                  { name: "sort", type: "enum", description: "recent, supported o updated. Orden estable con case_id como desempate." },
                ]}
                tabs={[
                  { label: "cURL", code: listCurl(BASE) },
                  { label: "JavaScript", code: listFetch(BASE) },
                  { label: "Python", code: listPython(BASE) },
                ]}
                sample={SAMPLE_CASE}
                useCases={[
                  "Mapas vecinales",
                  "Monitoreo de medios",
                  "Investigación académica",
                  "Tableros de servicio",
                ]}
                note="Todos los filtros se combinan con AND. Los parámetros desconocidos se rechazan con 400 en lugar de ignorarse. Los casos sin publicar o sin licencia vigente no se incluyen y se comportan como si no existieran: un filtro sin resultados devuelve data: [] y total: 0."
                openSample
              />

              <EndpointCard
                endpoint={{
                  anchor: "endpoint-detalle",
                  path: "/api/v1/public/cases/:id",
                  title: "Detalle de un caso",
                  description:
                    "Entrega la ficha pública completa, la línea de tiempo con eventos públicos y las observaciones ciudadanas. Un caso no publicado responde 404, sin revelar si existe internamente.",
                }}
                params={[
                  { name: ":id", type: "UUID", description: "El case_id del caso. Los identificadores VOT-0001 no son aceptados." },
                ]}
                tabs={[
                  { label: "cURL", code: detailCurl(BASE) },
                  { label: "JavaScript", code: detailFetch(BASE) },
                  { label: "Python", code: detailPython(BASE) },
                ]}
                sample={SAMPLE_CASE_DETAIL}
                useCases={[
                  "Seguimiento ciudadano",
                  "Verificación de promesas",
                  "Análisis de tiempos de respuesta",
                  "Contexto para notas",
                ]}
                note="Solo se publican eventos con is_public: true. Las notas internas y los datos de especialistas se eliminan antes de responder."
              />

              <EndpointCard
                endpoint={{
                  anchor: "endpoint-estadisticas",
                  path: "/api/v1/public/statistics",
                  title: "Estadísticas del conjunto publicado",
                  description:
                    "Resume el conjunto visible: totales, tasa de resolución, apoyos, observaciones y desgloses por categoría, estado y colonia. Es descriptivo del dataset, no una medición oficial de desempeño del gobierno.",
                }}
                params={[
                  { name: "—", type: "sin parámetros", description: "Devuelve el resumen completo del conjunto publicado." },
                ]}
                tabs={[
                  { label: "cURL", code: statsCurl(BASE) },
                  { label: "JavaScript", code: statsFetch(BASE) },
                  { label: "Python", code: statsPython(BASE) },
                ]}
                sample={SAMPLE_STATISTICS}
                useCases={[
                  "Planeación de servicios",
                  "Reportes de transparencia",
                  "Comparativas por colonia",
                  "Historias de datos",
                ]}
                note="resolution_rate se calcula sobre los casos publicados y se redondea a un decimal. No es una tasa oficial ni una meta de política pública."
              />

              <EndpointCard
                endpoint={{
                  anchor: "endpoint-senales",
                  path: "/api/v1/public/risk-signals",
                  title: "Señales preventivas aprobadas",
                  description:
                    "Republica únicamente salidas del motor preventivo que un revisor humano aprobó y marcó como públicas. La API no calcula riesgo, no agrupa reportes y no inventa señales cuando el feed no está disponible.",
                }}
                params={[
                  { name: "category", type: "texto CSV", description: "Filtra por una o más categorías." },
                  { name: "colonia", type: "texto", description: "Filtra por colonia." },
                  { name: "risk_level", type: "texto CSV", description: "low, medium, high o critical." },
                  { name: "signal_type", type: "texto CSV", description: "Tipo de señal preventiva." },
                  { name: "limit", type: "entero", description: "Máximo de señales, 1 a 100. Predeterminado: 50." },
                ]}
                tabs={[
                  { label: "cURL", code: riskCurl(BASE) },
                  { label: "JavaScript", code: riskFetch(BASE) },
                  { label: "Python", code: riskPython(BASE) },
                ]}
                sample={SAMPLE_RISK}
                useCases={[
                  "Priorización preventiva",
                  "Inspección de campo",
                  "Alertas editoriales",
                  "Análisis territorial",
                ]}
                note="Si no hay feed aprobado configurado en producción, el endpoint responde 503 risk_signals_unavailable. Nunca mezcla datos de demostración con datos reales."
              />

              <EndpointCard
                endpoint={{
                  anchor: "endpoint-geojson",
                  path: "/api/v1/public/cases.geojson",
                  title: "Colección GeoJSON",
                  description:
                    "Devuelve una FeatureCollection estándar para mapas. El id de cada Feature es el case_id canónico, de modo que puedes unirlo con /cases sin emparejar por título ni por posición. Los atributos son un subconjunto seguro de la ficha pública.",
                }}
                params={[
                  { name: "precision", type: "enum", description: "block (110 m, predeterminado) o coarse (1 100 m)." },
                  { name: "limit", type: "entero", description: "Features por respuesta, 1 a 500. Predeterminado: 200." },
                  { name: "bbox", type: "texto", description: "Filtra por extensión geográfica, máximo 5° por lado." },
                  { name: "alcaldia / colonia", type: "texto", description: "Filtros territoriales por nombre." },
                  { name: "category / status / verification / origin", type: "texto CSV", description: "Los mismos filtros que /cases." },
                ]}
                tabs={[
                  { label: "cURL", code: geoJsonCurl(BASE) },
                  { label: "JavaScript", code: geoJsonFetch(BASE) },
                ]}
                sample={SAMPLE_GEOJSON}
                useCases={[
                  "Mapas Leaflet o MapLibre",
                  "Análisis espacial en QGIS",
                  "Cuadernos de datos",
                  "Visualizaciones periodísticas",
                ]}
                note="Los casos con preocupación de seguridad publican geometry: null y spatial_precision: coarse. No se publican coordenadas exactas de viviendas ni de personas. La colección incluye su propio bloque provenance con atribución y limitaciones."
              />

              <EndpointCard
                endpoint={{
                  anchor: "endpoint-categorias",
                  path: "/api/v1/public/categories",
                  title: "Catálogo de categorías",
                  description:
                    "Entrega las ocho categorías del contrato compartido con etiquetas en español, conteos del conjunto publicado y los orígenes presentes en cada una. Es útil para construir filtros sin escribir el catálogo a mano.",
                }}
                params={[
                  { name: "—", type: "sin parámetros", description: "Devuelve el catálogo completo con conteos del dataset público." },
                ]}
                tabs={[
                  { label: "cURL", code: categoriesCurl(BASE) },
                  { label: "JavaScript", code: categoriesFetch(BASE) },
                ]}
                sample={SAMPLE_CATEGORIES}
                useCases={[
                  "Menús de filtro",
                  "Validación de enums",
                  "Conteos por tema",
                  "Localización de etiquetas",
                ]}
                note="Una categoría sin registros publicados aparece con count: 0 y record_origins: []. No se omite, para que los clientes puedan mostrar siempre el catálogo completo."
              />

              <EndpointCard
                endpoint={{
                  anchor: "endpoint-oficiales",
                  path: "/api/v1/public/official-reports",
                  title: "Registros gubernamentales importados",
                  description:
                    "Lista solo registros de origen government_import que pasaron el control de licencia y permiso de redistribución. Es una lectura separada de /cases para que puedas distinguir con claridad qué proviene de una autoridad y qué se reportó directamente a VotaVía.",
                }}
                params={[
                  { name: "category / status / verification", type: "texto CSV", description: "Mismos filtros que /cases." },
                  { name: "alcaldia / colonia", type: "texto", description: "Filtros territoriales por nombre." },
                  { name: "created_from / created_to", type: "fecha", description: "Rango de creación del registro publicado." },
                  { name: "page / page_size", type: "entero", description: "Paginación acotada, hasta 50 por página." },
                ]}
                tabs={[
                  { label: "cURL", code: officialReportsCurl(BASE) },
                  { label: "JavaScript", code: officialReportsFetch(BASE) },
                ]}
                sample={SAMPLE_OFFICIAL_REPORTS}
                useCases={[
                  "Auditoría de datos oficiales",
                  "Comparación comunidad vs. gobierno",
                  "Seguimiento de folios",
                  "Verificación de frescura",
                ]}
                note="El feed está desactivado de forma predeterminada. meta.official_feed indica enabled, reason, licencia, atribución y última sincronización. Sin licencia y permiso verificados, este endpoint devuelve data: [] y no publica nada."
              />

              <EndpointCard
                endpoint={{
                  anchor: "endpoint-salud",
                  path: "/api/v1/public/health",
                  title: "Salud y frescura del servicio",
                  description:
                    "Indica si la API puede leer su fuente de datos y si el feed oficial o el de señales están activos. No expone rutas internas, credenciales ni nombres de servidores.",
                }}
                params={[
                  { name: "—", type: "sin parámetros", description: "Devuelve el estado resumido del servicio público." },
                ]}
                tabs={[
                  { label: "cURL", code: healthCurl(BASE) },
                  { label: "JavaScript", code: healthFetch(BASE) },
                ]}
                sample={SAMPLE_HEALTH}
                useCases={[
                  "Monitoreo de disponibilidad",
                  "Detectar feed oficial apagado",
                  "Alertas de integración",
                  "Diagnóstico de caché",
                ]}
                note="status: ok significa que la API responde; no implica que el feed oficial esté habilitado. Revisa checks.official_municipal_feed antes de asumir que hay registros importados."
              />
            </div>

            <div className="mt-8 rounded-2xl border border-clay/30 bg-clay/[0.07] p-5 sm:p-6">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-clay">
                Aviso importante sobre datos oficiales
              </p>
              <h3 className="mt-2 font-display text-xl text-forest">
                VotaVía no ofrece una API oficial de la Ciudad de México.
              </h3>
              <div className="mt-2 space-y-2 text-[12.5px] leading-6 text-ink/75">
                <p>
                  El Tablero 311 de CDMX (<code className="font-mono text-[11.5px]">tablero311.cdmx.gob.mx</code>)
                  muestra reportes recientes, pero no hemos verificado que exista una API pública
                  documentada ni permiso para redistribuir registros nuevos del tablero. Por eso el
                  feed de registros importados está <strong className="font-semibold">apagado de forma predeterminada</strong>.
                </p>
                <p>
                  Cuando el feed está apagado, <code className="font-mono text-[11.5px]">/official-reports</code>{" "}
                  responde <code className="font-mono text-[11.5px]">data: []</code> y{" "}
                  <code className="font-mono text-[11.5px]">meta.official_feed.enabled: false</code>. Los ejemplos
                  de este portal que muestran registros importados son <strong className="font-semibold">fixtures de
                  demostración</strong> marcados con <code className="font-mono text-[11.5px]">is_demo: true</code> y
                  un dataset que termina en <code className="font-mono text-[11.5px]">-demo</code>; no son datos
                  oficiales publicados.
                </p>
                <p>
                  Solo se publicarán registros gubernamentales cuando exista acceso legítimo, licencia
                  compatible y permiso de redistribución documentado. Mientras tanto, la API expone
                  únicamente reportes propios de VotaVía y datos de demostración claramente etiquetados.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="consola" className="scroll-mt-28">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <SectionHeading
              eyebrow="Pruébalo"
              title="La documentación también se ejecuta."
              lead="Esta consola llama a los mismos endpoints desde tu navegador. Sirve para validar filtros, revisar la forma de la respuesta y detectar errores antes de escribir código."
            />
            <div className="mt-8">
              <ApiPlayground />
            </div>
          </div>
        </section>

        <section id="guia-rapida" className="scroll-mt-28 border-y border-forest/10 bg-forest text-white">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lime">Guía rápida</p>
            <h2 className="mt-2 max-w-3xl font-display text-3xl leading-tight sm:text-4xl">
              De cero a tu primer caso en tres pasos.
            </h2>
            <div className="mt-9 grid gap-5 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/12 bg-white/[0.045] p-5">
                <span className="font-mono text-[11px] text-lime">01</span>
                <h3 className="mt-2 font-display text-xl">Define la base</h3>
                <p className="mt-1.5 text-[12.5px] leading-6 text-white/60">
                  Usa el mismo dominio de VotaVía o la URL configurada para tu entorno. No necesitas
                  una llave de API.
                </p>
                <div className="mt-4 rounded-lg bg-black/25 p-3 font-mono text-[11px] text-lime">
                  const base = &quot;{BASE}&quot;;
                </div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/[0.045] p-5">
                <span className="font-mono text-[11px] text-lime">02</span>
                <h3 className="mt-2 font-display text-xl">Haz la solicitud</h3>
                <p className="mt-1.5 text-[12.5px] leading-6 text-white/60">
                  Pide la primera página de casos recientes y revisa el estado HTTP antes de leer
                  los datos.
                </p>
                <div className="mt-4 rounded-lg bg-black/25 p-3 font-mono text-[10.5px] leading-5 text-lime">
                  curl &quot;{BASE}/api/v1/public/cases&quot;
                </div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/[0.045] p-5">
                <span className="font-mono text-[11px] text-lime">03</span>
                <h3 className="mt-2 font-display text-xl">Lee la envoltura</h3>
                <p className="mt-1.5 text-[12.5px] leading-6 text-white/60">
                  <code className="font-mono text-white/85">data</code> trae el contenido y{" "}
                  <code className="font-mono text-white/85">meta</code> la paginación, el entorno y
                  el identificador de la solicitud.
                </p>
                <div className="mt-4 rounded-lg bg-black/25 p-3 font-mono text-[10.5px] leading-5 text-lime">
                  const &#123; data, meta &#125; = await res.json();
                </div>
              </div>
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <CodeBlock
                code={openApiCurl(BASE)}
                label="Descargar el contrato OpenAPI"
              />
              <div className="rounded-2xl border border-white/12 bg-white/[0.045] p-5">
                <h3 className="font-display text-xl">Convenciones que conviene memorizar</h3>
                <ul className="mt-3 space-y-2 text-[12.5px] leading-6 text-white/65">
                  <li>• Fechas en ISO 8601, siempre en UTC.</li>
                  <li>• Categorías, estados y niveles usan enums del contrato compartido.</li>
                  <li>• Los errores también son JSON y traen un request_id.</li>
                  <li>• Cada respuesta incluye ETag; puedes enviar If-None-Match y recibir 304.</li>
                  <li>• El límite es de 120 solicitudes por minuto por IP en esta implementación.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="datos" className="scroll-mt-28">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <SectionHeading
              eyebrow="Diccionario de datos"
              title="Lo que puedes esperar, campo por campo."
              lead="Los enums y estructuras son compatibles con el contrato compartido de VotaVía. Si un caso no está publicado, simplemente no aparece."
            />

            <div className="mt-9 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-xl text-forest">Categorías</h3>
                <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-baseline justify-between gap-2 border-b border-forest/8 pb-1.5">
                      <dt className="text-[12.5px] text-ink/80">{label}</dt>
                      <dd className="font-mono text-[10.5px] text-slate-soft">{key}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-xl text-forest">Estados</h3>
                <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-baseline justify-between gap-2 border-b border-forest/8 pb-1.5">
                      <dt className="text-[12.5px] text-ink/80">{label}</dt>
                      <dd className="font-mono text-[10.5px] text-slate-soft">{key}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-xl text-forest">Niveles de riesgo</h3>
                <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  {Object.entries(RISK_LEVEL_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-baseline justify-between gap-2 border-b border-forest/8 pb-1.5">
                      <dt className="text-[12.5px] text-ink/80">{label}</dt>
                      <dd className="font-mono text-[10.5px] text-slate-soft">{key}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-xl text-forest">Tipos de señal</h3>
                <dl className="mt-3 space-y-2">
                  {Object.entries(SIGNAL_TYPE_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-baseline justify-between gap-2 border-b border-forest/8 pb-1.5">
                      <dt className="text-[12.5px] text-ink/80">{label}</dt>
                      <dd className="font-mono text-[10.5px] text-slate-soft">{key}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-xl text-forest">Origen del registro</h3>
                <p className="mt-1 text-[12px] leading-5 text-slate-soft">
                  Distingue quién produjo el registro. No lo confundas con la categoría ni con el estado.
                </p>
                <dl className="mt-3 space-y-2">
                  {Object.entries(ORIGIN_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-baseline justify-between gap-2 border-b border-forest/8 pb-1.5">
                      <dt className="text-[12.5px] text-ink/80">{label}</dt>
                      <dd className="font-mono text-[10.5px] text-slate-soft">{key}</dd>
                    </div>
                  ))}
                </dl>
                <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-soft">
                  Verificación comunitaria
                </h4>
                <dl className="mt-2 space-y-2">
                  {Object.entries(VERIFICATION_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-baseline justify-between gap-2 border-b border-forest/8 pb-1.5">
                      <dt className="text-[12.5px] text-ink/80">{label}</dt>
                      <dd className="font-mono text-[10.5px] text-slate-soft">{key}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-xl text-forest">Estado externo y frescura</h3>
                <p className="mt-1 text-[12px] leading-5 text-slate-soft">
                  Un cierre de la autoridad describe a esa autoridad, no la realidad del problema.
                </p>
                <dl className="mt-3 space-y-2">
                  {Object.entries(EXTERNAL_STATUS_KIND_LABELS).map(([key, label]) => (
                    <div key={key} className="border-b border-forest/8 pb-1.5">
                      <dt className="text-[12.5px] text-ink/80">{label}</dt>
                      <dd className="font-mono text-[10.5px] text-slate-soft">{key}</dd>
                    </div>
                  ))}
                </dl>
                <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-soft">
                  Frescura de la fuente
                </h4>
                <dl className="mt-2 space-y-2">
                  {Object.entries(FRESHNESS_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-baseline justify-between gap-2 border-b border-forest/8 pb-1.5">
                      <dt className="text-[12.5px] text-ink/80">{label}</dt>
                      <dd className="font-mono text-[10.5px] text-slate-soft">{key}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-2xl border border-forest/12 bg-white">
              <div className="border-b border-forest/10 px-5 py-4">
                <h3 className="font-display text-xl text-forest">Campos de un caso público</h3>
                <p className="mt-1 text-[12.5px] text-slate-soft">
                  La proyección se construye campo por campo. Cualquier propiedad interna que no
                  esté aquí nunca llega al cliente.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] border-collapse text-left text-[12px]">
                  <thead className="bg-forest/[0.045] text-[10px] uppercase tracking-[0.14em] text-slate-soft">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Campo</th>
                      <th className="px-4 py-2.5 font-semibold">Tipo</th>
                      <th className="px-4 py-2.5 font-semibold">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-forest/8">
                    {caseFields.map(([name, type, description]) => (
                      <tr key={name}>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-forest">{name}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-soft">{type}</td>
                        <td className="px-4 py-2.5 leading-5 text-ink/80">{description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div id="procedencia" className="mt-8 scroll-mt-28 rounded-2xl border border-forest/12 bg-white p-5 sm:p-6">
              <h3 className="font-display text-2xl text-forest">Procedencia, licencias y frescura</h3>
              <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-soft">
                Cada registro importado declara de dónde viene y bajo qué condiciones puede
                redistribuirse. Los registros reportados directamente a VotaVía llevan{" "}
                <code className="font-mono text-[11.5px]">provenance: null</code> y se identifican por{" "}
                <code className="font-mono text-[11.5px]">record_origin</code>.
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-soft">
                    Campos de provenance
                  </h4>
                  <dl className="mt-2 divide-y divide-forest/8 text-[12px]">
                    {[
                      ["dataset", "Identificador estable del conjunto, por ejemplo cdmx-311."],
                      ["source_name", "Nombre legible de la fuente original."],
                      ["source_url", "URL https de la ficha, sin query ni fragmento."],
                      ["official_folio", "Folio de la fuente, si existe."],
                      ["source_reported_at", "Fecha reportada por la fuente."],
                      ["last_synced_at", "Última sincronización con la fuente."],
                      ["license", "id, name, url y redistributable."],
                      ["permission", "verified, verified_at y reference del permiso."],
                      ["attribution", "Texto de atribución que debes mostrar."],
                      ["freshness", "status, age_hours y checked_at."],
                      ["is_demo", "Indica que el registro es una fixture, no un dato real."],
                    ].map(([name, description]) => (
                      <div key={name} className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3">
                        <dt className="w-44 shrink-0 font-mono text-[10.5px] text-forest">{name}</dt>
                        <dd className="leading-5 text-slate-soft">{description}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-forest/10 bg-paper p-4">
                    <h4 className="font-display text-lg text-forest">Cómo citar</h4>
                    <p className="mt-1.5 text-[12px] leading-6 text-slate-soft">
                      Muestra <code className="font-mono">provenance.attribution</code> y el{" "}
                      <code className="font-mono">official_folio</code> cuando existan. No presentes un
                      registro importado como si lo hubiera emitido VotaVía, ni un cierre
                      gubernamental como una resolución verificada.
                    </p>
                  </div>
                  <div className="rounded-xl border border-forest/10 bg-paper p-4">
                    <h4 className="font-display text-lg text-forest">Enlaces a la fuente</h4>
                    <p className="mt-1.5 text-[12px] leading-6 text-slate-soft">
                      Solo se publican URL <code className="font-mono">https</code> y se eliminan
                      query strings y fragmentos. Así nunca se filtra un enlace firmado, un token de
                      sesión o un parámetro con datos personales.
                    </p>
                  </div>
                  <div className="rounded-xl border border-forest/10 bg-paper p-4">
                    <h4 className="font-display text-lg text-forest">Cobertura incompleta</h4>
                    <p className="mt-1.5 text-[12px] leading-6 text-slate-soft">
                      El dataset refleja lo reportado a VotaVía y lo importado con permiso vigente. No
                      es un censo de problemas urbanos, no mide el desempeño oficial y puede sesgarse
                      por la participación de cada colonia.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-lg text-forest">Envoltura meta</h3>
                <ul className="mt-3 space-y-2 text-[12px] leading-5 text-slate-soft">
                  <li><code className="font-mono text-forest">request_id</code> · identificador de la solicitud para soporte.</li>
                  <li><code className="font-mono text-forest">api_version</code> · versión del contrato, hoy v1.</li>
                  <li><code className="font-mono text-forest">generated_at</code> · momento de generación en UTC.</li>
                  <li><code className="font-mono text-forest">dataset</code> · demo o live.</li>
                  <li><code className="font-mono text-forest">page, page_size, total, total_pages, has_more</code> · solo en listas.</li>
                  <li><code className="font-mono text-forest">count</code> · solo en señales preventivas.</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-lg text-forest">Errores</h3>
                <p className="mt-1.5 text-[12.5px] leading-6 text-slate-soft">
                  Códigos estables: <code className="font-mono">invalid_request</code>,{" "}
                  <code className="font-mono">invalid_case_id</code>, <code className="font-mono">not_found</code>,{" "}
                  <code className="font-mono">rate_limited</code>,{" "}
                  <code className="font-mono">risk_signals_unavailable</code>,{" "}
                  <code className="font-mono">upstream_unavailable</code> e{" "}
                  <code className="font-mono">internal_error</code>.
                </p>
                <div className="mt-3">
                  <CodeBlock code={SAMPLE_ERROR} label="400 invalid_request" tone="light" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="privacidad" className="scroll-mt-28 bg-forest text-white">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lime">Privacidad</p>
                <h2 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
                  La ubicación importa. La identidad de quien reporta, no.
                </h2>
                <p className="mt-4 text-[14.5px] leading-7 text-white/65">
                  La API pública no es una copia de la base interna. Es una proyección que se
                  construye solo con campos aprobados y que elimina datos personales del texto libre
                  antes de responder.
                </p>
                <div className="mt-6 rounded-2xl border border-lime/25 bg-lime/10 p-5">
                  <p className="font-display text-2xl text-lime">110 m · 1 100 m</p>
                  <p className="mt-1 text-[12.5px] leading-6 text-white/65">
                    Las coordenadas se redondean a tres decimales (≈ 110 m) y, cuando el caso tiene
                    una preocupación de seguridad, a dos decimales (≈ 1 100 m) o se publica{" "}
                    <code className="font-mono">geometry: null</code>. Es suficiente para ubicar una
                    colonia o un tramo, no una vivienda.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-white/[0.045] p-5">
                  <h3 className="font-display text-lg text-lime">Nunca se publica</h3>
                  <ul className="mt-3 space-y-2 text-[12.5px] leading-6 text-white/65">
                    <li>• Correos, teléfonos y nombres de residentes.</li>
                    <li>• Enlaces mágicos, tokens de sesión y credenciales.</li>
                    <li>• Direcciones exactas o address_hint.</li>
                    <li>• Notas internas y conversaciones de especialistas.</li>
                    <li>• Casos con is_published: false.</li>
                    <li>• Eventos de línea de tiempo no públicos.</li>
                    <li>• Asignaciones gubernamentales internas no marcadas como públicas.</li>
                    <li>• Contactos y datos personales presentes en registros importados.</li>
                    <li>• Metadatos sensibles de evidencia o cadenas de custodia.</li>
                    <li>• Evidencia interna de las señales de IA.</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/[0.045] p-5">
                  <h3 className="font-display text-lg text-lime">Sí se publica</h3>
                  <ul className="mt-3 space-y-2 text-[12.5px] leading-6 text-white/65">
                    <li>• Ficha del caso aprobada para publicación.</li>
                    <li>• Colonia, alcaldía y coordenada aproximada.</li>
                    <li>• Fotos y leyendas revisadas.</li>
                    <li>• Conteos de apoyo y observaciones.</li>
                    <li>• Avance público del caso.</li>
                    <li>• Procedencia, licencia y frescura de registros importados.</li>
                    <li>• Señales preventivas con aprobación humana.</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="mt-8 rounded-2xl border border-white/12 bg-white/[0.045] p-5">
              <p className="text-[12.5px] leading-6 text-white/65">
                <strong className="font-semibold text-white">Cómo proteger tu integración:</strong> no
                intentes reconstruir identidades a partir de textos, fotos o ubicaciones; no publiques
                datos derivados que permitan reidentificar a una persona; respeta el límite de
                solicitudes y cita la fuente. Si encuentras un dato que parece privado, repórtalo al
                equipo de VotaVía antes de difundirlo.
              </p>
            </div>
          </div>
        </section>

        <section id="integracion" className="scroll-mt-28">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <SectionHeading
              eyebrow="Integración"
              title="Preparada para conectarse a la plataforma, sin reescribir el módulo."
              lead="Esta implementación trabaja con datos de demostración hasta que la plataforma de casos esté disponible. El adaptador de casos es el único punto que debe cambiar."
            />

            <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
              <div className="rounded-2xl border border-forest/12 bg-white p-5 sm:p-6">
                <h3 className="font-display text-xl text-forest">Para el equipo de la plataforma (Session 1)</h3>
                <ol className="mt-4 space-y-4 text-[13px] leading-6 text-slate-soft">
                  <li className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-lime font-mono text-[10px] font-bold text-forest">
                      1
                    </span>
                    <span>
                      Mantener <code className="font-mono text-forest">src/shared/votavia-contract.ts</code>{" "}
                      como fuente única. No hace falta crear otro contrato.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-lime font-mono text-[10px] font-bold text-forest">
                      2
                    </span>
                    <span>
                      Exponer las lecturas <code className="font-mono text-forest">listCases</code>,{" "}
                      <code className="font-mono text-forest">getCase</code>,{" "}
                      <code className="font-mono text-forest">getCaseTimeline</code>,{" "}
                      <code className="font-mono text-forest">getCaseObservations</code> y{" "}
                      <code className="font-mono text-forest">getPublicStats</code> desde el servicio de casos.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-lime font-mono text-[10px] font-bold text-forest">
                      3
                    </span>
                    <span>
                      Sustituir el origen de demostración por el adaptador en proceso. Es un cambio
                      localizado en <code className="font-mono text-forest">src/public-api/adapters/resolve.ts</code>.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-lime font-mono text-[10px] font-bold text-forest">
                      4
                    </span>
                    <span>
                      Configurar el feed aprobado de Session 3 o dejar que el endpoint responda 503.
                      La API pública nunca calcula señales por su cuenta.
                    </span>
                  </li>
                </ol>
                <div className="mt-5">
                  <CodeBlock
                    tone="light"
                    label="adapters/resolve.ts · cambio de integración"
                    code={`import { createCaseServiceSource } from "./case-service-source";
import { getCaseService } from "@/server/services/case-service";

// Ajusta el import al factory real de Session 1.
export function getPublicCaseSource() {
  return createCaseServiceSource(getCaseService());
}`}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-forest/12 bg-white p-5">
                  <h3 className="font-display text-xl text-forest">Variables de entorno</h3>
                  <dl className="mt-3 space-y-2.5 text-[12px]">
                    {[
                      ["VOTAVIA_PUBLIC_API_MODE", "demo o live"],
                      ["VOTAVIA_INTERNAL_API_BASE_URL", "URL interna de la plataforma"],
                      ["VOTAVIA_INTERNAL_API_TOKEN", "Token opcional de servicio"],
                      ["VOTAVIA_RISK_SIGNALS_URL", "Feed aprobado de Session 3"],
                      ["VOTAVIA_RISK_SIGNALS_TOKEN", "Token opcional del feed"],
                      ["VOTAVIA_OFFICIAL_FEED_ENABLED", "true solo con licencia y permiso verificados"],
                      ["VOTAVIA_OFFICIAL_SOURCE_LICENSE", "Licencia del conjunto importado"],
                      ["VOTAVIA_OFFICIAL_SOURCE_ATTRIBUTION", "Atribución obligatoria de la fuente"],
                      ["VOTAVIA_OFFICIAL_LAST_SYNCED_AT", "Última sincronización conocida"],
                      ["VOTAVIA_PUBLIC_RATE_LIMIT", "Solicitudes por minuto por IP; predeterminado 120"],
                      ["VOTAVIA_CASE_PERMALINK_PATH", "Ruta pública del caso, /casos"],
                      ["NEXT_PUBLIC_APP_URL", "Dominio público para permalinks"],
                    ].map(([name, description]) => (
                      <div key={name} className="border-b border-forest/8 pb-2 last:border-0">
                        <dt className="font-mono text-[10.5px] text-forest">{name}</dt>
                        <dd className="mt-0.5 text-slate-soft">{description}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="rounded-2xl border border-forest/12 bg-white p-5">
                  <h3 className="font-display text-lg text-forest">Campos que la plataforma debe entregar</h3>
                  <p className="mt-2 text-[12px] leading-6 text-slate-soft">
                    Del contrato compartido: <code className="font-mono text-forest">case_id</code>,{" "}
                    <code className="font-mono text-forest">display_id</code>,{" "}
                    <code className="font-mono text-forest">category</code>,{" "}
                    <code className="font-mono text-forest">status</code>,{" "}
                    <code className="font-mono text-forest">title</code>,{" "}
                    <code className="font-mono text-forest">description</code>,{" "}
                    <code className="font-mono text-forest">colonia</code>,{" "}
                    <code className="font-mono text-forest">latitude</code>,{" "}
                    <code className="font-mono text-forest">longitude</code>,{" "}
                    <code className="font-mono text-forest">photos</code>,{" "}
                    <code className="font-mono text-forest">support_count</code>,{" "}
                    <code className="font-mono text-forest">observation_count</code>,{" "}
                    <code className="font-mono text-forest">has_safety_concern</code>,{" "}
                    <code className="font-mono text-forest">has_accessibility_concern</code>,{" "}
                    <code className="font-mono text-forest">is_published</code>,{" "}
                    <code className="font-mono text-forest">is_demo</code>,{" "}
                    <code className="font-mono text-forest">created_at</code>,{" "}
                    <code className="font-mono text-forest">updated_at</code> y{" "}
                    <code className="font-mono text-forest">resolved_at</code>.
                  </p>
                  <p className="mt-2 text-[12px] leading-6 text-slate-soft">
                    Metadatos opcionales propuestos:{" "}
                    <code className="font-mono text-forest">record_origin</code>,{" "}
                    <code className="font-mono text-forest">external_government_status</code>,{" "}
                    <code className="font-mono text-forest">community_verification_status</code>,{" "}
                    <code className="font-mono text-forest">community_verification_summary</code>,{" "}
                    <code className="font-mono text-forest">community_verified_at</code> y{" "}
                    <code className="font-mono text-forest">provenance</code>. Mientras Session 1 no
                    los agregue al contrato, la API los lee como opcionales y aplica valores
                    conservadores: <code className="font-mono">null</code> significa desconocido,
                    nunca resuelto.
                  </p>
                  <p className="mt-2 text-[12px] leading-6 text-slate-soft">
                    El documento <code className="font-mono">INTEGRATION.md</code> del repositorio
                    incluye el contrato del feed de Session 3, el detalle de cada método y una lista
                    de verificación para el despliegue.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-xl text-forest">Reutilizable por otros municipios</h3>
                <p className="mt-2 text-[12.5px] leading-6 text-slate-soft">
                  La API usa convenciones estables que otro municipio puede adoptar sin reescribir el
                  módulo: prefijo <code className="font-mono text-forest">/api/v1/public</code>,
                  envoltura <code className="font-mono text-forest">data + meta</code>, enums
                  compartidos, paginación acotada, ETag, GeoJSON estándar y procedencia explícita.
                </p>
                <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-slate-soft">
                  <li>• El catálogo de categorías se sirve por endpoint, no se incrusta en el cliente.</li>
                  <li>• La geografía se filtra por alcaldía, colonia y bbox con límites de tamaño.</li>
                  <li>• Cada conjunto declara su licencia, atribución y frescura.</li>
                  <li>• El origen del registro distingue comunidad, ciudadanía y gobierno.</li>
                </ul>
                <p className="mt-3 text-[12px] leading-6 text-slate-soft">
                  Los usuarios externos nunca reciben permisos de escritura: la API pública es
                  estrictamente de lectura y no expone endpoints de creación, edición, apoyos ni
                  observaciones.
                </p>
              </div>
              <div className="rounded-2xl border border-forest/12 bg-white p-5">
                <h3 className="font-display text-xl text-forest">Límites de esta implementación</h3>
                <ul className="mt-2 space-y-2 text-[12.5px] leading-6 text-slate-soft">
                  <li>
                    • La recolección de datos oficiales no forma parte de este módulo; la ingestión
                    la opera un equipo separado y debe respetar licencias y permisos.
                  </li>
                  <li>
                    • No se afirma que exista una API oficial de CDMX. El feed importado permanece
                    desactivado hasta documentar acceso y redistribución.
                  </li>
                  <li>
                    • El código se publica como infraestructura cívica abierta. Consulta el
                    repositorio del proyecto para la licencia del software y las condiciones de
                    atribución de los datos.
                  </li>
                  <li>
                    • La API no sustituye una solicitud formal de servicio ni constituye una
                    medición oficial de desempeño gubernamental.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="preguntas" className="scroll-mt-28 border-t border-forest/10 bg-paper-2/50">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
              <SectionHeading
                eyebrow="Preguntas frecuentes"
                title="Lo que suele preguntar quien llega por primera vez."
              />
              <div className="space-y-3">
                {[
                  {
                    q: "¿Necesito una API key?",
                    a: "No. La API pública es de solo lectura y no requiere autenticación. Esto permite que medios, vecinos y equipos de investigación la usen sin fricción. A cambio, solicita con moderación y respeta el límite de 120 solicitudes por minuto por IP.",
                  },
                  {
                    q: "¿Por qué un caso no aparece?",
                    a: "Solo se publican casos aprobados para publicación y, si son importados, con licencia y permiso vigentes. El filtro se aplica en la capa de datos, antes de contar o paginar. Si un registro existe internamente pero no cumple las reglas, la lista lo omite y el detalle responde 404 sin confirmar su existencia.",
                  },
                  {
                    q: "¿Puedo escribir o actualizar casos?",
                    a: "No. Esta API no expone creación, edición, apoyos ni observaciones. Esas acciones pertenecen a la plataforma ciudadana y a los módulos internos.",
                  },
                  {
                    q: "¿La API calcula el riesgo?",
                    a: "No. Las señales preventivas las calcula Session 3 y solo se publican después de una aprobación humana. La API pública filtra las señales no aprobadas y no fabrica resultados cuando el feed no está disponible.",
                  },
                  {
                    q: "¿Qué significa dataset: demo?",
                    a: "Que la respuesta proviene de un conjunto ficticio para desarrollo. Los casos de demostración también traen is_demo: true. En producción, el metadato debe ser live y no se mezclan ambos entornos.",
                  },
                  {
                    q: "¿Cuál es la diferencia entre los tres estados?",
                    a: "votavia_operational_status es el estado canónico del caso en VotaVía (el campo Case.status de Session 1). external_government_status es lo que reporta una autoridad externa y puede ser closed sin que el problema esté resuelto. community_verification_status es el resultado de la verificación vecinal. Ninguno se deriva de los otros y un cierre gubernamental nunca se presenta como resolución verificada. El campo status se conserva solo como espejo obsoleto de votavia_operational_status.",
                  },
                  {
                    q: "¿VotaVía publica una API oficial de CDMX?",
                    a: "No. El Tablero 311 de CDMX no tiene una API pública documentada por nosotros, y no hemos verificado permiso para redistribuir registros nuevos. El feed de registros importados está desactivado de forma predeterminada; solo se enciende cuando hay acceso legítimo, licencia compatible y permiso de redistribución documentado. Los ejemplos con registros importados son fixtures marcados como demostración.",
                  },
                  {
                    q: "¿Puedo reutilizar estas convenciones en otro municipio?",
                    a: "Sí. El diseño es deliberadamente portable: prefijo /api/v1/public, envoltura data + meta, enums compartidos, paginación acotada, ETag, GeoJSON estándar, procedencia explícita y lectura estrictamente pública. La API no otorga permisos de escritura a usuarios externos.",
                  },
                  {
                    q: "¿Puedo usar estos datos en una app comercial?",
                    a: "La API es de uso cívico con atribución. Si planeas un producto comercial, revisa las condiciones con el equipo de VotaVía y comparte cómo citarás la fuente y cómo protegerás la privacidad.",
                  },
                  {
                    q: "¿Por qué recibo 503 en risk-signals?",
                    a: "Porque el feed de señales aprobadas no está configurado o no está disponible en ese entorno. Es una respuesta deliberada: preferimos decir que no hay datos antes que mostrar señales de demostración como si fueran reales.",
                  },
                ].map((item) => (
                  <details key={item.q} className="group rounded-xl border border-forest/12 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[13.5px] font-medium text-forest">
                      {item.q}
                      <span className="text-slate-soft transition group-open:rotate-45" aria-hidden>
                        +
                      </span>
                    </summary>
                    <p className="border-t border-forest/8 px-4 py-3 text-[12.5px] leading-6 text-slate-soft">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#07130f] text-white">
        <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-full bg-lime font-display text-sm font-bold text-forest">
                  V
                </span>
                <span className="font-display text-lg">VotaVía</span>
              </div>
              <p className="mt-2 max-w-md text-[11.5px] leading-5 text-white/45">
                API pública de solo lectura para entender los problemas urbanos publicados en
                Cuauhtémoc sin comprometer la privacidad de quienes los reportan.
              </p>
            </div>
            <div className="flex flex-wrap gap-5 text-[11.5px] text-white/60">
              <a className="hover:text-lime" href="/api/v1/public/openapi.json">OpenAPI</a>
              <a className="hover:text-lime" href="#endpoints">Endpoints</a>
              <a className="hover:text-lime" href="#privacidad">Privacidad</a>
              <a className="hover:text-lime" href="#integracion">Integración</a>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-[10.5px] text-white/35">
            <p>VotaVía · API pública v1 · Hecho para el uso cívico.</p>
            <p>{LIVE ? "Datos en vivo" : "Entorno de demostración"} · Cuauhtémoc, Ciudad de México</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
