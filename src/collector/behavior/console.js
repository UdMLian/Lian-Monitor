/**
 * Console 拦截（log / warn / error）
 * 将控制台输出写入面包屑，参数经过脱敏处理
 */

/**
 * 劫持 console.log / warn / error
 * 允许用户通过 captureConsole: false 关闭
 * @param {Object} self - behaviorCollector 实例
 */
export function setupConsole(self) {
  // 允许用户通过 captureConsole: false 关闭 console breadcrumb
  const captureConsole = self.client.options.behavior?.captureConsole;
  if (captureConsole === false) return;
  if (!window.console) return;

  const levels = ['log', 'warn', 'error'];

  for (const method of levels) {
    const original = console[method];
    if (typeof original !== 'function') continue;

    // 保存原始引用（console.error 可能已被 error collector 包装过，
    // 这里存的是"当前版本"，teardown 时按条件恢复）
    self['_originalConsole_' + method] = original;

    const wrapper = function (...args) {
      // 先调原始方法，保留控制台输出
      original.apply(console, args);

      try {
        //console.log 的参数可能包含敏感数据，直接原样上报 = 泄露
        const serialized = Array.from(args).map(arg => self._sanitizeArg(arg));

        const breadcrumbLevel = method === 'log' ? 'log' : method === 'warn' ? 'warning' : 'error';
        self.addBreadcrumb('console', {
          level: method,
          args: serialized,
        }, breadcrumbLevel);
      } catch {
        // SDK 内部错误不应从 console.log/warn/error 的调用处向外传播
      }
    };
    self['_consoleWrapper_' + method] = wrapper;
    console[method] = wrapper;
  }
}

/**
 * 恢复原始 console 方法
 * 只在当前 console[method] 仍是自己的 wrapper 时才恢复。
 * 如果 error collector 先 teardown 已还原，这里不覆盖。
 * @param {Object} self - behaviorCollector 实例
 */
export function teardownConsole(self) {
  for (const method of ['log', 'warn', 'error']) {
    const wrapper = self['_consoleWrapper_' + method];
    const savedOriginal = self['_originalConsole_' + method];
    // 只在当前 console[method] 仍是自己的 wrapper 时才恢复。
    // 如果 error collector 先 teardown 已还原，这里不覆盖。
    if (wrapper && savedOriginal && console[method] === wrapper) {
      console[method] = savedOriginal;
    }
  }
}
