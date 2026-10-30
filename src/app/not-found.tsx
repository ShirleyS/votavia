import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-royal-50 text-royal-700">
        <Compass className="h-7 w-7" aria-hidden />
      </span>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-royal-700">Error 404</p>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">No encontramos esta página</h1>
      <p className="mt-3 max-w-md text-navy-500">
        Puede que el enlace haya cambiado o que el reporte ya no esté disponible.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonStyles({ size: "md" })}>
          Ir al inicio
        </Link>
        <Link href="/explorar" className={buttonStyles({ variant: "secondary", size: "md" })}>
          Explorar reportes
        </Link>
      </div>
    </div>
  );
}
