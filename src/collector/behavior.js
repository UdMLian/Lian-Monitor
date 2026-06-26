const behaviorCollector = {
  name: 'behavior',

  setup(client) {
    this.client = client;

    this._setupClick();
    this._setupRoute();
    this._setupXHR();
    this._setupFetch();
    this._setupPageView()
  },

  teardown() {
    this._teardownClick();
    this._teardownRoute();
    this._teardownXHR();
    this._teardownFetch();
    this._teardownPageView()
  },

  // ── 点击监听 ──────────────────────────────────────────────

  _setupClick() {
    this._onClick = (event) => {
      const target = event.target;
      if (!target || target === document.body) return;

      this.addBreadcrumb('click', {
        tagName: target.tagName.toLowerCase(),
        selector: this._getSelector(target),
        id: target.id || undefined,
        className: target.className || undefined,
      });
    };
    document.addEventListener('click', this._onClick, true);
  },

  _teardownClick() {
    document.removeEventListener('click', this._onClick, true);
  },

  // ── 路由监听（history + hash） ────────────────────────────

  _setupRoute() {
    this._lastHref = location.href;
    const self = this;

    // pushState / replaceState 劫持
    this._originalPushState = history.pushState;
    this._originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = self._originalPushState.apply(this, args);
      const url = args[2];
      if (url) {
        self.addBreadcrumb('route', {
          from: self._lastHref,
          to: String(url),
          method: 'pushState',
        });
        self._lastHref = String(url);
      }
      return result;
    };

    history.replaceState = function (...args) {
      const result = self._originalReplaceState.apply(this, args);
      const url = args[2];
      if (url) {
        self.addBreadcrumb('route', {
          from: self._lastHref,
          to: String(url),
          method: 'replaceState',
        });
        self._lastHref = String(url);
      }
      return result;
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
  },

  _teardownRoute() {
    window.removeEventListener('popstate', this._onPopState);
    window.removeEventListener('hashchange', this._onHashChange);
    history.pushState = this._originalPushState;
    history.replaceState = this._originalReplaceState;
  },

  // ── XHR 劫持 ──────────────────────────────────────────────

  _setupXHR() {
    if (!window.XMLHttpRequest) return;
    const self = this;

    this._originalXHROpen = XMLHttpRequest.prototype.open;
    this._originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      // 不在这里清理旧 listener——如果上一个请求还在飞行中，它的 loadend
      // 还没触发，清理了就会丢面包屑。旧 listener 通过闭包捕获了它自己的
      // monitor，即使 this._monitor 被覆盖也不会用错数据。
      this._monitor = {
        method: method.toUpperCase(),
        url: String(url),
        startTime: Date.now(),
        _loadendHandler: null,
      };
      return self._originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (body, ...rest) {
      if (!this._monitor) {
        return self._originalXHRSend.apply(this, [body, ...rest]);
      }

      if (self._isOwnReportUrl(this._monitor.url)) {
        return self._originalXHRSend.apply(this, [body, ...rest]);
      }

      const monitor = this._monitor;
      // 清理同一个 monitor 上的旧 listener（send→send 无 open 的罕见场景）
      if (monitor._loadendHandler) {
        this.removeEventListener('loadend', monitor._loadendHandler);
      }
      monitor._loadendHandler = () => {
        self.addBreadcrumb('xhr', {
          method: monitor.method,
          url: monitor.url,
          status: this.status,
          duration: Date.now() - monitor.startTime,
        });
      };
      this.addEventListener('loadend', monitor._loadendHandler);
      return self._originalXHRSend.apply(this, [body, ...rest]);
    };
  },

  _teardownXHR() {
    if (window.XMLHttpRequest && this._originalXHROpen) {
      XMLHttpRequest.prototype.open = this._originalXHROpen;
      XMLHttpRequest.prototype.send = this._originalXHRSend;
    }
  },

  // ── Fetch 劫持 ────────────────────────────────────────────

  _setupFetch() {
    if (!window.fetch) return;
    const self = this;

    this._originalFetch = window.fetch;

    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : (input.url || input);
      if (self._isOwnReportUrl(url)) {
        return self._originalFetch(input, init);
      }

      const startTime = Date.now();
      const method = (init.method || 'GET').toUpperCase();

      try {
        const response = await self._originalFetch(input, init);
        self.addBreadcrumb('fetch', {
          method,
          url: String(url),
          status: response.status,
          duration: Date.now() - startTime,
        });
        return response;
      } catch (err) {
        self.addBreadcrumb('fetch', {
          method,
          url: String(url),
          error: true,
          duration: Date.now() - startTime,
        });
        throw err;
      }
    };
  },

  _teardownFetch() {
    if (this._originalFetch) {
      window.fetch = this._originalFetch;
    }
  },

  _setupPageView() {
    this._pageEntryTime = Date.now()
    this.addBreadcrumb('page-enter', {
      url: location.href,
      referrer: document.referrer || undefined
    })

    // 页面离开时记录停留时长。用 pagehide 而非 beforeunload：
    // beforeunload 在移动端不可靠，pagehide 总是触发
    this._onPageHide = () => {
      this.addBreadcrumb('page-leave', {
        url: location.href,
        duration: Date.now() - this._pageEntryTime,
      });
    };

    window.addEventListener('pagehide', this._onPageHide);
  },

  _teardownPageView() {
    window.removeEventListener('pagehide', this._onPageHide);
  },

  // ── 工具方法 ──────────────────────────────────────────────

  _isOwnReportUrl(url) {
    try {
      const dsn = this.client.options.dsn
      if (!dsn) return false
      const target = new URL(url, location.origin)
      const dsnUrl = new URL(dsn, location.origin)
      return target.origin === dsnUrl.origin && target.pathname === dsnUrl.pathname
    } catch {
      return false
    }
  },

  _getSelector(element) {
    if (!element || element === document.body) return null
    const parts = []
    let current = element
    let depth = 0
    const maxDepth = 5
    while (current && current !== document.body && current !== document.documentElement && depth < maxDepth) {
      let segment = current.tagName.toLowerCase()
      if (current.id) {
        parts.unshift(`#${current.id}`)
        break
      }
      const parent = current.parentElement
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          el => el.tagName === current.tagName
        )
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          segment += `:nth-of-type(${index})`
        }
      }

      parts.unshift(segment)
      current = current.parentElement
      depth++
    }
    const selector = parts.join('>')
    // 验证选择器能准确命中目标元素
    try {
      if (document.querySelector(selector) === element) {
        return selector;
      }
    } catch {
      // 非法选择器（极少见，如特殊字符 tagName）
    }
    return null;
  },

  addBreadcrumb(type, data) {
    this.client.getScope().addBreadcrumb({ type, ...data });
  },
};

// BehaviorCollector 不调 client.capture()，它只存面包屑，等错误发生时由 _enrichment 来取。

export default behaviorCollector;
