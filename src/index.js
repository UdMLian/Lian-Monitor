import MonitorCore from './core';
import ErrorCollector from './collector/errorCollector';
import PerformanceCollector from './collector/performanceCollector';
import BehaviorCollector from './collector/behaviorCollector';
import DataReporter from './reporter/dataReporter';
import eventBus from './core/eventBus';

class YuanMonitor {
  constructor(options = {}) {
    // 初始化核心配置
    this.core = new MonitorCore(options);
    this.config = this.core.config;

    // 初始化各个模块
    this.errorCollector = new ErrorCollector(this.config);
    this.performanceCollector = new PerformanceCollector(this.config);
    this.behaviorCollector = new BehaviorCollector(this.config);
    this.dataReporter = new DataReporter(this.config);

    // 框架/高级功能模块按需加载，避免强依赖 React/Vue 等
    this.vueIntegration = null;
    this.reactIntegration = null;
    this.sessionReplay = null;

    // 设置事件总线监听器
    this.setupEventListeners();
  }

  setupEventListeners() {
    // 核心初始化完成后，初始化其他模块
    eventBus.on('core:initialized', () => {
      this.errorCollector.init();
      this.performanceCollector.init();
      this.behaviorCollector.init();
      this.dataReporter.init();

      // 按配置启用可选模块
      const framework = this.config.framework || {};
      if (framework.vue) this._ensureVueIntegration().then((m) => m?.init?.());
      if (framework.react) this._ensureReactIntegration().then((m) => m?.init?.());
      if (this.config.advanced?.enableSessionReplay) this._ensureSessionReplay().then((m) => m?.init?.());

      // 初始化完成后暴露React ErrorBoundary组件
      this.ErrorBoundary = this.reactIntegration?.getErrorBoundary?.() || null;
    });

    // 提供获取面包屑的接口
    eventBus.on('behavior:getBreadcrumbs', () => {
      return this.behaviorCollector.getBreadcrumbs();
    });

    // 提供获取会话ID的接口
    eventBus.on('core:getSessionId', (callback) => {
      if (typeof callback === 'function') {
        callback(this.core.getSessionId());
      }
      return this.core.getSessionId();
    });

    // 响应会话ID请求
    eventBus.on('core:requestSessionId', () => {
      eventBus.emit('core:getSessionId', this.core.getSessionId());
    });

    // 提供获取用户ID的接口
    eventBus.on('core:getUserId', (callback) => {
      if (typeof callback === 'function') {
        callback(this.core.userId);
      }
      return this.core.userId;
    });

    // 响应用户ID请求
    eventBus.on('core:requestUserId', () => {
      eventBus.emit('core:getUserId', this.core.userId);
    });

    // 提供获取用户数据的接口
    eventBus.on('core:getUserData', () => {
      return this.core.userData;
    });
  }

  // 初始化SDK
  init() {
    this.core.init();
    return this;
  }

  // 设置配置
  setConfig(options) {
    this.core.setConfig(options);
    this.config = this.core.config;

    // 更新各个模块的配置
    this.errorCollector.config = this.config;
    this.performanceCollector.config = this.config;
    this.behaviorCollector.config = this.config;
    this.dataReporter.config = this.config;
    this.vueIntegration.config = this.config;
    this.reactIntegration.config = this.config;
    this.sessionReplay.config = this.config;

    return this;
  }

  // 设置用户ID
  setUserId(userId) {
    this.core.setUserId(userId);
    return this;
  }

  // 设置用户数据
  setUserData(data) {
    this.core.setUserData(data);
    return this;
  }

  // 获取配置
  getConfig() {
    return this.core.getConfig();
  }

  // 获取会话ID
  getSessionId() {
    return this.core.getSessionId();
  }

  // 获取用户行为面包屑
  getBreadcrumbs() {
    return this.behaviorCollector.getBreadcrumbs();
  }

  // 手动上报错误
  reportError(error, context = {}) {
    const errorData = {
      type: 'manual',
      message: error?.message || String(error),
      stack: error?.stack,
      error,
      context
    };

    eventBus.emit('error:captured', errorData);
    return this;
  }

  // 手动上报性能数据
  reportPerformance(data) {
    eventBus.emit('performance:custom', data);
    return this;
  }

  // 手动添加用户行为面包屑
  addBreadcrumb(type, data) {
    this.behaviorCollector.addBreadcrumb(type, data);
    return this;
  }

  // 清空用户行为面包屑
  clearBreadcrumbs() {
    this.behaviorCollector.clearBreadcrumbs();
    return this;
  }

  // 立即上报队列中的数据
  flush() {
    this.dataReporter.flush();
    return this;
  }

  // 销毁SDK
  destroy() {
    this.errorCollector.destroy();
    this.performanceCollector.destroy();
    this.behaviorCollector.destroy();
    this.dataReporter.destroy();
    this.sessionReplay?.destroy?.();
    this.core.destroy();

    eventBus.clear();
    return this;
  }

  // Vue插件安装方法
  useVue(Vue) {
    if (this.vueIntegration) {
      this.vueIntegration.install?.(Vue);
    } else {
      this._ensureVueIntegration().then((m) => m?.install?.(Vue));
    }
    return this;
  }

  // React包装应用组件
  wrapReactApp(AppComponent) {
    return this.reactIntegration?.wrapApp?.(AppComponent) || AppComponent;
  }

  async _ensureVueIntegration() {
    if (this.vueIntegration) return this.vueIntegration;
    try {
      const { default: VueIntegration } = await import('./framework/vueIntegration.js');
      this.vueIntegration = new VueIntegration(this.config);
      return this.vueIntegration;
    } catch (e) {
      console.warn('Vue integration not available:', e);
      return null;
    }
  }

  async _ensureReactIntegration() {
    if (this.reactIntegration) return this.reactIntegration;
    try {
      const { default: ReactIntegration } = await import('./framework/reactIntegration.js');
      this.reactIntegration = new ReactIntegration(this.config);
      return this.reactIntegration;
    } catch (e) {
      console.warn('React integration not available:', e);
      return null;
    }
  }

  async _ensureSessionReplay() {
    if (this.sessionReplay) return this.sessionReplay;
    try {
      const { default: SessionReplay } = await import('./advanced/sessionReplay.js');
      this.sessionReplay = new SessionReplay(this.config);
      return this.sessionReplay;
    } catch (e) {
      console.warn('SessionReplay not available:', e);
      return null;
    }
  }
}

// 导出单例
let instance = null;

const init = (options = {}) => {
  if (!instance) {
    instance = new YuanMonitor(options);
    instance.init();
  } else if (Object.keys(options).length > 0) {
    instance.setConfig(options);
  }
  return instance;
};

// 导出SDK
export {
  YuanMonitor,
  init,
  // React ErrorBoundary组件将通过init函数返回的实例获取
};

export default {
  YuanMonitor,
  init
};