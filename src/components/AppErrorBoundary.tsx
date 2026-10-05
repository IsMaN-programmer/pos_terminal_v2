import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('POS application render failed', error, info.componentStack)
    try {
      localStorage.setItem('pos_v2_last_render_error', JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        time: new Date().toISOString(),
      }))
    } catch { /* Storage may be unavailable. */ }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main style={{ minHeight: '100dvh', padding: 24, background: '#f8fafc', color: '#1e293b' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Ошибка приложения</h1>
        <p style={{ marginBottom: 16, overflowWrap: 'anywhere' }}>{this.state.error.message}</p>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: '12px 18px', border: 0, borderRadius: 8, background: '#2563eb', color: '#fff' }}>
          Перезапустить приложение
        </button>
      </main>
    )
  }
}
