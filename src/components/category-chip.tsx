import { CategoryIcon } from "@/components/category-icon";
import { CATEGORY_META } from "@/lib/taxonomy";
import type { CaseCategory } from "@/shared/votavia-contract";
import { cn } from "@/lib/utils";

export function CategoryChip({
  category,
  className,
  size = "md",
}: {
  category: CaseCategory;
  className?: string;
  size?: "sm" | "md";
}) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        meta.chip,
        className,
      )}
    >
      <CategoryIcon category={category} className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {meta.shortLabel}
    </span>
  );
}
