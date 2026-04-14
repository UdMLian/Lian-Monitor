import eventBus from '../core/eventBus';

// 使用函数式组件创建ErrorBoundary，避免直接依赖React
const createErrorBoundary = (React) => {
  if (!React || !React.Component) {
    throw new Error('React is required for ErrorBoundary');
  }

  const { Component } = React;

  class ErrorBoundary extends Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: null, errorInfo: null };
    }
    
    static getDerivedStateFromError(error) {
      return { hasError: true, error };
    }
    
    componentDidCatch(error, errorInfo) {
      this.setState({ errorInfo });
      
      // 捕获React组件错误
      const errorData = {
        type: 'react',
        message: error?.message || 'Unknown React error',
        componentStack: errorInfo?.componentStack,
        stack: error?.stack,
        error
      };
      
      eventBus.emit('error:captured', errorData);
      
      // 调用自定义错误处理函数
      if (this.props.onError) {
        this.props.onError(error, errorInfo);
      }
    }
    
    render() {
      if (this.state.hasError) {
        // 自定义错误UI
        if (this.props.fallback) {
          return typeof this.props.fallback === 'function' 
            ? this.props.fallback(this.state.error, this.state.errorInfo)
            : this.props.fallback;
        }
        
        // 默认错误UI
        return React.createElement('div', {
          style: {
            padding: '20px',
            border: '1px solid #f56c6c',
            borderRadius: '4px',
            backgroundColor: '#fef0f0',
            color: '#f56c6c'
          }
        },
          React.createElement('h2', null, 'Something went wrong.'),
          React.createElement('details', {
            style: { whiteSpace: 'pre-wrap' }
          },
            this.state.error && this.state.error.toString(),
            React.createElement('br'),
            this.state.errorInfo?.componentStack
          )
        );
      }
      
      return this.props.children;
    }
  }

  return ErrorBoundary;
};

class ReactIntegration {
  constructor(config) {
    this.config = config;
    this.ErrorBoundary = null;
    this.React = null;
  }
  
  // 初始化React集成
  init() {
    // 尝试动态导入React
    try {
      this.React = require('react');
      this.ErrorBoundary = createErrorBoundary(this.React);
    } catch (error) {
      console.warn('React not found, ErrorBoundary will not be available');
    }
    
    eventBus.emit('framework:react:integrated');
    
    return {
      ErrorBoundary: this.ErrorBoundary
    };
  }
  
  // 获取ErrorBoundary组件
  getErrorBoundary() {
    if (!this.ErrorBoundary && this.React) {
      this.ErrorBoundary = createErrorBoundary(this.React);
    }
    return this.ErrorBoundary;
  }
  
  // 自动包装应用根组件
  wrapApp(AppComponent) {
    if (!AppComponent || !this.React) return AppComponent;
    
    const ErrorBoundary = this.getErrorBoundary();
    if (!ErrorBoundary) return AppComponent;
    
    const { Component } = this.React;
    const { createElement } = this.React;
    
    return class WrappedApp extends Component {
      render() {
        return createElement(ErrorBoundary, null, 
          createElement(AppComponent, this.props)
        );
      }
    };
  }
}

export default ReactIntegration;