import { Info } from "lucide-react";

export function DemoBanner({ mode }: { mode: "demo" | "supabase" }) {
  if (mode === "supabase") {
    return (
      <div className="border-b border-line bg-white">
        <div className="container-page flex items-center gap-2 py-2 text-xs text-navy-500">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          Datos guardados en tu base de datos de Supabase.
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="container-page flex flex-wrap items-center gap-2 py-2 text-xs text-amber-900">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">Modo demostración.</strong> Los reportes iniciales son
          ilustrativos y no representan casos ni intervenciones oficiales. Los reportes que envíes sí
          se guardan en este entorno.
        </span>
      </div>
    </div>
  );
}
