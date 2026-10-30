import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-page space-y-6 py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando contenido…</span>
      <Skeleton className="h-10 w-2/3 max-w-lg" />
      <Skeleton className="h-4 w-1/2 max-w-md" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
