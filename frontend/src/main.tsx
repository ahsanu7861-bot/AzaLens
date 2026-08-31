import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Router from "./app/Router";
import { ThemeProvider } from "./app/providers/ThemeProvider";
import { applyLocalSettings, readLocalSettings } from "./app/preferences";
import "./index.css";

applyLocalSettings(readLocalSettings());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
