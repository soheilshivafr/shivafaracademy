import { Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import type { ThemeMode } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

const options: { mode: ThemeMode; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { mode: "dark",  label: "دارک",   Icon: Moon    },
  { mode: "auto",  label: "اتومات", Icon: SunMoon },
  { mode: "light", label: "روشن",  Icon: Sun     },
];

import React from "react";

export function ThemeSelector() {
  const { mode, setMode } = useTheme();

  return (
    <div
      className="flex items-center gap-1 p-1 rounded-xl"
      style={{ background: "var(--glass-selector-bg)" }}
    >
      {options.map(({ mode: m, label, Icon }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-all text-[10px] font-bold",
              active ? "text-foreground" : "text-muted-foreground"
            )}
            style={
              active
                ? { background: "rgba(240,192,64,0.15)", border: "1px solid rgba(240,192,64,0.30)" }
                : {}
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
