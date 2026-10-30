import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/70 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
          {icon}
        </span>
      ) : null}
      <h3 className="text-base font-bold text-navy-900">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-navy-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
