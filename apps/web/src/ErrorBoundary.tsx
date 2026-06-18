import React from 'react';

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 콘솔에도 남김
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 16,
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#fff',
            background: '#900',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            minHeight: '100vh',
          }}
        >
          {'앱 렌더 오류:\n' +
            (this.state.error.stack || this.state.error.message || String(this.state.error))}
        </div>
      );
    }
    return this.props.children;
  }
}
