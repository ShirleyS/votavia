"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[votavia] página con error", error);
  }, [error]);

  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        <TriangleAlert className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="text-3xl font-extrabold sm:text-4xl">Algo no salió como esperábamos</h1>
      <p className="mt-3 max-w-md text-navy-500">
        No pudimos cargar esta sección. Tus reportes siguen guardados. Intenta de nuevo.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Intentar de nuevo</Button>
        <a href="/" className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-navy-900 ring-1 ring-inset ring-line">
          Ir al inicio
        </a>
      </div>
    </div>
  );
}
