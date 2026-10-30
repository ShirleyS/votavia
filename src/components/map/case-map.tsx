"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker as MapLibreMarker, Popup as MapLibrePopup } from "maplibre-gl";
import { CATEGORY_META, ORIGIN_META, STATUS_META } from "@/lib/taxonomy";
import { escapeHtml, formatNumber } from "@/lib/utils";
import type { CaseCategory, CaseStatus, IssueOrigin } from "@/shared/votavia-contract";
import { cn } from "@/lib/utils";

export interface MapCase {
  case_id: string;
  display_id: string;
  title: string;
  colonia: string;
  category: CaseCategory;
  status: CaseStatus;
  support_count: number;
  latitude: number;
  longitude: number;
  /** Distinguishes citizen reports, official records and mixed issues. */
  origin?: IssueOrigin;
  /** Optional destination; defaults to the citizen report page. */
  href?: string;
  /** Human label when `status` is not meaningful (e.g. imported records). */
  status_label?: string;
}

function markerColor(category: CaseCategory, origin?: IssueOrigin) {
  if (origin === "official") return ORIGIN_META.official.color;
  if (origin === "mixed") return ORIGIN_META.mixed.color;
  return DOT_COLOR[category] ?? "#64748b";
}

const DOT_COLOR: Record<CaseCategory, string> = {
  road_damage: "#e11d48",
  street_lighting: "#f59e0b",
  traffic_signals: "#7c3aed",
  sidewalk_accessibility: "#0d9488",
  trees_vegetation: "#059669",
  waste_sanitation: "#ea580c",
  parks_public_spaces: "#0284c7",
  other: "#64748b",
};

const ALCALDIA_OUTLINE: [number, number][] = [
  [-99.163, 19.4],
  [-99.1478, 19.4028],
  [-99.1355, 19.412],
  [-99.1278, 19.4292],
  [-99.1332, 19.4482],
  [-99.1434, 19.4582],
  [-99.1608, 19.4572],
  [-99.1748, 19.4424],
  [-99.1812, 19.4242],
  [-99.174, 19.408],
  [-99.163, 19.4],
];

// Why this exists: every tile host we used before now gates requests behind a
// paid key (CARTO's basemap key landed 25 Sep 2026), which painted
// "API KEY REQUIRED" watermarks across the map. Esri's Light Gray Canvas is
// keyless, so it is the default; OSM standard tiles are the automatic fallback.
// Point NEXT_PUBLIC_MAP_TILES_URL at any other {z}/{x}/{y} raster template
// (or set NEXT_PUBLIC_CARTO_KEY to go back to CARTO) without touching code.
interface RasterBasemap {
  id: string;
  tiles: string[];
  tileSize: number;
  maxZoom: number;
  attribution: string;
  paint?: Record<string, number>;
  /** Transparent label layer drawn above the base tiles, when the host splits them. */
  labels?: { tiles: string[]; maxZoom: number; attribution?: string };
}

const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY?.trim();
const CUSTOM_TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL?.trim();

const ESRI_LIGHT_GRAY: RasterBasemap = {
  id: "esri-light-gray",
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  ],
  tileSize: 256,
  maxZoom: 16,
  attribution:
    'Tiles © <a href="https://www.esri.com/">Esri</a> — Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  labels: {
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    ],
    maxZoom: 16,
  },
};

const OSM_STANDARD: RasterBasemap = {
  id: "osm-standard",
  tiles: [
    "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
    "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
    "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
  ],
  tileSize: 256,
  maxZoom: 19,
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  // Muted so the community markers stay the loudest thing on the map.
  paint: {
    "raster-saturation": -0.82,
    "raster-contrast": -0.06,
    "raster-brightness-min": 0.08,
    "raster-brightness-max": 0.96,
  },
};

const CARTO_LIGHT: RasterBasemap | null = CARTO_KEY
  ? {
      id: "carto-light",
      tiles: ["a", "b", "c"].map(
        (subdomain) =>
          `https://${subdomain}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png?key=${encodeURIComponent(CARTO_KEY)}`,
      ),
      tileSize: 256,
      maxZoom: 20,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    }
  : null;

const CUSTOM_BASEMAP: RasterBasemap | null = CUSTOM_TILES
  ? {
      id: "custom",
      tiles: [CUSTOM_TILES],
      tileSize: 256,
      maxZoom: 20,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }
  : null;

const PRIMARY_BASEMAP = CUSTOM_BASEMAP ?? CARTO_LIGHT ?? ESRI_LIGHT_GRAY;

