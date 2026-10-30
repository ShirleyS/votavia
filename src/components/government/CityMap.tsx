"use client";

import { useState } from "react";
import { Crosshair, Minus, Plus } from "lucide-react";
import type { GovernmentCase, RiskSignal } from "@/lib/government/types";

const districts = [
  { id: "azcapotzalco", label: "Azcapotzalco", d: "M11 23 L25 12 L36 17 L34 32 L21 40 L9 35 Z" },
  { id: "gadm", label: "G. A. Madero", d: "M36 7 L56 4 L63 10 L62 27 L47 32 L35 30 L34 17 Z" },
  { id: "iztapalapa", label: "Iztapalapa", d: "M69 57 L84 51 L94 61 L91 76 L82 84 L68 78 L63 67 Z" },
  { id: "coyoacan", label: "Coyoacán", d: "M35 70 L51 63 L62 69 L61 86 L49 92 L36 87 L30 78 Z" },
  { id: "tlalpan", label: "Tlalpan", d: "M19 71 L34 69 L38 88 L31 95 L18 89 L12 80 Z" },
  { id: "cuauhtemoc", label: "Cuauhtémoc", d: "M38 34 L53 32 L58 45 L51 55 L37 52 L32 43 Z" },
  { id: "miguel_hidalgo", label: "Miguel Hidalgo", d: "M16 39 L31 36 L34 48 L29 58 L15 57 L9 47 Z" },
  { id: "benito_juarez", label: "Benito Juárez", d: "M41 57 L57 53 L64 64 L58 73 L43 72 L34 64 Z" },
  { id: "alvaro_obregon", label: "Álvaro Obregón", d: "M7 58 L20 57 L31 61 L27 72 L15 74 L6 68 Z" },
  { id: "magdalena", label: "Magdalena Contreras", d: "M22 72 L30 73 L33 86 L26 92 L18 86 Z" },
  { id: "xochimilco", label: "Xochimilco", d: "M55 86 L65 80 L77 85 L72 94 L57 96 Z" },
  { id: "tlahuac", label: "Tláhuac", d: "M78 78 L89 74 L96 82 L91 91 L79 88 Z" },
];

const roads = [
  "M22 42 C35 41 45 49 56 62 L72 79",
  "M48 10 C49 28 53 44 57 61 L53 93",
  "M11 51 C28 54 48 57 92 48",
  "M30 31 C47 30 61 37 78 46",
];

