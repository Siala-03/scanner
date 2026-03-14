import "./index.css";
import React from "react";
import { render } from "react-dom";
import { App } from "./App";

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800 p-6 rounded-lg max-w-md w-full text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
            <p className="text-slate-400 mb-4">
              {this.state.error?.message || "An unexpected error occurred"}
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

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById("root")
);
