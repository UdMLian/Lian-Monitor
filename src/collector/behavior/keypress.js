/**
 * 键盘事件监听
 * 只捕获导航/操作键（Enter、Escape、方向键等），跳过输入型元素防止泄露用户输入
 */

/**
 * 注册键盘监听（捕获阶段）
 * @param {Object} self - behaviorCollector 实例
 */
export function setupKeypress(self) {
  self._onKeydown = (event) => {
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

    self.addBreadcrumb('ui.keypress', {
      key: event.key,
      tagName: target.tagName.toLowerCase(),
      selector: self._getSelector(target),
      html: self._serializeElement(target),
      id: target.id || undefined,
    });
  };
  document.addEventListener('keydown', self._onKeydown, true);
}

/**
 * 移除键盘监听
 * @param {Object} self - behaviorCollector 实例
 */
export function teardownKeypress(self) {
  document.removeEventListener('keydown', self._onKeydown, true);
}
