import {
  Accessibility,
  CircleEllipsis,
  Lightbulb,
  TrafficCone,
  Trash2,
  Trees,
  TriangleAlert,
  Warehouse,
} from "lucide-react";
import { CATEGORY_META, type CategoryMeta } from "@/lib/taxonomy";
import type { CaseCategory } from "@/shared/votavia-contract";
import { cn } from "@/lib/utils";

const ICONS = {
  "triangle-alert": TriangleAlert,
  lightbulb: Lightbulb,
  "traffic-cone": TrafficCone,
  accessibility: Accessibility,
  trees: Trees,
  "trash-2": Trash2,
  "bench-tree": Warehouse,
  "circle-ellipsis": CircleEllipsis,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: CaseCategory;
  className?: string;
}) {
  const meta: CategoryMeta = CATEGORY_META[category] ?? CATEGORY_META.other;
  const Icon = ICONS[meta.icon] ?? CircleEllipsis;
  return <Icon className={cn("h-4 w-4", className)} aria-hidden strokeWidth={2.2} />;
}
