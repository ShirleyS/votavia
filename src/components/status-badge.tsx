import { STATUS_META } from "@/lib/taxonomy";
import type { CaseStatus } from "@/shared/votavia-contract";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: CaseStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.reported;
  return <Badge className={meta.className}>{meta.label}</Badge>;
}
