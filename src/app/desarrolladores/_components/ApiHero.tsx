const RAYS = [
  { angle: -66, color: "#2F8FD0" },
  { angle: -44, color: "#2FAE8B" },
  { angle: -22, color: "#7FBE45" },
  { angle: 0, color: "#F5BE2A" },
  { angle: 22, color: "#F2803A" },
  { angle: 44, color: "#E8506B" },
  { angle: 66, color: "#6B4BD8" },
];

const GUARANTEES = ["Solo lectura", "Sin llave", "CORS abierto", "Privacidad por diseño"];

const SAMPLE = `{
  "data": [
    {
      "display_id": "VOT-0001",
      "category": "road_damage",
      "votavia_operational_status": "in_progress",
      "external_government_status": null,
      "community_verification_status": "unverified",
      "record_origin": "citizen",
      "colonia": "Roma Norte",
      "support_count": 42
    }
  ],
  "meta": {
    "dataset": "demo",
    "total": 14,
    "page": 1
  }
}`;

/**
 * Sunburst inspired by the VotaVía mark: the same petal fan as the logo, blown
 * up as a hero accent. Decorative only.
 */
function Sunburst() {
  return (
    <svg
      viewBox="0 0 420 420"
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute -right-16 top-1/2 h-[420px] w-[420px] -translate-y-1/2 opacity-70 sm:-right-10 sm:h-[520px] sm:w-[520px] sm:opacity-80 lg:right-0 lg:h-[620px] lg:w-[620px]"
    >
      <defs>
        <radialGradient id="api-hero-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="338" cy="210" r="210" fill="url(#api-hero-glow)" />
      <g transform="translate(338 210)">
        {RAYS.map((ray) => (
          <rect
            key={ray.angle}
            x={-26}
            y={-330}
            width={52}
            height={330}
            rx={26}
            fill={ray.color}
            opacity={0.9}
            transform={`rotate(${ray.angle})`}
          />
        ))}
      </g>
      <circle cx="338" cy="210" r="34" fill="#0b1a2f" opacity="0.85" />
    </svg>
  );
}

export function ApiHero({ live, heroImage }: { live: boolean; heroImage?: string }) {
  return (
    <header className="relative isolate overflow-hidden bg-[#070e1e] text-white">
      <div
        className={heroImage ? "absolute inset-0 bg-cover bg-center" : "api-hero-photo absolute inset-0"}
        style={
          heroImage
            ? {
                backgroundImage: `linear-gradient(105deg, rgba(7,14,30,.97) 0%, rgba(11,26,47,.9) 46%, rgba(20,48,90,.62) 100%), url(${heroImage})`,
              }
            : undefined
        }
        aria-hidden
      />
      <Sunburst />
      <div
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#070e1e] to-transparent"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:pb-24 lg:pt-16">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 pb-5">
          <p className="flex items-center gap-2.5 text-[10.5px] font-bold uppercase tracking-[0.26em] text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5BE2A]" aria-hidden />
            Portal para desarrolladores
          </p>
          <div className="flex items-center gap-2 text-[11.5px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F5BE2A]/35 bg-[#F5BE2A]/10 px-3 py-1.5 text-[#F5BE2A]">
              <span className="size-1.5 rounded-full bg-[#F5BE2A]" aria-hidden />
              API v1 · {live ? "datos en vivo" : "demostración"}
            </span>
            <a
              href="/api/v1/public/openapi.json"
              className="rounded-full border border-white/20 px-3 py-1.5 text-white/75 transition hover:border-white/45 hover:text-white"
            >
              OpenAPI ↗
            </a>
          </div>
        </div>

        <div className="mt-10 grid gap-12 lg:mt-14 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-center lg:gap-10">
          <div className="relative">
            <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.24em] text-white/80 sm:text-[11.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F5BE2A]" aria-hidden />
              Datos cívicos abiertos · Cuauhtémoc
            </p>

            <h1 className="mt-5 max-w-[38rem] text-[34px] font-black uppercase leading-[0.95] tracking-[-0.03em] sm:text-5xl lg:text-[64px]">
              Casos públicos.
              <br />
              Datos abiertos.
              <br />
              <span className="relative inline-block">
                <span
                  className="absolute inset-x-0 bottom-1 h-3 -skew-x-12 bg-[#F5BE2A] sm:h-4"
                  aria-hidden
                />
                <span className="relative">Listos para construir.</span>
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/80 sm:text-base">
              Una API de solo lectura para consultar reportes aprobados, estadísticas agregadas y
              señales preventivas revisadas por personas. Sin autenticación, sin datos personales y
              con un contrato estable para tu próximo proyecto cívico.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#endpoints"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#F5BE2A] px-6 text-sm font-bold text-[#14120f] transition hover:bg-[#ffd166]"
              >
                Explorar endpoints <span aria-hidden>→</span>
              </a>
              <a
                href="#consola"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-[#0b1a2f] transition hover:bg-white/90"
              >
                Probar la API
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-white/65">
              {GUARANTEES.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="size-1 rounded-full bg-[#F5BE2A]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative lg:pl-4">
            <div className="rounded-[1.5rem] border border-white/15 bg-white/[0.06] p-3 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm">
              <div className="overflow-hidden rounded-[1.05rem] border border-white/10 bg-[#06100d]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#F5BE2A]/15 px-2 py-1 font-mono text-[10px] font-bold text-[#F5BE2A]">
                      GET
                    </span>
                    <code className="font-mono text-[10.5px] text-white/65">
                      /api/v1/public/cases
                    </code>
                  </div>
                  <span className="text-[10px] text-white/35">200 OK</span>
                </div>
                <pre className="overflow-hidden p-4 font-mono text-[10.5px] leading-[1.8] text-white/70">
                  <code>{SAMPLE}</code>
                </pre>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-2 rounded-2xl border border-white/15 bg-[#0b1a2f] px-4 py-3 shadow-xl sm:-left-4">
              <p className="text-[9.5px] uppercase tracking-[0.18em] text-[#F5BE2A]">
                Ubicación pública
              </p>
              <p className="mt-1 text-xl font-black tracking-tight">110 / 1 100 m</p>
              <p className="text-[10.5px] text-white/50">precisión deliberada</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