function basemapStyle(basemap: RasterBasemap) {
  const sources: Record<string, unknown> = {
    basemap: {
      type: "raster",
      tiles: basemap.tiles,
      tileSize: basemap.tileSize,
      maxzoom: basemap.maxZoom,
      attribution: basemap.attribution,
    },
  };
  const layers: Array<Record<string, unknown>> = [
    { id: "bg", type: "background", paint: { "background-color": "#f3efe6" } },
    {
      id: "basemap",
      type: "raster",
      source: "basemap",
      paint: { "raster-opacity": 1, ...(basemap.paint ?? {}) },
    },
  ];

  if (basemap.labels) {
    sources["basemap-labels"] = {
      type: "raster",
      tiles: basemap.labels.tiles,
      tileSize: basemap.tileSize,
      maxzoom: basemap.labels.maxZoom,
    };
    layers.push({ id: "basemap-labels", type: "raster", source: "basemap-labels" });
  }

  return { version: 8 as const, sources, layers };
}

function popupHtml(item: MapCase) {
  const status = STATUS_META[item.status];
  const category = CATEGORY_META[item.category];
  return `
    <div style="min-width:220px;max-width:260px;font-family:inherit">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 0">
        <span style="font-size:11px;font-weight:700;color:#33507a;letter-spacing:.02em">${escapeHtml(item.display_id)}</span>
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:#f1f5f9;color:#16324f">${escapeHtml(item.status_label ?? status.label)}</span>
      </div>
      <div style="padding:6px 12px 4px">
        <p style="margin:0 0 3px;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${ORIGIN_META[item.origin ?? "citizen"].color}">${escapeHtml(ORIGIN_META[item.origin ?? "citizen"].label)}</p>
        <p style="margin:0;font-size:13px;font-weight:700;line-height:1.3;color:#0b1f3a">${escapeHtml(item.title)}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#33507a">${escapeHtml(category.shortLabel)} · ${escapeHtml(item.colonia)} · ${formatNumber(item.support_count)} apoyos</p>
      </div>
      <a href="${escapeHtml(item.href ?? `/reportes/${encodeURIComponent(item.case_id)}`)}" style="display:block;margin:8px 12px 12px;padding:8px 10px;border-radius:10px;background:#1453d8;color:#fff;font-size:12px;font-weight:700;text-align:center;text-decoration:none">Ver reporte</a>
    </div>`;
}

