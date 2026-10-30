import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={34} />
      {showWordmark ? (
        <span className="text-[22px] font-extrabold leading-none tracking-[-0.025em] text-navy-900">
          Vota<span className="text-royal-600">Vía</span>
        </span>
      ) : null}
    </span>
  );
}
