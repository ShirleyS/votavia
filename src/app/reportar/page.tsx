import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Timer, Users } from "lucide-react";
import { ReportWizard } from "@/components/report/report-wizard";
import { getSessionUser } from "@/server/auth/session";
import { hasSupabaseAuth } from "@/server/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reportar un problema",
  description:
    "Reporta baches, luminarias, banquetas, basura o cualquier problema del espacio público en Cuauhtémoc.",
};

export default async function ReportarPage() {
  const user = await getSessionUser();

  return (
    <div className="bg-surface">
      <div className="border-b border-line bg-white">
        <div className="container-page py-8 sm:py-10">
          <Link
            href="/explorar"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-royal-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a explorar
          </Link>
          <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">Reporta un problema</h1>
          <p className="mt-2 max-w-2xl text-sm text-navy-500 sm:text-base">
            Cuéntanos qué pasa y dónde. Antes de enviar, revisamos si alguien ya lo reportó para
            sumar tu apoyo en lugar de duplicar el caso.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-navy-600">
            <li className="inline-flex items-center gap-1.5">
              <Timer className="h-4 w-4 text-royal-600" aria-hidden /> Toma menos de 3 minutos
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-royal-600" aria-hidden /> Puedes reportar sin cuenta
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-royal-600" aria-hidden /> Tu correo nunca se publica
            </li>
          </ul>
        </div>
      </div>

      <div className="container-page py-8 sm:py-10">
        <ReportWizard
          initialEmail={user?.email ?? ""}
          authenticated={Boolean(user)}
          demoAuth={!hasSupabaseAuth()}
        />
      </div>
    </div>
  );
}
