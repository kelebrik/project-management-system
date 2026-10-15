import { Component, type ErrorInfo, type ReactNode } from "react";
import { isStaleBuildError } from "../app/staleBuild";

type Props = {
  children: ReactNode;
  /** What is shown instead: the error and a way to try again. */
  fallback: (error: Error, retry: () => void) => ReactNode;
  /** A change of this starts afresh, as when another page is opened. */
  resetKey?: unknown;
};

/**
 * Keeps an error in drawing a part of the application from blanking the whole
 * window: the part says what went wrong and offers to try again; another page
 * opened starts it afresh.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key: unknown }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page failed to draw", error, info.componentStack);
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    return this.props.children;
  }
}

/** What a failed part shows: in plain words, with a reload, as a newer version may be out. */
export function ErrorNotice({ error, retry, texts }: { error: Error; retry?: () => void; texts: { title: string; stale: string; other: string; reload: string; retry: string } }) {
  const stale = isStaleBuildError(error);
  return (
    <div className="error-notice" role="alert">
      <strong>{texts.title}</strong>
      <p>{stale ? texts.stale : texts.other}</p>
      {!stale && <small>{error.message}</small>}
      <div>
        <button className="primary" onClick={() => window.location.reload()} type="button">
          {texts.reload}
        </button>
        {retry && !stale && (
          <button onClick={retry} type="button">
            {texts.retry}
          </button>
        )}
      </div>
    </div>
  );
}
