import { cn } from "@/lib/utils";

/**
 * Marca VotaVía: abanico de rayos multicolor (del rojo al turquesa) con el
 * emblema cívico azul al centro. Es la única fuente del isotipo: la usan el
 * sitio público y la consola de gobierno para que la marca no se bifurque.
 */
const RAY_STOPS: Array<[number, string]> = [
  [0.0, "#E4243D"],
  [0.08, "#EC4346"],
  [0.17, "#F4643C"],
  [0.26, "#F98C38"],
  [0.35, "#FBB53E"],
  [0.43, "#F9CE48"],
  [0.47, "#39C0C2"],
  [0.51, "#F9CE48"],
  [0.55, "#FBB53E"],
  [0.64, "#F98C38"],
  [0.74, "#F4643C"],
  [0.84, "#EC4346"],
  [1.0, "#E4243D"],
];

const RAY_COUNT = 21;
const RAY_ORIGIN = { x: 50, y: 52 } as const;

function rayColor(position: number) {
  const t = Math.min(1, Math.max(0, position));
  for (let index = 0; index < RAY_STOPS.length - 1; index += 1) {
    const [start, from] = RAY_STOPS[index];
    const [end, to] = RAY_STOPS[index + 1];
    if (t <= end) {
      const k = (t - start) / (end - start || 1);
      const a = Number.parseInt(from.slice(1), 16);
      const b = Number.parseInt(to.slice(1), 16);
      const channel = (shift: number) =>
        Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * k);
      return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return RAY_STOPS[RAY_STOPS.length - 1][1];
}

const RAYS = Array.from({ length: RAY_COUNT }, (_, index) => {
  const t = index / (RAY_COUNT - 1);
  const angle = -106 + t * 212;
  const length = 39 * (0.78 + 0.22 * Math.cos((t - 0.5) * Math.PI));
  return { angle, length, fill: rayColor(t) };
});

/** Emblema azul: cabeza abovedada, dos alas alzadas y punta inferior. */
const EMBLEM_PATH =
  "M50 26c5.6 5.4 8.7 11.4 8.7 17.2 0 3.4-1.1 6.6-3.1 9.5 3.8-2.3 8.4-3.1 12.8-1.9 3.6 1 6.5 3.4 8 6.8-5 4-11.8 5.4-18.8 3.8-1.6 4.2-4.2 8.4-7.6 12.2-3.4-3.8-6-8-7.6-12.2-7 1.6-13.8.2-18.8-3.8 1.5-3.4 4.4-5.8 8-6.8 4.4-1.2 9-.4 12.8 1.9-2-2.9-3.1-6.1-3.1-9.5 0-5.8 3.1-11.8 8.7-17.2Z";

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
      viewBox="0 0 100 100"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <g>
        {RAYS.map((ray) => (
          <path
            key={ray.angle}
            d={`M0 -8.6 L2.55 -10.1 L1.45 -${ray.length.toFixed(2)} L-1.45 -${ray.length.toFixed(2)} L-2.55 -10.1 Z`}
            fill={ray.fill}
            transform={`translate(${RAY_ORIGIN.x} ${RAY_ORIGIN.y}) rotate(${ray.angle.toFixed(2)})`}
          />
        ))}
      </g>
      <g fill="#1D4FD8">
        <path d={EMBLEM_PATH} />
        <circle cx="33.4" cy="57.6" r="2" />
        <circle cx="66.6" cy="57.6" r="2" />
      </g>
    </svg>
  );
}
