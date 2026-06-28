export default {
  //上报地址
  dsn: '',
  //应用标识，上报后台用于区分不同项目
  appKey: '',
  // 版本号，用于 sourcemap 定位 & 错误归因
  release: '',
  // 环境标识：production / staging / development
  environment: '',
  //全局采样率,这个定义一个可以吗，因为关于数据采样后续我还会进行精细的设计，但是我现在不知道怎么设计，我只希望先写好一个框架，然后往里面慢慢填充内容
  sampleRate: 1,
  //开启后 console 输出内部日志
  debug: false,
  // 错误去重窗口（毫秒）：相同错误在此时间内只上报一次，默认 5 秒
  dedupInterval: 5000,
  //用户钩子，pipeline 最后一步
  /* 
  用户在 SDK 初始化时传的一个函数，pipeline 在"即将发送前"调用它。用户可以在这个函数里：
  - 修改 event 内容（比如脱敏，去掉密码字段）
  - 返回 null 丢弃这个事件（比如"这种错误我不关心"）
   */
  beforeSend: null,
  // 忽略指定错误消息：字符串精确匹配或正则，如 ['Script error', /ResizeObserver/]
  ignoreErrors: [],
  //批量上报数量
  batchSize: 5,
  //批量上报时间限制
  batchInterval: 3000,
  //队列最大长度
  /* 如果短时间内涌入大量事件（比如循环错误），队列撑爆了就会丢弃
  旧事件、保留新事件，防止内存无限增长。 
  */
  maxQueueSize: 50,
  //重试次数
  retryCount: 3,
  //重试基础延迟
  retryDelay: 1000,
  // fetch 请求超时时间（毫秒），超时后走降级链路
  requestTimeout: 10000,
  // 自定义上报字段，fetch 走 header，beacon 走 body，image 走 URL 参数
  reportFields: {},
  custom: {
    enabled: true,
    sampleRate: 1,            // 手动调用默认全采（实际会被 _manual 跳过）
    sampler: null,
  },
  error: {
    enabled: true,
    sampleRate: 1,            // 错误 100% 采集
    sampler: null,
  },
  performance: {
    enabled: true,
    sampleRate: 0.5,// 性能 50% 采集
    sampler: null,
  },
  behavior: {
    enabled: true,
    sampleRate: 0.3,          // 行为 30% 采集
    maxBreadcrumbs: 20,
    captureConsole: true,     // 是否拦截 console.log/warn/error → breadcrumb
    sampler: null,
  },
}