export function CityMap({
  cases,
  signals = [],
  activeCaseId,
  activeSignalId,
  onSelectCase,
  onSelectSignal,
  compact = false,
  showSignals = false,
  showLabels = true,
}: {
  cases: GovernmentCase[];
  signals?: RiskSignal[];
  activeCaseId?: string | null;
  activeSignalId?: string | null;
  onSelectCase?: (id: string) => void;
  onSelectSignal?: (id: string) => void;
  compact?: boolean;
  showSignals?: boolean;
  showLabels?: boolean;
}) {
  const [zoom, setZoom] = useState(1);

  return (
    <div className={`city-map ${compact ? "city-map--compact" : ""}`}>
      <div className="city-map__toolbar">
        <span className="city-map__sample">Mapa esquemático · muestra</span>
        <div className="city-map__zoom">
          <button type="button" onClick={() => setZoom((value) => Math.min(1.7, value + 0.15))} aria-label="Acercar mapa">
            <Plus size={14} />
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.15))} aria-label="Alejar mapa">
            <Minus size={14} />
          </button>
          <button type="button" onClick={() => setZoom(1)} aria-label="Centrar mapa">
            <Crosshair size={14} />
          </button>
        </div>
      </div>
      <svg
        className="city-map__svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Mapa esquemático de concentración de reportes"
      >
        <defs>
          <pattern id="map-grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M 6 0 L 0 0 0 6" fill="none" stroke="#dbe4f2" strokeWidth="0.18" />
          </pattern>
          <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0.7" stdDeviation="0.7" floodColor="#0b2a5c" floodOpacity="0.28" />
          </filter>
        </defs>
        <rect width="100" height="100" fill="url(#map-grid)" opacity="0.6" />
        <g
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "50% 50%",
            transition: "transform 180ms ease",
          }}
        >
          <path
            d="M11 23 L25 12 L36 7 L56 4 L63 10 L72 13 L84 19 L87 30 L94 41 L91 54 L96 62 L92 76 L82 84 L78 91 L72 94 L57 96 L49 92 L41 95 L31 95 L18 89 L12 80 L6 68 L7 58 L9 47 L12 37 Z"
            fill="#f4f7fc"
            stroke="#bdcce2"
            strokeWidth="0.5"
          />
          {districts.map((district, index) => (
            <path
              d={district.d}
              key={district.id}
              className={`map-district map-district--${index % 4}`}
            />
          ))}
          {roads.map((road) => (
            <path key={road} d={road} className="map-road" />
          ))}
          <path
            d="M11 23 L25 12 L36 7 L56 4 L63 10 L72 13 L84 19 L87 30 L94 41 L91 54 L96 62 L92 76 L82 84 L78 91 L72 94 L57 96 L49 92 L41 95 L31 95 L18 89 L12 80 L6 68 L7 58 L9 47 L12 37 Z"
            fill="none"
            stroke="#9db2d0"
            strokeWidth="0.6"
          />
          {showLabels
            ? districts.map((district) => {
                const labelPoint = district.d
                  .replace("M", "")
                  .split("L")[0]
                  .trim()
                  .split(" ")
                  .map(Number);
                return (
                  <text
                    key={`label-${district.id}`}
                    x={labelPoint[0]}
                    y={labelPoint[1] + 5}
                    className="map-label"
                  >
                    {district.label}
                  </text>
                );
              })
            : null}

          {showSignals
            ? signals.map((signal) => (
                <g
                  key={signal.id}
                  className={`map-signal ${activeSignalId === signal.id ? "is-active" : ""}`}
                  onClick={() => onSelectSignal?.(signal.id)}
                  role={onSelectSignal ? "button" : undefined}
                  tabIndex={onSelectSignal ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSelectSignal?.(signal.id);
                  }}
                >
                  <circle cx={signal.position.x} cy={signal.position.y} r="6.5" className="map-signal__halo" />
                  <circle cx={signal.position.x} cy={signal.position.y} r="4.4" className="map-signal__ring" />
                  <circle cx={signal.position.x} cy={signal.position.y} r="1.9" className="map-signal__core" />
                  <title>{signal.title}</title>
                </g>
              ))
            : null}

          {cases.map((item) => (
            <g
              key={item.id}
              className={`map-pin map-pin--${item.priority} ${
                activeCaseId === item.id ? "is-active" : ""
              }`}
              onClick={() => onSelectCase?.(item.id)}
              role={onSelectCase ? "button" : undefined}
              tabIndex={onSelectCase ? 0 : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSelectCase?.(item.id);
              }}
            >
              <circle cx={item.coordinates.x} cy={item.coordinates.y} r="3.8" className="map-pin__halo" />
              <circle
                cx={item.coordinates.x}
                cy={item.coordinates.y}
                r={item.priority === "critical" ? 2.5 : item.priority === "high" ? 2.1 : 1.65}
                className="map-pin__dot"
                filter="url(#pin-shadow)"
              />
              <title>{`${item.folio} · ${item.title}`}</title>
            </g>
          ))}
        </g>
      </svg>
      <div className="city-map__legend">
        <span><i className="map-legend-dot map-legend-dot--critical" />Crítica</span>
        <span><i className="map-legend-dot map-legend-dot--high" />Alta</span>
        <span><i className="map-legend-dot map-legend-dot--medium" />Media</span>
        <span><i className="map-legend-dot map-legend-dot--low" />Baja</span>
      </div>
    </div>
  );
}
