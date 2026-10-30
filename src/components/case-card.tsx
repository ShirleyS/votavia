import Link from "next/link";
import Image from "next/image";
import { MessageSquare, ThumbsUp } from "lucide-react";
import { CategoryChip } from "@/components/category-chip";
import { StatusBadge } from "@/components/status-badge";
import { CATEGORY_META } from "@/lib/taxonomy";
import { formatNumber, relativeTime } from "@/lib/utils";
import type { Case } from "@/shared/votavia-contract";
import { cn } from "@/lib/utils";

export function CaseCard({
  item,
  className,
  priority = false,
}: {
  item: Case;
  className?: string;
  priority?: boolean;
}) {
  const photo = item.photos[0];
  const meta = CATEGORY_META[item.category];

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-float)]",
        className,
      )}
    >
      <Link href={`/reportes/${item.case_id}`} className="block focus-visible:outline-none">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-navy-50">
          {photo ? (
            <Image
              src={photo.url}
              alt={`Fotografía del reporte: ${item.title}`}
              fill
              sizes="(min-width: 1024px) 360px, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              priority={priority}
              unoptimized={photo.url.endsWith(".svg")}
            />
          ) : (
            <div className={cn("flex h-full w-full items-center justify-center", meta.chip)}>
              <span className="text-sm font-semibold">{meta.shortLabel}</span>
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <CategoryChip category={item.category} className="bg-white/95 ring-white/60" />
            {item.is_demo ? (
              <span className="rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-navy-700">
                Demo
              </span>
            ) : null}
          </div>
        </div>
      </Link>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2 text-xs text-navy-500">
          <span className="font-semibold tabular-nums text-navy-700">{item.display_id}</span>
          <StatusBadge status={item.status} />
        </div>

        <h3 className="text-[17px] font-bold leading-snug text-navy-900">
          <Link href={`/reportes/${item.case_id}`} className="hover:text-royal-700">
            {item.title}
          </Link>
        </h3>

        <p className="flex items-center gap-1.5 text-sm text-navy-500">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-royal-500" aria-hidden />
          {item.colonia}
          <span aria-hidden>·</span>
          <time dateTime={item.created_at}>{relativeTime(item.created_at)}</time>
        </p>

        <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-navy-700">
            <ThumbsUp className="h-4 w-4 text-royal-600" aria-hidden />
            {formatNumber(item.support_count)}
            <span className="font-normal text-navy-500">apoyos</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-navy-500">
            <MessageSquare className="h-4 w-4" aria-hidden />
            {formatNumber(item.observation_count)}
            <span className="sr-only">observaciones</span>
          </span>
        </div>
      </div>
    </article>
  );
}
