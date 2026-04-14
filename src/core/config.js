export default {
  // 基础配置
  appKey: '',
  serverUrl: '',
  sampleRate: 1,

  // 错误监控配置
  error: {
    enable: true,
    captureGlobalErrors: true,
    capturePromiseRejections: true,
    captureResourceErrors: true
  },

  // 性能监控配置
  performance: {
    enable: true,
    captureWebVitals: true,
    captureResourceTiming: true,
    captureLongTasks: true,
    captureMemory: true
  },

  // 用户行为监控配置
  behavior: {
    enable: true,
    captureClicks: true,
    captureRouteChanges: true,
    captureNetworkRequests: true,
    captureConsole: false,
    maxBreadcrumbs: 20
  },

  // 高级功能配置
  advanced: {
    enableSessionReplay: false,
    sessionReplaySampleRate: 0.1,
    enableWhiteScreenDetection: false
  },

  // 上报配置
  reporter: {
    batchSize: 5,
    batchInterval: 5000,
    maxQueueSize: 20,
    reportMethod: 'fetch',
    reportPath: '/api/report',
    withCredentials: false,
    retryCount: 3,
    retryDelay: 1000
  },

  // 框架集成配置
  framework: {
    vue: false,
    react: false
  },

  // 调试配置
  debug: false
}