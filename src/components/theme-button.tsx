import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
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

export function ThemeButton() {
  const [mode, setMode] = useState<ThemeMode>(() =>
    readThemeMode(localStorage),
  );
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
        applyThemeMode(document.documentElement, next);
        setMode(next);
      }}
    >
      <Icon aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{themeLabel(mode)}</span>
    </Button>
  );
}
