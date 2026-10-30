import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-navy-900">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-navy-500">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputStyles =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-navy-500/70 focus:border-royal-400 focus:ring-2 focus:ring-royal-100 focus:outline-none";
