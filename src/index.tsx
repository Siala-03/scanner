import "./index.css";
import React, { Suspense } from "react";
import { render } from "react-dom";
import { App } from "./App";
import { MenuProvider } from "./contexts/MenuContext";
import { OrdersProvider } from "./contexts/OrdersContext";
import { ThemeProvider } from "./contexts/ThemeContext";

// A stale tab (open since before the last deploy) still references JS chunk
// filenames from the old build. Once a new build ships, those old hashed
// filenames 404 — this is a normal, recoverable "you're on an old version"
// case, not a real app error, so it shouldn't show a scary crash screen.
function isChunkLoadError(error?: Error): boolean {
  const msg = error?.message || "";
  return (
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg) ||
    /loading chunk [\w-]+ failed/i.test(msg)
  );
}

// Error boundary to catch unhandled errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);

    // Auto-reload once on a stale-chunk failure — picks up the current build
    // silently instead of leaving the user stuck on an error screen. Guarded
    // by a timestamp so a genuinely broken/offline fetch can't reload-loop.
    if (isChunkLoadError(error)) {
      const key = "servv_chunk_reload_at";
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const staleBuild = isChunkLoadError(this.state.error);
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800 p-6 rounded-lg max-w-md w-full text-center">
            <h1 className="text-2xl font-bold text-white mb-4">
              {staleBuild ? "New version available" : "Something went wrong"}
            </h1>
            <p className="text-slate-400 mb-4">
              {staleBuild
                ? "This page was loaded before an update — reload to get the latest version."
                : this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

async function bootstrap() {
  render(
    <ErrorBoundary>
      <ThemeProvider>
        <MenuProvider>
          <OrdersProvider>
            <Suspense fallback={
              <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-slate-400 animate-pulse text-sm">Loading...</div>
              </div>
            }>
              <App />
            </Suspense>
          </OrdersProvider>
        </MenuProvider>
      </ThemeProvider>
    </ErrorBoundary>,
    document.getElementById("root")
  );
}

bootstrap();

