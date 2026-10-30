import { cn } from "@/lib/utils";

/**
 * Marca VotaVia: abanico de pétalos del mural de Tlatelolco con la palomita
 * cívica (palomita de voto) al pie. Es la única fuente del isotipo: la usan el
 * sitio público y la consola de gobierno para que la marca no se bifurque.
 */
const PETALS = [
  { angle: -84, fill: "#1F5BD8" },
  { angle: -56, fill: "#2F8FD0" },
  { angle: -28, fill: "#2FAE8B" },
  { angle: 0, fill: "#7FBE45" },
  { angle: 28, fill: "#F5BE2A" },
  { angle: 56, fill: "#F2803A" },
  { angle: 84, fill: "#E8506B" },
];

export function BrandMark({
  className,
  size = 36,
  title,
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <g transform="translate(22 26)">
        {PETALS.map((petal) => (
          <ellipse
            key={petal.angle}
            cx="0"
            cy="-11.6"
            rx="3.5"
            ry="10.2"
            fill={petal.fill}
            transform={`rotate(${petal.angle})`}
          />
        ))}
        {/* Palomita de voto con halo blanco que la separa del abanico. */}
        <g transform="translate(0 3) scale(0.72)">
          <path
            d="M-7.6 1.2 2 10.6 15.4 -8.4"
            fill="none"
            stroke="#ffffff"
            strokeWidth="11.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M-7.6 1.2 2 10.6 15.4 -8.4"
            fill="none"
            stroke="#1F5BD8"
            strokeWidth="6.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}
