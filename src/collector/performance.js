function sanitizeUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return '(invalid-url)';
  }
}

const performanceCollector = {
  name: 'performance',

  teardown() {
    this._resourceObserver?.disconnect();
    this._longTaskObserver?.disconnect();
    if (this._memoryTimer) clearInterval(this._memoryTimer);
  },

  setup(client) {
    this.client = client;

    // 1. 资源加载耗时
    if (window.PerformanceObserver) {
      this._resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this._capture('resource', {
            name: sanitizeUrl(entry.name),
            duration: entry.duration,
            initiatorType: entry.initiatorType,
            transferSize: entry.transferSize,
          });
        }
      });
      this._resourceObserver.observe({ type: 'resource', buffered: true });
    }

    // 2. 长任务（独立判断：浏览器是否支持 longtask）
    const supportedTypes = PerformanceObserver?.supportedEntryTypes || [];
    if (supportedTypes.includes('longtask')) {
      this._longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this._capture('long-task', {
            duration: entry.duration,
            startTime: entry.startTime,
          });
        }
      });
      this._longTaskObserver.observe({ type: 'longtask', buffered: true });
    }

    // 3. 内存（Chrome 专有）
    if (window.performance?.memory) {
      this._capture('memory', {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      });

      this._memoryTimer = setInterval(() => {
        this._capture('memory', {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        });
      }, 30000);
    }

    // 4. Web Vitals（懒加载）
    this._setupWebVitals();
  },

  async _setupWebVitals() {
    try {
      const { onLCP, onFCP, onCLS, onTTFB, onINP } = await import('web-vitals');

      const handler = (metric) => {
        this._capture('web-vital', {
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
        });
      };

      onLCP(handler);
      onFCP(handler);
      onCLS(handler);
      onTTFB(handler);
      onINP(handler);
    } catch (e) {
      // web-vitals 加载失败，跳过
    }
  },

  _capture(subType, data) {
    this.client.capture({
      type: 'performance',
      subType: subType,
      timestamp: Date.now(),
      data: data,
    });
  },
};            