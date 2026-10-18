import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One page, the React app (ADR 0017). The build lands in dist/ with hashed assets under
// /dist/assets/; `npm run dev` serves it at / with hot reload and the API proxied to `npm start`.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/dist/" : "/",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/uploads": "http://localhost:8080",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
}));
