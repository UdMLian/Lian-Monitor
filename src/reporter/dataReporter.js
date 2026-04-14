import eventBus from '../core/eventBus';

class DataReporter {
  constructor(config) {
    this.config = config;
    this.queue = [];
    this.timer = null;
    this.retryCount = {};
  }

  init() {
    eventBus.on('error:captured', this.reportError.bind(this));
    eventBus.on('performance:web-vital', this.reportPerformance.bind(this));
    eventBus.on('performance:resource', this.reportPerformance.bind(this));
    eventBus.on('performance:long-task', this.reportPerformance.bind(this));
    eventBus.on('performance:memory', this.reportPerformance.bind(this));
    eventBus.on('behavior:breadcrumb', this.reportBehavior.bind(this));

    eventBus.emit('reporter:initialized');
  }

  addToQueue(data) {
    if (!data || !this.config.serverUrl) return;

    this.queue.push(data);

    // 如果队列超过最大限制，立即上报
    if (this.queue.length >= this.config.reporter.maxQueueSize) {
      this.flushQueue();
      return;
    }

    // 如果队列达到批量大小，立即上报
    if (this.queue.length >= this.config.reporter.batchSize) {
      this.flushQueue();
      return;
    }

    // 设置定时上报
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.timer) return;

    this.timer = setTimeout(() => {
      this.flushQueue();
    }, this.config.reporter.batchInterval);
  }

  flushQueue() {
    if (this.queue.length === 0) return;

    const batchData = [...this.queue];
    this.queue = [];

    // 清除定时器
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.report(batchData);
  }

  reportError(errorData) {
    const data = {
      type: 'error',
      subType: errorData.type,
      timestamp: Date.now(),
      ...errorData,
      breadcrumbs: eventBus.emit('behavior:getBreadcrumbs') || []
    };

    this.addToQueue(data);
  }

  reportPerformance(performanceData) {
    const data = {
      type: 'performance',
      subType: performanceData.type,
      timestamp: Date.now(),
      ...performanceData
    };

    this.addToQueue(data);
  }

  reportBehavior(behaviorData) {
    // 行为数据通常作为面包屑随错误一起上报，但也可以单独上报
    if (this.config.behavior.enable) {
      const data = {
        type: 'behavior',
        subType: behaviorData.type,
        timestamp: Date.now(),
        ...behaviorData
      };

      this.addToQueue(data);
    }
  }

  report(data) {
    if (!data || !this.config.serverUrl) return;

    const reportData = {
      appKey: this.config.appKey,
      sessionId: eventBus.emit('core:getSessionId') || '',
      userId: eventBus.emit('core:getUserId') || '',
      userData: eventBus.emit('core:getUserData') || {},
      data,
      timestamp: Date.now(),
      environment: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        url: window.location.href,
        referrer: document.referrer,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    const serializedData = JSON.stringify(reportData);

    // 根据配置选择上报方式
    switch (this.config.reporter.reportMethod) {
      case 'beacon':
        this.reportBeacon(serializedData);
        break;
      case 'image':
        this.reportImage(serializedData);
        break;
      case 'fetch':
      default:
        this.reportFetch(serializedData);
        break;
    }
  }

  reportFetch(data) {
    if (!window.fetch) {
      return this.reportImage(data);
    }

    const requestConfig = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SDK-Internal': 'true'
      },
      body: data,
      _monitorInternal: true
    };

    if (this.config.reporter?.withCredentials) {
      requestConfig.credentials = 'include';
    }

    fetch(this.getReportUrl(), requestConfig).catch((error) => {
      this.handleReportError(data, error);
    });
  }

  reportBeacon(data) {
    if (!window.navigator.sendBeacon) {
      return this.reportFetch(data);
    }

    const blob = new Blob([data], { type: 'application/json' });
    const success = window.navigator.sendBeacon(this.getReportUrl(), blob);
    if (!success) {
      this.reportFetch(data);
    }
  }

  reportImage(data) {
    try {
      const img = new Image();
      const encodedData = encodeURIComponent(data);
      const connector = this.getReportUrl().includes('?') ? '&' : '?';
      const url = `${this.getReportUrl()}${connector}data=${encodedData}`;

      img.src = url;
      img.onload = () => {
        // 清理图片元素
        img.onload = null;
        img.onerror = null;
      };
      img.onerror = () => {
        this.handleReportError(data, new Error('Image beacon failed'));
        img.onload = null;
        img.onerror = null;
      };
    } catch (error) {
      this.handleReportError(data, error);
    }
  }

  getReportUrl() {
    const base = String(this.config.serverUrl || '').trim();
    if (!base) return '';

    // serverUrl 已经是完整上报地址时，直接使用，避免重复拼接
    if (/\/report\/?$/i.test(base)) {
      return base.replace(/\/+$/, '');
    }

    const reportPath = this.config.reporter?.reportPath || '/api/report';
    const normalizedBase = base.replace(/\/+$/, '');
    const normalizedPath = String(reportPath).startsWith('/') ? reportPath : `/${reportPath}`;

    return `${normalizedBase}${normalizedPath}`;
  }

  handleReportError(data, error) {
    const dataKey = JSON.stringify(data);
    const count = this.retryCount[dataKey] || 0;

    if (count < this.config.reporter.retryCount) {
      // 重试上报
      this.retryCount[dataKey] = count + 1;

      setTimeout(() => {
        this.report(data);
      }, this.config.reporter.retryDelay * Math.pow(2, count)); // 指数退避
    } else {
      // 超过重试次数，放弃上报
      delete this.retryCount[dataKey];
      eventBus.emit('reporter:report:failed', { data, error });
    }
  }

  flush() {
    this.flushQueue();
  }

  destroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // 上报剩余数据
    this.flushQueue();

    eventBus.off('error:captured', this.reportError.bind(this));
    eventBus.off('performance:web-vital', this.reportPerformance.bind(this));
    eventBus.off('performance:resource', this.reportPerformance.bind(this));
    eventBus.off('performance:long-task', this.reportPerformance.bind(this));
    eventBus.off('performance:memory', this.reportPerformance.bind(this));
    eventBus.off('behavior:breadcrumb', this.reportBehavior.bind(this));

    eventBus.emit('reporter:destroyed');
  }
}

export default DataReporter;