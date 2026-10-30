import { CopyButton } from "./CopyButton";

export function CodeBlock({
  code,
  label,
  tone = "dark",
}: {
  code: string;
  label?: string;
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        dark ? "border-white/10 bg-[#0a1b17]" : "border-forest/10 bg-white"
      }`}
    >
      {label ? (
        <div
          className={`flex items-center justify-between gap-3 border-b px-4 py-2.5 ${
            dark ? "border-white/10" : "border-forest/10"
          }`}
        >
          <span
            className={`font-mono text-[11px] uppercase tracking-[0.16em] ${
              dark ? "text-white/45" : "text-slate-soft"
            }`}
          >
            {label}
          </span>
          <CopyButton value={code} />
        </div>
      ) : null}
      <pre className="max-h-[30rem] overflow-auto p-4 text-[12.5px] leading-relaxed">
        <code className={`font-mono ${dark ? "text-[#e6f0e9]" : "text-ink"}`}>{code}</code>
      </pre>
    </div>
  );
}
