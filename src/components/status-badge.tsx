import { STATUS_META } from "@/lib/taxonomy";
import type { CaseStatus } from "@/shared/votavia-contract";
import { Badge } from "@/components/ui/badge";

const STATUS_DOT: Record<CaseStatus, string> = {
  reported: "bg-slate-400",
  under_review: "bg-amber-500",
  assigned: "bg-violet-500",
  in_progress: "bg-blue-500",
  pending_verification: "bg-sky-500",
  resolved: "bg-emerald-500",
  closed: "bg-slate-400",
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.reported;
  return (
    <Badge className={meta.className} dot={STATUS_DOT[status] ?? STATUS_DOT.reported}>
      {meta.label}
    </Badge>
  );
}
