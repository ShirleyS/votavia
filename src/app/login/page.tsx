import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/logo";
import { getSessionUser } from "@/server/auth/session";
import { hasSupabaseAuth } from "@/server/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Accede con un enlace mágico para dar seguimiento a tus reportes en VotaVía.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const nextParam = single(params.next);
  const next = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/mis-reportes";
  const error = single(params.error);
  const user = await getSessionUser();

  if (user) redirect(next);

  return (
    <div className="bg-surface">
      <div className="container-page grid min-h-[70vh] place-items-center py-10">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-royal-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al inicio
          </Link>

          <div className="rounded-3xl border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
            <Logo />
            <h1 className="mt-5 text-2xl font-extrabold">Entra a VotaVía</h1>
            <p className="mt-1.5 text-sm text-navy-500">
              Guarda tus reportes, consulta su estado y recibe actualizaciones cuando haya avances
              en tu colonia.
            </p>

            {error ? (
              <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                {error === "link_invalid"
                  ? "El enlace ya venció o no es válido. Solicita uno nuevo."
                  : error === "missing_token" || error === "missing_code"
                    ? "El enlace está incompleto. Solicita uno nuevo."
                    : "No pudimos completar el acceso. Intenta de nuevo."}
              </p>
            ) : null}

            <div className="mt-6">
              <LoginForm next={next} demoAuth={!hasSupabaseAuth()} />
            </div>
          </div>

          <p className="mt-4 flex items-start justify-center gap-1.5 text-center text-[11px] text-navy-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Usamos enlaces de un solo uso. Nunca almacenamos contraseñas ni publicamos tu correo.
          </p>
          <p className="mt-2 text-center text-xs text-navy-500">
            ¿Solo quieres reportar?{" "}
            <Link href="/reportar" className="font-semibold text-royal-700 hover:text-royal-800">
              Puedes hacerlo sin cuenta.
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
