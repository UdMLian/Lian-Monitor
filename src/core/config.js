export default {
  //上报地址
  dsn: '',
  //应用标识，上报后台用于区分不同项目     
  appKey: '',
  //全局采样率,这个定义一个可以吗，因为关于数据采样后续我还会进行精细的设计，但是我现在不知道怎么设计，我只希望先写好一个框架，然后往里面慢慢填充内容
  sampleRate: 1,
  //开启后 console 输出内部日志
  debug: false,
  //用户钩子，pipeline 最后一步
  /* 
  用户在 SDK 初始化时传的一个函数，pipeline 在"即将发送前"调用它。用户可以在这个函数里：
  - 修改 event 内容（比如脱敏，去掉密码字段）
  - 返回 null 丢弃这个事件（比如"这种错误我不关心"）
   */
  beforeSend: null,
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
  //上报方式
  reportMethod: 'fetch',
  error: {
    enabled: true,

  },
  performance: {
    enabled: true,

  },
  behavior: {
    enabled: true,
    maxBreadcrumbs: 20,
  },
}