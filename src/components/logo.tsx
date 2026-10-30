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
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark size={36} />
      {showWordmark ? (
        <span className="text-[26px] font-extrabold leading-none tracking-[-0.035em] text-[#1D4FD8]">
          Vota<span className="text-[#2F6BE8]">Vía</span>
        </span>
      ) : null}
    </span>
  );
}
