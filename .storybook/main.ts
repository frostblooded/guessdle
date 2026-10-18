import type { StorybookConfig } from "@storybook/react-vite";

// Stories sit next to their components. Storybook reuses vite.config.ts for React and Tailwind.
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  viteFinal: (vite) => ({
    ...vite,
    // vite.config.ts builds the app under /dist/; the static Storybook is served from its own folder
    base: "./",
  }),
};

export default config;
