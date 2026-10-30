import { cn } from "@/lib/utils";

/** Abstract civic mark: overlapping waves, no government iconography. */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden focusable="false">
        <defs>
          <linearGradient id="vv-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1453D8" />
            <stop offset="100%" stopColor="#2F63E6" />
          </linearGradient>
        </defs>
        <g>
          <path d="M3 6c4.6-3.4 8.2-1.3 9.4 2.6 1.2 3.9-1.4 7.4-5.2 7.4-3.9 0-6.4-3.2-4.2-10Z" fill="#F2B01E" />
          <path d="M13.2 3.6c4.8-.7 6.7 2.5 6.2 6.4-.4 3.3-3.2 5.2-6.6 4.4-3.4-.8-4.5-4.4-1.6-9.4Z" fill="#D63F60" opacity="0.92" />
          <path d="M21.6 4.4c4.2-1.9 7.2.4 7.4 4 .2 3.5-2.4 5.7-5.7 5.3-3.2-.4-4.9-3.4-1.7-9.3Z" fill="#10A88C" opacity="0.94" />
          <path d="M2.6 17.2h28.8L17 29.2 2.6 17.2Z" fill="url(#vv-a)" />
          <path d="M9.6 17.2h14.8L17 25.4 9.6 17.2Z" fill="#0B1F3A" opacity="0.9" />
        </g>
      </svg>
      {showWordmark ? (
        <span className="text-[22px] font-extrabold tracking-tight text-navy-900">
          VotaV<span className="text-royal-600">ía</span>
        </span>
      ) : null}
    </span>
  );
}