export function CaseMap({
  cases,
  center = [19.4326, -99.1505],
  zoom = 12.1,
  className,
  pickMode = false,
  picked,
  onPick,
  onSelect,
  interactive = true,
}: {
  cases: MapCase[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  pickMode?: boolean;
  picked?: { latitude: number; longitude: number } | null;
  onPick?: (point: { latitude: number; longitude: number }) => void;
  onSelect?: (caseId: string) => void;
  interactive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pickMarkerRef = useRef<MapLibreMarker | null>(null);
  const popupRef = useRef<MapLibrePopup | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const casesRef = useRef(cases);
  useEffect(() => {
    casesRef.current = cases;
  }, [cases]);
  const centerLat = center[0];
  const centerLng = center[1];

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: basemapStyle(PRIMARY_BASEMAP) as never,
        center: [center[1], center[0]],
        zoom,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;

      if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      // If the basemap host refuses tiles, fall back to OpenStreetMap once.
      // The overlay layers are re-installed by the "style.load" handler below.
      let swappedToFallback = PRIMARY_BASEMAP.id === OSM_STANDARD.id;
      let interactionsBound = false;
      map.on("error", (event) => {
        const message = String((event as { error?: Error }).error?.message ?? "");
        const looksLikeNetwork =
          message.toLowerCase().includes("tile") || message.toLowerCase().includes("fetch");
        if (!looksLikeNetwork) return;
        if (!swappedToFallback && map) {
          swappedToFallback = true;
          map.setStyle(basemapStyle(OSM_STANDARD) as never);
          return;
        }
        setFailed(true);
      });

      map.on("style.load", () => {
        if (!map || cancelled) return;
        setReady(true);
        // A style swap (basemap fallback) wipes sources and layers; rebuild them.
        if (map.getSource("cases")) return;

        map.addSource("alcaldia", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [ALCALDIA_OUTLINE] },
          },
        });
        map.addLayer({
          id: "alcaldia-fill",
          type: "fill",
          source: "alcaldia",
          paint: { "fill-color": "#1453d8", "fill-opacity": 0.035 },
        });
        map.addLayer({
          id: "alcaldia-line",
          type: "line",
          source: "alcaldia",
          paint: { "line-color": "#1453d8", "line-width": 1.4, "line-opacity": 0.35, "line-dasharray": [3, 3] },
        });

        map.addSource("cases", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: casesRef.current.map((item) => ({
              type: "Feature" as const,
              properties: {
                case_id: item.case_id,
                color: markerColor(item.category, item.origin),
                origin: item.origin ?? "citizen",
              },
              geometry: { type: "Point" as const, coordinates: [item.longitude, item.latitude] },
            })),
          },
          cluster: true,
          clusterRadius: 44,
          clusterMaxZoom: 14,
        });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "cases",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#1453d8",
            "circle-radius": ["step", ["get", "point_count"], 16, 6, 20, 14, 25],
            "circle-stroke-width": 3,
            "circle-stroke-color": "rgba(255,255,255,.92)",
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "cases",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });
        map.addLayer({
          id: "points",
          type: "circle",
          source: "cases",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["case", ["==", ["get", "origin"], "official"], 7, 8],
            "circle-stroke-width": ["case", ["==", ["get", "origin"], "official"], 4, 2.5],
            "circle-stroke-color": [
              "case",
              ["==", ["get", "origin"], "official"],
              "#0b3b36",
              "#ffffff",
            ],
          },
        });

        if (interactionsBound) return;
        interactionsBound = true;

        map.on("click", "cluster-count", (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const source = map!.getSource("cases") as unknown as {
            getClusterExpansionZoom: (id: number) => Promise<number>;
          };
          source
            .getClusterExpansionZoom(feature.properties?.cluster_id as number)
            .then((nextZoom) => {
              const [lng, lat] = (feature.geometry as { coordinates: [number, number] }).coordinates;
              map!.easeTo({ center: [lng, lat], zoom: nextZoom });
            })
            .catch(() => undefined);
        });

        map.on("click", "points", (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const caseId = String(feature.properties?.case_id ?? "");
          const item = casesRef.current.find((entry) => entry.case_id === caseId);
          if (!item) return;
          const [lng, lat] = (feature.geometry as { coordinates: [number, number] }).coordinates;
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 14, maxWidth: "280px" })
            .setLngLat([lng, lat])
            .setHTML(popupHtml(item))
            .addTo(map!);
          onSelect?.(caseId);
        });

        map.on("mouseenter", "points", () => {
          map!.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "points", () => {
          map!.getCanvas().style.cursor = pickMode ? "crosshair" : "";
        });
        map.on("mouseenter", "cluster-count", () => {
          map!.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "cluster-count", () => {
          map!.getCanvas().style.cursor = pickMode ? "crosshair" : "";
        });

        if (pickMode) map.getCanvas().style.cursor = "crosshair";
      });

      if (pickMode) {
        map.on("click", (event) => {
          onPick?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
        });
      }
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      pickMarkerRef.current?.remove();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow explicit center changes (e.g. geolocation or a picked point).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.easeTo({ center: [centerLng, centerLat], duration: 450 });
  }, [centerLat, centerLng, ready]);

  // Keep case data in sync without recreating the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("cases") as { setData?: (data: unknown) => void } | undefined;
    source?.setData?.({
      type: "FeatureCollection",
      features: cases.map((item) => ({
        type: "Feature",
        properties: {
          case_id: item.case_id,
          color: markerColor(item.category, item.origin),
          origin: item.origin ?? "citizen",
        },
        geometry: { type: "Point", coordinates: [item.longitude, item.latitude] },
      })),
    });
  }, [cases, ready]);

  // Picked point marker for the report wizard.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }
    if (!picked) return;
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;
      const element = document.createElement("div");
      element.setAttribute("aria-hidden", "true");
      element.style.cssText =
        "width:34px;height:34px;border-radius:999px;background:#1453d8;border:3px solid #fff;box-shadow:0 14px 26px -8px rgba(11,31,58,.6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:800";
      element.textContent = "✓";
      pickMarkerRef.current = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([picked.longitude, picked.latitude])
        .addTo(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [picked, ready]);

  return (
    <div
      className={cn("vv-map relative isolate overflow-hidden rounded-2xl border border-line bg-[#f3efe6] shadow-[var(--shadow-card)]", className)}
      role="application"
      aria-label="Mapa interactivo de reportes en Cuauhtémoc"
    >
      <div ref={containerRef} className="h-full w-full" />
      {!ready ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#f3efe6]">
          <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-navy-500 shadow">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-royal-600 border-t-transparent" aria-hidden />
            Cargando mapa…
          </div>
        </div>
      ) : null}
      {failed ? (
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] text-navy-500 shadow">
          Sin conexión al mapa base · los puntos siguen disponibles
        </div>
      ) : null}
      <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-navy-500">
        Cuauhtémoc
      </span>
      <noscript>
        <Link href="/explorar?vista=lista">Ver reportes en lista</Link>
      </noscript>
    </div>
  );
}
