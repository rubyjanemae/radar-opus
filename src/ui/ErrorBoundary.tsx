import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  /** Names the failed part in the message: "The navigator hit an error". */
  label: string
  children: ReactNode
  /** One-line fallback for thin chrome (menubar, toolbar, status bar). */
  compact?: boolean
  /** Custom fallback; `reset` clears the error and renders the children again. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Called once per caught error (e.g. to close an overlay and report it). */
  onError?: (error: Error) => void
  /** The error clears when this value changes (e.g. a different dialog opens). */
  resetKey?: unknown
}

/** Contains a render error to one part of the window, with a Retry, instead of blanking the app. */
export class ErrorBoundary extends Component<Props, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey }
  static getDerivedStateFromError(error: Error) { return { error } }
  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key: unknown }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} hit an error`, error, info.componentStack)
    this.props.onError?.(error)
  }
  reset = () => this.setState({ error: null })
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    if (this.props.compact) {
      return (
        <div className="error-inline" role="alert">
          <span>{this.props.label} hit an error: {error.message}</span>
          <button className="btn btn-sm" onClick={this.reset}>Retry</button>
        </div>
      )
    }
    return (
      <div className="error-state" role="alert">
        <h3>{this.props.label} hit an error</h3>
        <pre>{error.message}</pre>
        <button className="btn" onClick={this.reset}>Retry</button>
      </div>
    )
  }
}
