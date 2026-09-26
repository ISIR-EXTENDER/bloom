import { Component, type ErrorInfo, type ReactNode } from "react";

type WidgetBoundaryProps = {
  children: ReactNode;
  onFailed?: () => void;
  title: string;
};

type WidgetBoundaryState = { failed: boolean };

/**
 * Keeps one widget's failure inside that widget.
 *
 * The runtime's only boundary was the view, so a renderer that threw -- a widget carrying no settings at
 * all, say -- replaced the whole operating surface with a fallback, STOP included. A screen missing one
 * card is recoverable; a screen missing STOP is not.
 */
export class WidgetBoundary extends Component<WidgetBoundaryProps, WidgetBoundaryState> {
  state: WidgetBoundaryState = { failed: false };

  static getDerivedStateFromError(): WidgetBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Bloom widget "${this.props.title}" failed to render.`, error, info.componentStack);
    // The fallback says it sends nothing, so whatever it was holding goes too.
    try {
      this.props.onFailed?.();
    } catch (releaseError) {
      console.error(`Bloom widget "${this.props.title}" could not release its command.`, releaseError);
    }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <p className="bloom-widget-failed">This control could not be drawn. It is sending nothing.</p>;
    }
    return this.props.children;
  }
}
