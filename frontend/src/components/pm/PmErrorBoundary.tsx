import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { logger } from "../../lib/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PmErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error("[PM-ERROR-BOUNDARY]", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center text-center p-8"
          style={{ backgroundColor: "var(--color-pm-bg-primary, #171615)" }}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl mb-5"
            style={{ backgroundColor: "rgba(196,51,51,0.1)" }}
          >
            <AlertTriangle className="h-7 w-7 text-[#C43333]" strokeWidth={1.5} />
          </div>
          <h2
            className="text-lg font-semibold mb-2"
            style={{ color: "var(--color-pm-text-primary, #F0ECE8)" }}
          >
            Something went wrong
          </h2>
          <p
            className="text-sm max-w-sm mb-6 leading-relaxed"
            style={{ color: "var(--color-pm-text-secondary, #9A938A)" }}
          >
            An unexpected error occurred in the Projects module.
            Try reloading the page.
          </p>
          <button
            onClick={this.handleReload}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150"
            style={{
              backgroundColor: "#D66853",
              boxShadow: "0 2px 8px rgba(214,104,83,0.25)",
            }}
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            Reload
          </button>
          {this.state.error && (
            <p
              className="mt-5 text-[11px] max-w-md font-mono"
              style={{ color: "var(--color-pm-text-muted, #5E5850)" }}
            >
              {this.state.error.message}
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
