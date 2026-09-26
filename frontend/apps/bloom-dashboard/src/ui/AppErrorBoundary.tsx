import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
  /** Runs on a crash: the dispatcher lives above this boundary and would keep streaming a held pad. */
  onError?: () => void;
  onOpenHome?: () => void;
  resetKey: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.();
    console.error("Bloom UI rendering failed.", error, info.componentStack);
  }

  componentDidUpdate(previousProps: AppErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="configuration-panel" aria-labelledby="app-error-title">
          <div>
            <p className="eyebrow">Recovery</p>
            <h2 id="app-error-title">Bloom could not render this view</h2>
          </div>
          <p className="configuration-status configuration-status-error" role="alert">
            {this.state.error.message}
          </p>
          <p>Every control was released. Try the view again, or start from the home page.</p>
          <div className="hero-actions">
            <button onClick={() => this.setState({ error: null })} type="button">
              Try again
            </button>
            {this.props.onOpenHome ? (
              <button onClick={this.props.onOpenHome} type="button">
                Home
              </button>
            ) : null}
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
