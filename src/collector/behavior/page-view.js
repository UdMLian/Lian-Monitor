/**
 * 页面进入/离开监听
 * 记录页面停留时长和来源信息
 */

/**
 * 注册页面进入/离开事件
 * @param {Object} self - behaviorCollector 实例
 */
export function setupPageView(self) {
  self._pageEntryTime = Date.now()
  self.addBreadcrumb('navigation.page-enter', {
    url: location.href,
    referrer: document.referrer || undefined
  })

  // 页面离开时记录停留时长。用 pagehide 而非 beforeunload：
  // beforeunload 在移动端不可靠，pagehide 总是触发
  self._onPageHide = () => {
    self.addBreadcrumb('navigation.page-leave', {
      url: location.href,
      duration: Date.now() - self._pageEntryTime,
    });
  };

  window.addEventListener('pagehide', self._onPageHide);
}

/**
 * 移除页面离开监听
 * @param {Object} self - behaviorCollector 实例
 */
export function teardownPageView(self) {
  window.removeEventListener('pagehide', self._onPageHide);
}
