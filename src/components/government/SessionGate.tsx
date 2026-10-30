"use client";

import { useState } from "react";
import { LogOut, ShieldCheck, ShieldX } from "lucide-react";
import { useGovernment } from "./GovernmentProvider";
import { coreMode } from "@/lib/government/core/service";

/**
 * Puerta de sesión de la consola de gobierno.
 *
 * La consola no crea sesiones propias: usa la sesión del núcleo de Session 1
 * (`/api/organizations/me`) y, cuando el núcleo no tiene Supabase Auth, su
 * acceso de demostración (`/api/auth/demo`). Sin organización verificada no se
 * muestran expedientes ni se habilitan acciones.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const {
    authenticated,
    hasMembership,
    sessionEmail,
    signInDemo,
    signOut,
    availability,
    loading,
    error,
    organizations,
    retry,
  } = useGovernment();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  if (!coreMode) return <>{children}</>;
  if (loading && !authenticated) return <SessionSkeleton />;
  if (hasMembership) return <>{children}</>;

  const unauthenticated = !authenticated;
  const unreachable = unauthenticated && availability === "degraded" && Boolean(error);

  return (
    <div className="session-gate">
      <section className="session-gate__card">
        <header className="session-gate__head">
          <span className="session-gate__icon">
            {unauthenticated ? <ShieldX size={22} /> : <ShieldCheck size={22} />}
          </span>
          <div>
            <p className="session-gate__eyebrow">Consola de gobierno</p>
            <h1>
              {unauthenticated
                ? "Se requiere una sesión del núcleo"
                : "Tu cuenta no tiene una organización verificada"}
            </h1>
          </div>
        </header>

        {unauthenticated ? (
          <p className="session-gate__body">
            Esta consola opera con la sesión de VotaVía de Session 1. No tiene
            contraseñas ni cuentas propias: si ya tienes una cuenta de la mesa de
            gobierno, inicia sesión en la aplicación principal de VotaVía con el
            mismo navegador y vuelve aquí.
          </p>
        ) : (
          <p className="session-gate__body">
            La sesión es válida, pero <code>/api/organizations/me</code> no
            devolvió ninguna membresía verificada. Los expedientes y las acciones
            quedan bloqueados por diseño: el acceso se otorga con una fila de
            membresía confirmada, nunca por el dominio del correo.
          </p>
        )}

        {unreachable ? (
          <div className="session-gate__alert" role="alert">
            <strong>Núcleo no disponible</strong>
            <span>{error}</span>
            <button type="button" className="button button--secondary button--small" onClick={() => void retry()}>
              Reintentar conexión
            </button>
          </div>
        ) : null}

        {authenticated ? (
          <dl className="session-gate__facts">
            <div>
              <dt>Correo de la sesión</dt>
              <dd>{sessionEmail ?? "Cuenta del núcleo sin correo declarado"}</dd>
            </div>
            <div>
              <dt>Organizaciones</dt>
              <dd>{organizations.length === 0 ? "Ninguna" : organizations.map((org) => org.name).join(", ")}</dd>
            </div>
          </dl>
        ) : (
          <form
            className="session-gate__form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              void signInDemo(email).finally(() => setBusy(false));
            }}
          >
            <label htmlFor="session-demo-email">Acceso de demostración</label>
            <div className="session-gate__row">
              <input
                id="session-demo-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="correo@organizacion.gob.mx"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <button type="submit" className="button button--primary button--small" disabled={busy}>
                {busy ? "Conectando…" : "Entrar"}
              </button>
            </div>
            <p className="session-gate__hint">
              Usa <code>/api/auth/demo</code> del núcleo. La cuenta resultante es una
              cuenta de <strong>demostración</strong>, no un funcionario real, y sólo
              verá lo que su membresía permita.
            </p>
            <button
              type="button"
              className="button button--secondary button--small"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setSeedError(null);
                try {
                  const response = await fetch("/api/demo/console", { method: "POST" });
                  if (!response.ok) {
                    const data = (await response.json().catch(() => null)) as
                      | { error?: { message?: string } }
                      | null;
                    throw new Error(
                      data?.error?.message ??
                        "Este entorno no permite cargar datos de demostración.",
                    );
                  }
                  window.location.reload();
                } catch (error) {
                  setSeedError(
                    error instanceof Error ? error.message : "No se pudo cargar la demo.",
                  );
                  setBusy(false);
                }
              }}
            >
              Cargar datos de demostración
            </button>
            {seedError ? (
              <p className="session-gate__alert" role="alert">
                <span>{seedError}</span>
              </p>
            ) : null}
          </form>
        )}

        <footer className="session-gate__foot">
          <span>
            El acceso se otorga con una membresía verificada de una organización
            responsable. Ningún expediente es visible sin ella.
          </span>
          {!unauthenticated ? (
            <button type="button" className="button button--ghost button--small" onClick={() => void signOut()}>
              <LogOut size={14} /> Cerrar sesión
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function SessionSkeleton() {
  return (
    <div className="session-gate" aria-busy="true" aria-label="Conectando con el núcleo">
      <section className="session-gate__card session-gate__card--loading">
        <span className="skeleton" />
        <span className="skeleton" />
        <span className="skeleton" />
      </section>
    </div>
  );
}
