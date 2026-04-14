import eventBus from '../core/eventBus';

class BehaviorCollector {
  constructor(config) {
    this.config = config;
    this.breadcrumbs = [];
    this.lastHref = document.location.href;
    this.originalFetch = null;
    this.originalXHROpen = null;
    this.originalXHRSend = null;
    this.originalConsole = {};
    this.xhrHandlerInitialized = false;
    this.fetchHandlerInitialized = false;
  }

  init() {
    if (!this.config.behavior.enable) return;

    if (this.config.behavior.captureClicks) {
      this.setupClickHandler();
    }

    if (this.config.behavior.captureRouteChanges) {
      this.setupRouteChangeHandler();
    }

    if (this.config.behavior.captureNetworkRequests) {
      this.setupNetworkRequestHandler();
    }

    if (this.config.behavior.captureConsole) {
      this.setupConsoleHandler();
    }

    eventBus.emit('collector:behavior:initialized');
  }

  addBreadcrumb(type, data) {
    const breadcrumb = {
      type,
      timestamp: Date.now(),
      ...data
    };

    this.breadcrumbs.push(breadcrumb);

    // 限制面包屑数量
    if (this.breadcrumbs.length > this.config.behavior.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }

    eventBus.emit('behavior:breadcrumb', breadcrumb);
    return breadcrumb;
  }

  getBreadcrumbs() {
    return [...this.breadcrumbs];
  }

  clearBreadcrumbs() {
    this.breadcrumbs = [];
    eventBus.emit('behavior:breadcrumbs:cleared');
  }

  setupClickHandler() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || target.tagName === 'BODY') return;

      const tagName = target.tagName.toLowerCase();
      const id = target.id ? `id="${target.id}"` : '';
      const className = target.className ? `class="${target.className}"` : '';
      const text = target.textContent ? target.textContent.trim().substring(0, 100) : '';

      const domInfo = `<${tagName} ${id} ${className}>${text}</${tagName}>`;

      this.addBreadcrumb('click', {
        dom: domInfo,
        tagName,
        id: target.id,
        className: target.className,
        text,
        x: event.clientX,
        y: event.clientY
      });
    }, true);
  }

  setupRouteChangeHandler() {
    // 重写history.pushState和replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const handleRouteChange = (method, args) => {
      const url = args.length > 2 ? args[2] : undefined;
      if (url) {
        const from = this.lastHref;
        const to = String(url);
        this.lastHref = to;

        this.addBreadcrumb('route', {
          method,
          from,
          to,
          fullUrl: window.location.origin + to
        });
      }
    };

    history.pushState = (...args) => {
      handleRouteChange('pushState', args);
      return originalPushState.apply(history, args);
    };

    history.replaceState = (...args) => {
      handleRouteChange('replaceState', args);
      return originalReplaceState.apply(history, args);
    };

    // 监听popstate事件
    window.addEventListener('popstate', () => {
      const from = this.lastHref;
      const to = window.location.href;
      this.lastHref = to;

      this.addBreadcrumb('route', {
        method: 'popstate',
        from,
        to
      });
    });

    // 监听hashchange事件
    window.addEventListener('hashchange', () => {
      const from = this.lastHref;
      const to = window.location.href;
      this.lastHref = to;

      this.addBreadcrumb('route', {
        method: 'hashchange',
        from,
        to
      });
    });
  }

  setupNetworkRequestHandler() {
    this.setupXHRHandler();
    this.setupFetchHandler();
  }

  setupXHRHandler() {
    if (!window.XMLHttpRequest) return;
    if (this.xhrHandlerInitialized) return;
    this.xhrHandlerInitialized = true;

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const collector = this;

    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      this._monitor = {
        method: method.toUpperCase(),
        url: String(url),
        startTime: Date.now()
      };
      return originalOpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function (body, ...args) {
      if (this._monitor && this._monitor.url.includes('X-SDK-Internal')) {
        return originalSend.apply(this, [body, ...args]);
      }

      if (this._monitor) {
        this._monitor.reqData = body;

        const xhr = this;

        const handleLoad = () => {
          const endTime = Date.now();
          xhr._monitor.endTime = endTime;
          xhr._monitor.elapsedTime = endTime - xhr._monitor.startTime;
          xhr._monitor.status = xhr.status;

          collector.addBreadcrumb('xhr', {
            method: xhr._monitor.method,
            url: xhr._monitor.url,
            startTime: xhr._monitor.startTime,
            endTime,
            elapsedTime: endTime - xhr._monitor.startTime,
            status: xhr.status,
            type: 'xhr'
          });
        };

        const handleError = () => {
          const endTime = Date.now();
          xhr._monitor.endTime = endTime;
          xhr._monitor.elapsedTime = endTime - xhr._monitor.startTime;
          xhr._monitor.status = xhr.status;
          xhr._monitor.error = true;

          collector.addBreadcrumb('xhr', {
            ...xhr._monitor,
            type: 'xhr',
            error: true
          });
        };

        xhr.addEventListener('load', handleLoad);
        xhr.addEventListener('error', handleError);
        xhr.addEventListener('abort', handleError);
      }

      return originalSend.apply(this, [body, ...args]);
    };
  }

  setupFetchHandler() {
    if (!window.fetch) return;
    if (this.fetchHandlerInitialized) return;
    this.fetchHandlerInitialized = true;

    const originalFetch = window.fetch;

    const getInternalHeader = (headers) => {
      if (!headers) return undefined;
      if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        return headers.get('X-SDK-Internal') || headers.get('x-sdk-internal');
      }
      return headers['X-SDK-Internal'] || headers['x-sdk-internal'];
    };

    window.fetch = async (url, config = {}) => {
      const isSdkInternal = config._monitorInternal === true || getInternalHeader(config.headers) === 'true';

      if (isSdkInternal) {
        const { _monitorInternal, ...cleanConfig } = config;
        return originalFetch(url, cleanConfig);
      }

      const startTime = Date.now();
      const method = (config.method || 'GET').toUpperCase();

      const monitorData = {
        method,
        url: String(url),
        startTime,
        reqData: config.body,
        type: 'fetch'
      };

      try {
        const response = await originalFetch(url, config);
        const endTime = Date.now();

        monitorData.endTime = endTime;
        monitorData.elapsedTime = endTime - startTime;
        monitorData.status = response.status;

        this.addBreadcrumb('fetch', monitorData);

        return response;
      } catch (error) {
        const endTime = Date.now();

        monitorData.endTime = endTime;
        monitorData.elapsedTime = endTime - startTime;
        monitorData.error = true;
        monitorData.errorMessage = error.message;

        this.addBreadcrumb('fetch', {
          ...monitorData,
          error: true
        });

        throw error;
      }
    };
  }

  setupConsoleHandler() {
    const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'];

    consoleMethods.forEach(method => {
      if (typeof console[method] === 'function') {
        this.originalConsole[method] = console[method];

        console[method] = (...args) => {
          this.addBreadcrumb('console', {
            method,
            args: args.map(arg => {
              try {
                if (typeof arg === 'object') {
                  return JSON.stringify(arg);
                }
                return String(arg);
              } catch (e) {
                return '[Object]';
              }
            })
          });

          return this.originalConsole[method].apply(console, args);
        };
      }
    });
  }

  destroy() {
    // 恢复原始方法
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
    }
    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
    }
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }

    // 恢复原始控制台方法
    for (const method in this.originalConsole) {
      if (this.originalConsole.hasOwnProperty(method)) {
        console[method] = this.originalConsole[method];
      }
    }

    eventBus.emit('collector:behavior:destroyed');
  }
}

export default BehaviorCollector;