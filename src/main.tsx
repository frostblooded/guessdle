import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App.tsx";
import { wipeLegacyState } from "./game/game-state.ts";
import "./styles.css";

// One-time cleanup of the old un-namespaced browser guesses (spec #66, story 73)
let legacyWiped = false;
try {
  legacyWiped = wipeLegacyState(localStorage);
} catch {
  // blocked storage has nothing to wipe
}

const queryClient = new QueryClient({
  defaultOptions: {
    // Pages say themselves when data is stale (after an edit); no refetch on window focus
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
