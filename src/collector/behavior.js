const behaviorCollector = {
  name: 'behavior',

  setup(client) {
    this.client = client;

    this._setupClick();
    this._setupRoute();
    this._setupXHR();
    this._setupFetch();
    this._setupPageView();
    this._setupConsole();
    this._setupKeypress();
  },

  teardown() {
    this._teardownClick();
    this._teardownRoute();
    this._teardownXHR();
    this._teardownFetch();
    this._teardownPageView();
    this._teardownConsole();
    this._teardownKeypress();
  },

  // ── 点击监听 ──────────────────────────────────────────────

  _setupClick() {
    this._onClick = (event) => {
      const target = event.target;
      if (!target || target === document.body) return;

      this.addBreadcrumb('ui.click', {
        tagName: target.tagName.toLowerCase(),
        selector: this._getSelector(target),
        html: this._serializeElement(target),
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
        self.addBreadcrumb('navigation.route', {
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
        self.addBreadcrumb('navigation.route', {
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
      this.addBreadcrumb('navigation.route', { from: this._lastHref, to, method: 'popstate' });
      this._lastHref = to;
    };

    this._onHashChange = () => {
      const to = location.href;
      this.addBreadcrumb('navigation.route', { from: this._lastHref, to, method: 'hashchange' });
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
        self.addBreadcrumb('http.xhr', {
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
        self.addBreadcrumb('http.fetch', {
          method,
          url: String(url),
          status: response.status,
          duration: Date.now() - startTime,
        });
        return response;
      } catch (err) {
        self.addBreadcrumb('http.fetch', {
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
    this.addBreadcrumb('navigation.page-enter', {
      url: location.href,
      referrer: document.referrer || undefined
    })

    // 页面离开时记录停留时长。用 pagehide 而非 beforeunload：
    // beforeunload 在移动端不可靠，pagehide 总是触发
    this._onPageHide = () => {
      this.addBreadcrumb('navigation.page-leave', {
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

  // DOM 序列化：只捕获结构信息（标签、id、class、关键属性名），不含文本内容和 URL 参数
  _serializeElement(element) {
    if (!element || element === document.body) return null;
    try {
      const tag = element.tagName.toLowerCase();
      let html = `<${tag}`;
      if (element.id) html += `#${element.id}`;
      if (element.className && typeof element.className === 'string') {
        const cls = element.className.trim();
        if (cls) html += `.${cls.split(/\s+/).join('.')}`;
      }
      // 只记录属性名，不记录值（href/src 去查询参数后截断）
      const attrs = ['type', 'name', 'placeholder', 'alt', 'title', 'role'];
      for (const attr of attrs) {
        const val = element.getAttribute(attr);
        if (val) html += `[${attr}="${val.substring(0, 20)}"]`;
      }
      // href/src 去查询参数和 hash
      for (const attr of ['href', 'src']) {
        let val = element.getAttribute(attr);
        if (val) {
          try {
            const u = new URL(val, location.origin);
            val = u.origin + u.pathname;
          } catch { /* 非标准 URL，直接用 */ }
          html += `[${attr}="${val.substring(0, 80)}"]`;
        }
      }
      html += '>';
      // 不捕获 textContent：可能包含用户敏感信息
      html += `</${tag}>`;
      if (html.length > 512) html = html.substring(0, 509) + '...';
      return html;
    } catch {
      return null;
    }
  },

  // ── Console 拦截（breadcrumb） ─────────────────────────────

  _setupConsole() {
    if (!window.console) return;
    const self = this;
    const levels = ['log', 'warn', 'error'];

    for (const method of levels) {
      const original = console[method];
      if (typeof original !== 'function') continue;

      // 保存原始引用（console.error 可能已被 error collector 包装过，
      // 这里存的是"当前版本"，teardown 时按条件恢复）
      this['_originalConsole_' + method] = original;

      const wrapper = function (...args) {
        // 先调原始方法，保留控制台输出
        original.apply(console, args);

        const serialized = Array.from(args).map(arg => {
          if (arg instanceof Error) return arg.message + '\n' + (arg.stack || '');
          if (typeof arg === 'object') {
            try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
          }
          return String(arg);
        });

        const breadcrumbLevel = method === 'log' ? 'log' : method === 'warn' ? 'warning' : 'error';
        self.addBreadcrumb('console', {
          level: method,
          args: serialized,
        }, breadcrumbLevel);
      };
      this['_consoleWrapper_' + method] = wrapper;
      console[method] = wrapper;
    }
  },

  _teardownConsole() {
    for (const method of ['log', 'warn', 'error']) {
      const wrapper = this['_consoleWrapper_' + method];
      const savedOriginal = this['_originalConsole_' + method];
      // 只在当前 console[method] 仍是自己的 wrapper 时才恢复。
      // 如果 error collector 先 teardown 已还原，这里不覆盖。
      if (wrapper && savedOriginal && console[method] === wrapper) {
        console[method] = savedOriginal;
      }
    }
  },

  // ── 键盘监听 ──────────────────────────────────────────────

  _setupKeypress() {
    this._onKeydown = (event) => {
      const target = event.target;
      if (!target) return;

      // 跳过所有输入型元素（防止泄露用户输入）
      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      ) return;

      // 只捕获导航/操作键，不捕获可打印字符
      const actionKeys = [
        'Enter', 'Escape', 'Backspace', 'Delete',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Home', 'End', 'PageUp', 'PageDown',
      ];
      if (!actionKeys.includes(event.key)) return;

      this.addBreadcrumb('ui.keypress', {
        key: event.key,
        tagName: target.tagName.toLowerCase(),
        id: target.id || undefined,
      });
    };
    document.addEventListener('keydown', this._onKeydown, true);
  },

  _teardownKeypress() {
    document.removeEventListener('keydown', this._onKeydown, true);
  },

  addBreadcrumb(category, data, level = 'info') {
    this.client.getScope().addBreadcrumb({ category, level, data });
  },
};

// BehaviorCollector 不调 client.capture()，它只存面包屑，等错误发生时由 _enrichment 来取。

export default behaviorCollector;
