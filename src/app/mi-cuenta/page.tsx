import type { Metadata } from "next";
import Link from "next/link";
import { LogIn, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import { getParticipant, getSessionUser } from "@/server/auth/session";
import { getCaseService } from "@/server/services/container";
import type { UserRole } from "@/shared/votavia-contract";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi cuenta",
  description: "Administra tu sesión y consulta el resumen de tu actividad en VotaVía.",
};

const ROLE_LABEL: Record<UserRole, string> = {
  citizen: "Vecina o vecino",
  government: "Equipo de gobierno",
  specialist: "Especialista autorizado",
  admin: "Administración",
};

export default async function MiCuentaPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="container-page py-12 sm:py-16">
        <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-7 text-center shadow-[var(--shadow-card)]">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-royal-50 text-royal-700">
            <UserRound className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">Mi cuenta</h1>
          <p className="mt-2 text-sm text-navy-500">
            Inicia sesión para ver tu actividad, tus reportes y tus preferencias de seguimiento.
          </p>
          <Link href="/login?next=/mi-cuenta" className={`${buttonStyles({ size: "md" })} mt-5`}>
            <LogIn className="h-4 w-4" aria-hidden /> Entrar
          </Link>
        </div>
      </div>
    );
  }

  const participant = await getParticipant();
  const service = getCaseService();
  const [mine, supported, resolvedMine] = await Promise.all([
    service.listCases({ ownerId: user.user_id, pageSize: 1 }, participant),
    service.listCases({ supportedBy: participant.participant_key, pageSize: 1 }, participant),
    service.listCases(
      { ownerId: user.user_id, statuses: ["resolved"], pageSize: 1 },
      participant,
    ),
  ]);

  const resolved = resolvedMine.total;

  return (
    <div className="bg-surface">
      <div className="border-b border-line bg-white">
        <div className="container-page py-8 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-royal-700">Tu cuenta</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Mi cuenta</h1>
          <p className="mt-2 text-sm text-navy-500">
            Tu identidad se usa solo para dar seguimiento a tus reportes.
          </p>
        </div>
      </div>

      <div className="container-page grid gap-6 py-6 sm:py-8 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="perfil" className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)]">
          <h2 id="perfil" className="text-lg font-extrabold">Perfil</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" aria-hidden />
              <div>
                <dt className="text-xs text-navy-500">Correo</dt>
                <dd className="font-semibold text-navy-900">{user.email}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" aria-hidden />
              <div>
                <dt className="text-xs text-navy-500">Tipo de cuenta</dt>
                <dd className="font-semibold text-navy-900">{ROLE_LABEL[user.role] ?? user.role}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" aria-hidden />
              <div>
                <dt className="text-xs text-navy-500">Método de acceso</dt>
                <dd className="font-semibold text-navy-900">
                  {user.is_demo ? "Sesión de demostración" : "Enlace mágico por correo"}
                </dd>
              </div>
            </div>
          </dl>

          {user.is_demo ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Estás en modo demostración: la cuenta vive en este entorno y no se envía correo real.
            </p>
          ) : null}

          <form action="/auth/signout" method="post" className="mt-6 border-t border-line pt-5">
            <button type="submit" className={buttonStyles({ variant: "secondary", size: "md" })}>
              <LogOut className="h-4 w-4" aria-hidden /> Cerrar sesión
            </button>
          </form>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="actividad" className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)]">
            <h2 id="actividad" className="text-lg font-extrabold">Tu actividad</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface p-3">
                <dt className="text-[11px] text-navy-500">Reportes</dt>
                <dd className="mt-1 text-xl font-extrabold tabular-nums">{formatNumber(mine.total)}</dd>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <dt className="text-[11px] text-navy-500">Resueltos</dt>
                <dd className="mt-1 text-xl font-extrabold tabular-nums text-emerald-700">{formatNumber(resolved)}</dd>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <dt className="text-[11px] text-navy-500">Apoyos</dt>
                <dd className="mt-1 text-xl font-extrabold tabular-nums">{formatNumber(supported.total)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/mis-reportes" className={buttonStyles({ size: "sm" })}>
                Ver mis reportes
              </Link>
              <Link href="/reportar" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                Reportar un problema
              </Link>
            </div>
          </section>

          <section aria-labelledby="privacidad" className="rounded-2xl border border-line bg-white p-6">
            <h2 id="privacidad" className="text-lg font-extrabold">Datos y privacidad</h2>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-navy-500">
              <li>Tu correo nunca se muestra en el mapa ni en el reporte público.</li>
              <li>Usamos el correo solo para verificar el acceso y avisarte de cambios en tus casos.</li>
              <li>El punto del mapa se muestra de forma aproximada en reportes sensibles.</li>
            </ul>
            <Link href="/resultados" className="mt-4 inline-flex text-xs font-semibold text-royal-700 hover:text-royal-800">
              Ver resultados públicos
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
