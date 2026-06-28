/**
 * 网络请求劫持（XHR + Fetch）
 * 捕获请求的 method、url、status、duration 写入面包屑
 */

/**
 * 劫持 XMLHttpRequest.prototype.open 和 send
 * @param {Object} self - behaviorCollector 实例
 */
export function setupXHR(self) {
  if (!window.XMLHttpRequest) return;

  self._originalXHROpen = XMLHttpRequest.prototype.open;
  self._originalXHRSend = XMLHttpRequest.prototype.send;

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
        url: self._sanitizeUrl(monitor.url),
        status: this.status,
        duration: Date.now() - monitor.startTime,
      });
    };
    this.addEventListener('loadend', monitor._loadendHandler);
    return self._originalXHRSend.apply(this, [body, ...rest]);
  };
}

/**
 * 恢复原始 XMLHttpRequest.prototype
 * @param {Object} self - behaviorCollector 实例
 */
export function teardownXHR(self) {
  if (window.XMLHttpRequest && self._originalXHROpen) {
    XMLHttpRequest.prototype.open = self._originalXHROpen;
    XMLHttpRequest.prototype.send = self._originalXHRSend;
  }
}

/**
 * 劫持 window.fetch
 * @param {Object} self - behaviorCollector 实例
 */
export function setupFetch(self) {
  if (!window.fetch) return;

  self._originalFetch = window.fetch;

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input.url || input);
    if (self._isOwnReportUrl(url)) {
      return self._originalFetch.call(window, input, init);
    }

    const startTime = Date.now();
    const method = (init.method || 'GET').toUpperCase();

    try {
      const response = await self._originalFetch.call(window, input, init);
      self.addBreadcrumb('http.fetch', {
        method,
        url: self._sanitizeUrl(String(url)),
        status: response.status,
        duration: Date.now() - startTime,
      });
      return response;
    } catch (err) {
      self.addBreadcrumb('http.fetch', {
        method,
        url: self._sanitizeUrl(String(url)),
        error: true,
        duration: Date.now() - startTime,
      });
      throw err;
    }
  };
}

/**
 * 恢复原始 window.fetch
 * @param {Object} self - behaviorCollector 实例
 */
export function teardownFetch(self) {
  if (self._originalFetch) {
    window.fetch = self._originalFetch;
  }
}
