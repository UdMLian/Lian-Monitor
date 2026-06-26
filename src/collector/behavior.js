const behaviorCollector = {
  name: 'behavior',
  setup(client) {
    this.client = client;

    // 点击监听
    this._onClick = (event) => {
      const target = event.target;
      if (!target || target === document.body) return;

      this.addBreadcrumb('click', {
        tagName: target.tagName.toLowerCase(),
        id: target.id || undefined,
        className: target.className || undefined,
      });
    };
    document.addEventListener('click', this._onClick, true);

    // 路由监听
    this._lastHref = location.href;
    this._onPushState = (...args) => {
      const url = args[2];
      if (url) {
        this.addBreadcrumb('route', {
          from: this._lastHref,
          to: String(url),
          method: 'pushState',
        });
        this._lastHref = String(url);
      }
    };

    this._onReplaceState = (...args) => {
      const url = args[2];
      if (url) {
        this.addBreadcrumb('route', {
          from: this._lastHref,
          to: String(url),
          method: 'replaceState',
        });
        this._lastHref = String(url);
      }
    };

    // 保存原始方法
    this._originalPushState = history.pushState;
    this._originalReplaceState = history.replaceState;

    const collector = this;
    history.pushState = function (...args) {
      collector._onPushState(...args);
      return collector._originalPushState.apply(this, args);
    };

    history.replaceState = function (...args) {
      collector._onReplaceState(...args);
      return collector._originalReplaceState.apply(this, args);
    };

    // popstate / hashchange
    this._onPopState = () => {
      const to = location.href;
      this.addBreadcrumb('route', { from: this._lastHref, to, method: 'popstate' });
      this._lastHref = to;
    };

    this._onHashChange = () => {
      const to = location.href;
      this.addBreadcrumb('route', { from: this._lastHref, to, method: 'hashchange' });
      this._lastHref = to;
    };

    window.addEventListener('popstate', this._onPopState);
    window.addEventListener('hashchange', this._onHashChange);

    // XHR 劫持
    if (window.XMLHttpRequest) {
      this._originalXHROpen = XMLHttpRequest.prototype.open;
      this._originalXHRSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._monitor = {
          method: method.toUpperCase(),
          url: String(url),
          startTime: Date.now(),
        };
        return collector._originalXHROpen.apply(this, [method, url, ...rest]);
      };

      XMLHttpRequest.prototype.send = function (body, ...rest) {
        if (!this._monitor) {
          return collector._originalXHRSend.apply(this, [body, ...rest]);
        }
        this.addEventListener('loadend', () => {
          collector.addBreadcrumb('xhr', {
            method: this._monitor.method,
            url: this._monitor.url,
            status: this.status,
            duration: Date.now() - this._monitor.startTime,
          });
        });
        return collector._originalXHRSend.apply(this, [body, ...rest]);
      };

    }

    // Fetch 劫持
    if (window.fetch) {
      this._originalFetch = window.fetch;

      window.fetch = async (input, init = {}) => {
        const startTime = Date.now();
        const url = typeof input === 'string' ? input : (input.url || input);
        const method = (init.method || 'GET').toUpperCase();

        try {
          const response = await collector._originalFetch(input, init);
          collector.addBreadcrumb('fetch', {
            method,
            url: String(url),
            status: response.status,
            duration: Date.now() - startTime,
          });
          return response;
        } catch (err) {
          collector.addBreadcrumb('fetch', {
            method,
            url: String(url),
            error: true,
            duration: Date.now() - startTime,
          });
          throw err;
        }
      };
    }
  },

  //移除监听
  teardown() {
    document.removeEventListener('click', this._onClick, true);
    window.removeEventListener('popstate', this._onPopState);
    window.removeEventListener('hashchange', this._onHashChange);

    // 还原 history
    history.pushState = this._originalPushState;
    history.replaceState = this._originalReplaceState;

    // 还原 XHR
    if (window.XMLHttpRequest && this._originalXHROpen) {
      XMLHttpRequest.prototype.open = this._originalXHROpen;
      XMLHttpRequest.prototype.send = this._originalXHRSend;
    }

    if (this._originalFetch) {
      window.fetch = this._originalFetch;
    }
  },

  addBreadcrumb(type, data) {
    this.client.getScope().addBreadcrumb({ type, ...data });
  },
};

// BehaviorCollector 不调 client.capture()，它只存面包屑，等错误发生时由 _enrichment 来取。

export default behaviorCollector;
