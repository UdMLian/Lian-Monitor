// React ErrorBoundary 创建函数
// 用法：
//   import React from 'react'
//   import { createErrorBoundary } from 'lian-monitor'
//   const MonitorErrorBoundary = createErrorBoundary(React, monitor)
//
//   <MonitorErrorBoundary fallback={<ErrorPage />}>
//     <App />
//   </MonitorErrorBoundary>

export function createErrorBoundary(React, client) {
  return class MonitorErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
      return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
      client.captureError(error, {
        data: {
          framework: 'react',
          componentStack: errorInfo?.componentStack || '',
        },
      });
      // 调用用户自己的 onError 回调（如果有）
      if (this.props.onError) {
        this.props.onError(error, errorInfo);
      }
    }

    render() {
      if (this.state.hasError) {
        return this.props.fallback || null;
      }
      return this.props.children;
    }
  };
}
