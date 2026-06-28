// Mock 浏览器 API（JSDOM 不包含的）

// PerformanceObserver
if (typeof PerformanceObserver === 'undefined') {
  global.PerformanceObserver = class PerformanceObserver {
    constructor() {}
    observe() {}
    disconnect() {}
  };
  PerformanceObserver.supportedEntryTypes = [];
}

// performance extensions
if (!global.performance) {
  global.performance = {};
}
global.performance.memory = undefined;
global.performance.setResourceTimingBufferSize = () => {};
global.performance.clearResourceTimings = () => {};
global.performance.addEventListener = () => {};

// crypto.randomUUID
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

// navigator.sendBeacon
if (typeof navigator.sendBeacon === 'undefined') {
  navigator.sendBeacon = () => true;
}
