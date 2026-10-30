"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useGovernment } from "./GovernmentProvider";
import { SessionGate } from "./SessionGate";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);
  const {
    dataSource,
    error,
    authenticated,
    retry,
    loading,
  } = useGovernment();

  // Close the mobile drawer when navigation changes the route. Adjusting state
  // during render avoids an extra commit and the effect round-trip.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
      }
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="gov-shell">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="gov-shell__main">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <ServiceBanner
          dataSource={dataSource}
          error={error}
          authenticated={authenticated}
          loading={loading}
          onRetry={() => void retry()}
        />
        <main className="gov-content">
          <SessionGate>{children}</SessionGate>
        </main>
      </div>
    </div>
  );
}

function ServiceBanner({
  dataSource,
  error,
  authenticated,
  loading,
  onRetry,
}: {
  dataSource: "demo" | "core";
  error: string | null;
  authenticated: boolean;
  loading: boolean;
  onRetry: () => void;
}) {
  if (dataSource === "demo") return null;

  if (!authenticated) {
    return (
      <div className="gov-service-banner gov-service-banner--warning" role="status">
        <strong>Sesión del núcleo no iniciada</strong>
        <span>
          Autorízate en la aplicación principal de VotaVía con una cuenta de organización
          responsable. Esta consola no crea sesiones propias.
        </span>
        <button type="button" onClick={onRetry}>Reintentar</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gov-service-banner gov-service-banner--error" role="alert">
        <strong>Núcleo VotaVía no disponible</strong>
        <span>{error} Los datos mostrados pueden estar incompletos.</span>
        <button type="button" onClick={onRetry} disabled={loading}>
          {loading ? "Reintentando…" : "Reintentar"}
        </button>
      </div>
    );
  }

  return null;
}
