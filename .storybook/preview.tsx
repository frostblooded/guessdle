import type { Preview } from "@storybook/react-vite";
import { useEffect } from "react";
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";
import "../src/styles.css";
import { applyThemeMode, type ThemeMode } from "../src/theme.ts";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Light or dark theme, as the theme button sets it",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: ["auto", "light", "dark"],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "auto" },
  decorators: [
    (Story, { globals }) => {
      const mode = globals["theme"] as ThemeMode;
      useEffect(() => applyThemeMode(document.documentElement, mode), [mode]);
      return (
        <div className="bg-background p-4 text-foreground">
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
