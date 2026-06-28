/**
 * 路由变化监听（history.pushState / replaceState / popstate / hashchange）
 * 捕获 SPA 页面跳转并写入面包屑
 */

/**
 * 劫持 history API 并注册 popstate/hashchange 监听
 * @param {Object} self - behaviorCollector 实例
 */
export function setupRoute(self) {
  self._lastHref = location.href;

  // pushState / replaceState 劫持
  self._originalPushState = history.pushState;
  self._originalReplaceState = history.replaceState;

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
  self._onPopState = () => {
    const to = location.href;
    self.addBreadcrumb('navigation.route', { from: self._lastHref, to, method: 'popstate' });
    self._lastHref = to;
  };

  self._onHashChange = () => {
    const to = location.href;
    self.addBreadcrumb('navigation.route', { from: self._lastHref, to, method: 'hashchange' });
    self._lastHref = to;
  };

  window.addEventListener('popstate', self._onPopState);
  window.addEventListener('hashchange', self._onHashChange);
}

/**
 * 恢复原始 history API 并移除监听
 * @param {Object} self - behaviorCollector 实例
 */
export function teardownRoute(self) {
  window.removeEventListener('popstate', self._onPopState);
  window.removeEventListener('hashchange', self._onHashChange);
  history.pushState = self._originalPushState;
  history.replaceState = self._originalReplaceState;
}
