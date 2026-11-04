/**
 * An error boundary per workspace.
 *
 * Added because of a real failure, not as boilerplate: a malformed API response
 * made the saved-charts panel throw, React unmounted the tree, and Chart Studio
 * rendered a blank page with no heading, no form and no indication that
 * anything had gone wrong. The underlying bug is fixed, but "one panel throws,
 * the workspace disappears" is a property of the structure, not of that bug.
 *
 * What it shows is deliberately plain: a statement that this part failed, the
 * message for a developer, and the navigation still intact so the reader can
 * leave. It does not offer a retry that cannot be trusted to clear the cause.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
  /** Changing this remounts the boundary — used to reset on navigation. */
  readonly resetKey?: string;
}

interface State {
  readonly message: string | null;
}

export class WorkspaceBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidUpdate(previous: Props): void {
    // Navigating away from a broken workspace must clear the error; otherwise
    // the boundary keeps showing it over whatever the reader opened next.
    if (previous.resetKey !== this.props.resetKey && this.state.message !== null) {
      this.setState({ message: null });
    }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The console keeps the component stack, which is what actually locates
    // the fault; the screen keeps only what a reader can act on.
    console.error('workspace failed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="as-page as-page-narrow">
        <section className="as-card" role="alert" style={{ borderColor: 'var(--as-danger)' }}>
          <h1 className="as-h1">Something in this workspace failed</h1>
          <p className="as-body" style={{ marginBlockStart: '0.5rem' }}>
            The rest of the app still works — use the navigation to move on. The
            calculation engine runs on this device and is unaffected.
          </p>
          <p className="as-fineprint" style={{ marginBlockStart: '0.75rem' }}>
            <code>{this.state.message}</code>
          </p>
        </section>
      </div>
    );
  }
}
