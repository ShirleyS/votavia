import { cn } from "@/lib/utils";

/**
 * Marca VotaVía: abanico de pétalos multicolor (rojo → naranja → ámbar →
 * turquesa en la corona) con el emblema cívico azul al centro.
 *
 * Es la única fuente del isotipo: la usan el sitio público y la consola de
 * gobierno para que la marca no se bifurque.
 */
const PETAL_STOPS: Array<[number, string]> = [
  [0.0, "#E7243C"],
  [0.11, "#EA3E40"],
  [0.22, "#F25A3A"],
  [0.31, "#F97F33"],
  [0.38, "#FBA43A"],
  [0.44, "#FBC24A"],
  [0.5, "#6FC9A8"],
  [0.56, "#FBC24A"],
  [0.62, "#FBA43A"],
  [0.69, "#F97F33"],
  [0.78, "#F25A3A"],
  [0.89, "#EA3E40"],
  [1.0, "#E7243C"],
];

const PETAL_COUNT = 17;
const FAN = { x: 50, y: 57, span: 192, inner: 10.5, outer: 45 } as const;

/** Blends the fan palette; the teal band sits at the crown only. */
function petalColor(position: number) {
  const t = Math.min(1, Math.max(0, position));
  // A single sage-teal petal crowns the fan, as in the brand reference.
  if (t > 0.485 && t < 0.515) return "#6FC9A8";
  const stops = PETAL_STOPS;
  for (let index = 0; index < stops.length - 1; index += 1) {
    const [start, from] = stops[index];
    const [end, to] = stops[index + 1];
    if (t <= end) {
      const k = (t - start) / (end - start || 1);
      const a = Number.parseInt(from.slice(1), 16);
      const b = Number.parseInt(to.slice(1), 16);
      const channel = (shift: number) =>
        Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * k);
      return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return stops[stops.length - 1][1];
}

const PETALS = Array.from({ length: PETAL_COUNT }, (_, index) => {
  const t = index / (PETAL_COUNT - 1);
  const angle = -FAN.span / 2 + t * FAN.span;
  const length = FAN.outer * (0.9 + 0.1 * Math.cos((t - 0.5) * Math.PI));
  const baseWidth = 1.15;
  const tipWidth = 2.45;
  const shoulder = length - tipWidth;
  return {
    angle,
    fill: petalColor(t),
    path:
      `M${-baseWidth} ${-FAN.inner.toFixed(2)} ` +
      `L${-tipWidth} ${-shoulder.toFixed(2)} ` +
      `A${tipWidth} ${tipWidth} 0 0 1 ${tipWidth} ${-shoulder.toFixed(2)} ` +
      `L${baseWidth} ${-FAN.inner.toFixed(2)} Z`,
  };
});

/** Emblema azul: cabeza abovedada, dos alas alzadas y punta inferior. */
const EMBLEM_PATH =
  "M50 27c4.6 4.8 7.1 10 7.1 15 0 3-.9 5.8-2.6 8.4 3.6-2.3 7.9-3.2 11.9-2.3 3.2.7 5.8 2.8 7.3 5.5-4.5 3.5-10.7 4.7-17 3.2-1.4 3.9-3.9 7.7-6.7 11.2-2.8-3.5-5.3-7.3-6.7-11.2-6.3 1.5-12.5.3-17-3.2 1.5-2.7 4.1-4.8 7.3-5.5 4-.9 8.3 0 11.9 2.3-1.7-2.6-2.6-5.4-2.6-8.4 0-5 2.5-10.2 7.1-15Z";

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
      {PETALS.map((petal) => (
        <path
          key={petal.angle}
          d={petal.path}
          fill={petal.fill}
          transform={`translate(${FAN.x} ${FAN.y}) rotate(${petal.angle.toFixed(2)})`}
        />
      ))}
      <g fill="#1D4FD8">
        <path d={EMBLEM_PATH} />
        <circle cx="34.2" cy="60.4" r="2" />
        <circle cx="65.8" cy="60.4" r="2" />
      </g>
    </svg>
  );
}
