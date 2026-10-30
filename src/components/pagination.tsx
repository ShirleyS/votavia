import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const items = Array.from({ length: pages }, (_, index) => index + 1).filter(
    (value) => value === 1 || value === pages || Math.abs(value - page) <= 1,
  );

  return (
    <nav aria-label="Paginación" className="flex items-center justify-center gap-1 pt-2">
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold",
          page <= 1 ? "pointer-events-none text-navy-500/40" : "text-navy-700 hover:bg-white",
        )}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
      </Link>
      {items.map((value, index) => (
        <span key={value} className="flex items-center gap-1">
          {index > 0 && items[index - 1] !== value - 1 ? (
            <span className="px-1 text-navy-500">…</span>
          ) : null}
          <Link
            href={href(value)}
            aria-current={value === page ? "page" : undefined}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold",
              value === page ? "bg-royal-600 text-white" : "text-navy-700 hover:bg-white",
            )}
          >
            {value}
          </Link>
        </span>
      ))}
      <Link
        href={href(Math.min(pages, page + 1))}
        aria-disabled={page >= pages}
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold",
          page >= pages ? "pointer-events-none text-navy-500/40" : "text-navy-700 hover:bg-white",
        )}
      >
        Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </nav>
  );
}
