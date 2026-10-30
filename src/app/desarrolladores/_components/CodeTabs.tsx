"use client";

import { useState } from "react";
import { CodeBlock } from "./CodeBlock";

export interface CodeTab {
  label: string;
  code: string;
}

export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);
  const tab = tabs[active];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1 rounded-full border border-forest/10 bg-white/60 p-1">
        {tabs.map((item, index) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setActive(index)}
            aria-pressed={index === active}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              index === active
                ? "bg-forest text-white"
                : "text-slate-soft hover:bg-forest/5 hover:text-forest"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <CodeBlock code={tab.code} label={tab.label} />
    </div>
  );
}
