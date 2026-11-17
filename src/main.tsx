import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App.tsx";
import { wipeLegacyState } from "./game/game-state.ts";
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";
import "./styles.css";

let legacyWiped = false;
try {
  legacyWiped = wipeLegacyState(localStorage);
} catch {}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App legacyWiped={legacyWiped} />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
