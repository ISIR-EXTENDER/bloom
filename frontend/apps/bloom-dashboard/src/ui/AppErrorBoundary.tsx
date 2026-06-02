import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
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
        </section>
      );
    }

    return this.props.children;
  }
}
