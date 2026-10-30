"use client";

import { useMemo, useState } from "react";
import { CodeBlock } from "@/app/desarrolladores/_components/CodeBlock";
import type { EndpointDoc, EndpointGroup } from "../spec-data";

const TABS = [
  { id: "curl", label: "cURL" },
  { id: "fetch", label: "JavaScript" },
  { id: "python", label: "Python" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ParamTable({ endpoint }: { endpoint: EndpointDoc }) {
  if (endpoint.params.length === 0) {
    return (
      <p className="rounded-xl border border-forest/10 bg-paper-2/40 px-4 py-3 text-[12.5px] text-slate-soft">
        Este endpoint no recibe parámetros.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-forest/10">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead className="bg-paper-2/60 text-[10px] uppercase tracking-[0.16em] text-slate-soft">
          <tr>
            <th className="px-3 py-2 font-semibold">Parámetro</th>
            <th className="px-3 py-2 font-semibold">Ubicación</th>
            <th className="px-3 py-2 font-semibold">Tipo</th>
            <th className="px-3 py-2 font-semibold">Ejemplo</th>
          </tr>
        </thead>
        <tbody>
          {endpoint.params.map((param) => (
            <tr key={`${param.where}-${param.name}`} className="border-t border-forest/8 align-top">
              <td className="px-3 py-2.5">
                <code className="font-mono text-[11.5px] text-forest">{param.name}</code>
                {param.required ? (
                  <span className="ml-2 rounded-full bg-clay/12 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-clay">
                    requerido
                  </span>
                ) : (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-soft/70">
                    opcional
                  </span>
                )}
                {param.description ? (
                  <p className="mt-1 max-w-md text-[11.5px] leading-5 text-slate-soft">
                    {param.description}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-2.5 font-mono text-[11px] text-slate-soft">{param.where}</td>
              <td className="px-3 py-2.5 text-slate-soft">{param.type}</td>
              <td className="px-3 py-2.5">
                <code className="break-all font-mono text-[11px] text-forest/80">
                  {param.example ?? param.defaultValue ?? "—"}
                </code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointCard({ endpoint, open }: { endpoint: EndpointDoc; open: boolean }) {
  const [tab, setTab] = useState<TabId>("curl");

  return (
    <article
      id={endpoint.id}
      className="scroll-mt-32 overflow-hidden rounded-2xl border border-forest/12 bg-white shadow-[0_1px_0_rgba(13,59,51,0.04)]"
    >
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-paper-2/40 [&::-webkit-details-marker]:hidden">
          <span className="rounded-md bg-forest px-2 py-1 font-mono text-[10px] font-bold tracking-wide text-lime">
            {endpoint.method}
          </span>
          <code className="font-mono text-[12.5px] text-forest">{endpoint.path}</code>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-soft">
            {endpoint.summary}
          </span>
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-soft/70">
            {endpoint.params.length} parámetros
          </span>
          <span
            aria-hidden
            className="text-[11px] text-slate-soft transition group-open:rotate-180"
          >
            ▾
          </span>
        </summary>

        <div className="border-t border-forest/10 px-5 py-5">
          {endpoint.description ? (
            <p className="max-w-3xl text-[12.5px] leading-6 text-slate-soft">{endpoint.description}</p>
          ) : null}

          <h4 className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-soft">
            Parámetros
          </h4>
          <div className="mt-2.5">
            <ParamTable endpoint={endpoint} />
          </div>

          <h4 className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-soft">
            Respuestas
          </h4>
          <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {endpoint.responses.map((response) => (
              <li
                key={response.status}
                className="flex items-start gap-2.5 rounded-xl border border-forest/10 bg-paper-2/25 px-3 py-2"
              >
                <span
                  className={`mt-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    response.status.startsWith("2")
                      ? "bg-forest/10 text-forest"
                      : "bg-clay/12 text-clay"
                  }`}
                >
                  {response.status}
                </span>
                <span className="text-[12px] leading-5 text-slate-soft">
                  {response.description}
                  {response.mediaTypes.length > 0 ? (
                    <span className="mt-1 block font-mono text-[10.5px] text-slate-soft/80">
                      {response.mediaTypes.join(" · ")}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <h4 className="mr-auto text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-soft">
              Ejemplo
            </h4>
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  tab === item.id
                    ? "bg-forest text-lime"
                    : "border border-forest/12 text-slate-soft hover:border-forest/30 hover:text-forest"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5">
            <CodeBlock label={`${endpoint.method} ${endpoint.path}`} code={endpoint.samples[tab]} />
          </div>
        </div>
      </details>
    </article>
  );
}

export function EndpointExplorer({ groups }: { groups: EndpointGroup[] }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalized) return groups;
    return groups
      .map((group) => ({
        ...group,
        endpoints: group.endpoints.filter((endpoint) => {
          const haystack = [
            endpoint.path,
            endpoint.summary,
            endpoint.description ?? "",
            endpoint.tag,
            ...endpoint.params.map((param) => `${param.name} ${param.description ?? ""}`),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalized);
        }),
      }))
      .filter((group) => group.endpoints.length > 0);
  }, [groups, normalized]);

  const total = filtered.reduce((sum, group) => sum + group.endpoints.length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-forest/12 bg-white/70 px-4 py-3 backdrop-blur">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por ruta, parámetro o descripción…"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-slate-soft/70"
          aria-label="Buscar endpoints"
        />
        <span className="rounded-full bg-forest/8 px-2.5 py-1 font-mono text-[10.5px] text-forest">
          {total} de {groups.reduce((sum, group) => sum + group.endpoints.length, 0)}
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-forest/20 px-5 py-8 text-center text-[13px] text-slate-soft">
          Ningún endpoint coincide con «{query}». Prueba con <code className="font-mono">cases</code>,{" "}
          <code className="font-mono">bbox</code> o <code className="font-mono">geojson</code>.
        </p>
      ) : null}

      <div className="mt-8 space-y-10">
        {filtered.map((group) => (
          <section key={group.tag} id={`grupo-${group.tag.toLowerCase().replace(/\s+/g, "-")}`} className="scroll-mt-32">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-display text-2xl text-forest">{group.tag}</h3>
              <span className="font-mono text-[11px] text-slate-soft">
                {group.endpoints.length} endpoint{group.endpoints.length === 1 ? "" : "s"}
              </span>
            </div>
            {group.description ? (
              <p className="mb-4 max-w-2xl text-[12.5px] leading-6 text-slate-soft">{group.description}</p>
            ) : null}
            <div className="space-y-3">
              {group.endpoints.map((endpoint) => (
                <EndpointCard
                  key={endpoint.id}
                  endpoint={endpoint}
                  open={Boolean(normalized) && total === 1}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
