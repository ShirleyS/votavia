import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon,
  value,
  label,
  tone = "royal",
  className,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  tone?: "royal" | "amber" | "emerald" | "rose" | "violet";
  className?: string;
}) {
  const tones: Record<string, string> = {
    royal: "bg-royal-600 text-white",
    amber: "bg-amber-400 text-amber-950",
    emerald: "bg-emerald-500 text-white",
    rose: "bg-rose-500 text-white",
    violet: "bg-violet-500 text-white",
  };
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <span
        className={cn("inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tones[tone])}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold leading-none tabular-nums text-navy-900">{value}</p>
        <p className="mt-1.5 text-sm leading-tight text-navy-500">{label}</p>
      </div>
    </div>
  );
}
