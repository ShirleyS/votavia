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
    royal: "bg-royal-600 text-white shadow-[0_10px_20px_-12px_rgba(36,84,224,.9)]",
    amber: "bg-[#F2B01E] text-[#3b2a05] shadow-[0_10px_20px_-12px_rgba(242,176,30,.9)]",
    emerald: "bg-[#1FA97E] text-white shadow-[0_10px_20px_-12px_rgba(31,169,126,.9)]",
    rose: "bg-[#E8506B] text-white shadow-[0_10px_20px_-12px_rgba(232,80,107,.9)]",
    violet: "bg-violet-500 text-white",
  };
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border border-line bg-white px-5 py-5 shadow-[var(--shadow-card)] sm:px-6",
        className,
      )}
    >
      <span
        className={cn("inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full", tones[tone])}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-navy-900">{value}</p>
        <p className="mt-1.5 text-[13.5px] leading-snug text-navy-500">{label}</p>
      </div>
    </div>
  );
}
