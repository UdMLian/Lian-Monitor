/**
 * 点击事件监听
 * 捕获用户点击目标元素的 tagName、选择器、序列化 HTML 等信息写入面包屑
 */

/**
 * 注册点击监听（捕获阶段）
 * @param {Object} self - behaviorCollector 实例
 */
export function setupClick(self) {
  self._onClick = (event) => {
    const target = event.target;
    if (!target || target === document.body) return;

    self.addBreadcrumb('ui.click', {
      tagName: target.tagName.toLowerCase(),
      selector: self._getSelector(target),
      html: self._serializeElement(target),
      id: target.id || undefined,
      className: target.className || undefined,
    });
  };
  document.addEventListener('click', self._onClick, true);
}

/**
 * 移除点击监听
 * @param {Object} self - behaviorCollector 实例
 */
export function teardownClick(self) {
  document.removeEventListener('click', self._onClick, true);
}
