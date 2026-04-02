import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: null, errorStack: null, shouldShowDevReloadHint: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || String(error), errorStack: error?.stack || null };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error capturado por ErrorBoundary:", error, errorInfo);

    const message = String(error?.message || "");
    const stack = String(error?.stack || "");
    const isViteOptimizeDepsError =
      message.includes("Outdated Optimize Dep") ||
      message.includes("Failed to fetch dynamically imported module") ||
      stack.includes("/node_modules/.vite/deps/");

    if (isViteOptimizeDepsError && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const retries = Number(url.searchParams.get("_viteRetry") || "0");

      if (retries < 2) {
        url.searchParams.set("_viteRetry", String(retries + 1));
        url.searchParams.set("_v", String(Date.now()));
        window.location.replace(url.toString());
        return;
      }

      this.setState({ shouldShowDevReloadHint: true });
    }
  }

  render() {
    if (this.state.hasError) {
      const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
      return (
        <div className="max-w-2xl mx-auto mt-6 p-4 bg-red-100 text-red-700 rounded shadow text-center">
          <h2 className="text-xl font-bold mb-2">¡Ups! Algo salió mal.</h2>
          <p>Por favor, recarga la página o intenta más tarde.</p>
          {this.state.shouldShowDevReloadHint && (
            <p className="mt-2 text-sm">
              Si estás en desarrollo, reinicia Vite con <strong>npm run dev:sistema:clean</strong>.
            </p>
          )}
          {isDev && this.state.errorMessage && (
            <details className="mt-3 text-left text-xs bg-red-50 border border-red-300 rounded p-2">
              <summary className="cursor-pointer font-semibold text-red-800 mb-1">
                Detalles del error (solo en desarrollo)
              </summary>
              <p className="font-semibold text-red-900 mb-1">{this.state.errorMessage}</p>
              {this.state.errorStack && (
                <pre className="whitespace-pre-wrap break-all text-red-700 leading-tight">
                  {this.state.errorStack}
                </pre>
              )}
            </details>
          )}
          <button
            type="button"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("_v", String(Date.now()));
              window.location.replace(url.toString());
            }}
            className="mt-4 inline-flex items-center rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
          >
            Recargar ahora
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
