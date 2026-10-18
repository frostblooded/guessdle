import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyThemeMode,
  nextThemeMode,
  readThemeMode,
  themeLabel,
  writeThemeMode,
  type ThemeMode,
} from "../theme.ts";
import { Button } from "./ui/button.tsx";

const ICONS = { auto: Monitor, light: Sun, dark: Moon } as const;

// Cycles auto, light, dark; the choice is stored and applied to <html> (ADR 0006)
export function ThemeButton() {
  const [mode, setMode] = useState<ThemeMode>(() =>
    readThemeMode(localStorage),
  );
  useEffect(() => applyThemeMode(document.documentElement, mode), [mode]);
  const Icon = ICONS[mode];
  return (
    <Button
      id="theme-button"
      variant="ghost"
      size="sm"
      aria-label={`${themeLabel(mode)}. Click to change.`}
      onClick={() => {
        const next = nextThemeMode(mode);
        writeThemeMode(localStorage, next);
        setMode(next);
      }}
    >
      <Icon aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{themeLabel(mode)}</span>
    </Button>
  );
}
