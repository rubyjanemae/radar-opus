import { Component } from 'react'
import type { ReactNode } from 'react'

export class ErrorBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-state" role="alert">
        <h3>{this.props.label} hit an error</h3>
        <pre>{this.state.error.message}</pre>
        <button className="btn" onClick={() => this.setState({ error: null })}>Retry</button>
      </div>
    )
  }
}
