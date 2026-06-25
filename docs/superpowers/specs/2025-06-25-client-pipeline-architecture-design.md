# Client + Pipeline 架构设计

> 日期：2025-06-25
> 状态：已确认
> 概述：将 Lian-Monitor 从 EventBus 事件总线架构迁移到 Client + Pipeline 模式

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                       MonitorClient                          │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Error    │  │ Performance  │  │ Behavior             │   │
│  │ Collector│  │ Collector    │  │ Collector            │   │
│  └────┬─────┘  └──────┬───────┘  └──────────┬───────────┘   │
│       │               │                     │               │
│       │        capture(event)                │               │
│       ▼               ▼                     ▼               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  Pipeline                             │    │
│  │                                                       │    │
│  │   Filter ──→ Sampling ──→ Enrichment ──→ beforeSend  │    │
│  │                                                       │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  Transport                            │    │
│  │                                                       │    │
│  │   内部队列 → 攒批 → fetch/beacon/image → 重试/降级   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────┐                    │
│  │  Plugins                             │                    │
│  │  SessionReplay / Vue / React / ...   │                    │
│  └──────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### 核心规则

- **Collector** 负责采集原始数据，产出统一结构的 Event，通过 `client.capture(event)` 投喂给 Pipeline
- **Pipeline** 是一组顺序执行的中间件，每个中间件接收 Event、返回 Event（或 null 丢弃）
- **Transport** 是 Pipeline 终点，内部负责攒批、发送、重试、降级
- **Plugin** 不产 Event，通过 `client.use(plugin)` 注册，增强/包装能力

---

## 二、MonitorClient 设计

```js
class MonitorClient {
  constructor(options) {
    this.options = options;       // dsn, sampleRate, maxBreadcrumbs, ...
    this.pipeline = [];           // 中间件数组
    this.collectors = new Map();  // name → collector
    this.transport = null;        // Transport 实例
    this.plugins = [];            // Plugin 实例
    this.state = 'idle';          // idle | initializing | running | destroyed
  }

  // 注册中间件 / 插件（按添加顺序执行）
  use(fnOrPlugin) { ... }

  // 注册采集器
  addCollector(name, collector) { ... }

  // 采集器调用此方法提交事件 → 进入 pipeline
  capture(event) { ... }

  // 启动
  start() { ... }

  // 销毁
  destroy() { ... }
}
```

### 关键设计点

- `client.use(fn)` — 同一个方法注册中间件和 plugin（根据传入的是函数还是对象自动判断）
- `client.capture(event)` — 采集器的唯一入口，内部调 `_runPipeline`
- 状态机 `idle → initializing → running → destroyed`，非 running 状态调用 capture 直接丢弃
- 所有方法返回 `this`，支持链式调用

### Event 统一结构

```js
{
  type: 'error' | 'performance' | 'behavior',   // 大类
  subType: 'js' | 'promise' | 'resource' | ...,  // 子类型
  timestamp: 1719123456789,
  data: { /* 采集器产出的原始数据 */ }
}
```

---

## 三、Collector 接口

### 统一契约

```js
const errorCollector = {
  name: 'error',

  // Client 初始化时调用，传入 client 引用
  setup(client) {
    this.client = client;
    window.addEventListener('error', this._onError);
  },

  // 采集到原始数据后，调用 client.capture()
  _onError(rawError) {
    this.client.capture({
      type: 'error',
      subType: 'js',
      timestamp: Date.now(),
      data: { /* 结构化原始数据 */ }
    });
  },

  // 销毁时清理
  teardown() {
    window.removeEventListener('error', this._onError);
  },
};
```

### 三个 Collector 职责

| Collector | 监听源 | 产出 event.type | 产出 event.subType |
|---|---|---|---|
| ErrorCollector | window.onerror, unhandledrejection, 资源错误 | `error` | `js` / `promise` / `resource` / `manual` |
| PerformanceCollector | PerformanceObserver, web-vitals, memory | `performance` | `web-vital` / `resource` / `long-task` / `memory` / `custom` |
| BehaviorCollector | click, history, XHR, fetch, console | `behavior` | `click` / `route` / `xhr` / `fetch` / `console` |

### 核心约束

- Collector **只做采集和结构化**，不做任何处理决策（过滤、采样都不管）
- 原始数据统一放在 `event.data` 里，后续 pipeline 中间件负责解读
- `teardown()` 必须彻底清理——移除事件监听、恢复被劫持的原生 API、断开 Observer

---

## 四、Pipeline 各阶段职责

```
capture(event)
    │
    ▼
[Filter] ─────── 判断事件是否应该被处理
                 - 白名单/黑名单（按 type、subType、url 过滤）
                 - 去重（同一错误短时间重复出现）
                 - 返回 null → 丢弃，不继续往下走
    │
    ▼
[Sampling] ──── 按 sampleRate 随机丢弃
                 - 不同事件类型可有不同采样率
                 - 如 error 100%、performance 50%、behavior 10%
    │
    ▼
[Enrichment] ── 附加上下文
                 - 通用：sessionId、userId、userData、pageUrl、userAgent
                 - error 专属：breadcrumbs、replayId
                 - performance 专属：networkType、deviceMemory
    │
    ▼
[beforeSend] ─── 用户自定义钩子（可选）
                 - client 初始化时通过 options.beforeSend 配置
                 - 返回 null → 丢弃该事件
                 - 可以修改 event 内容
    │
    ▼
Transport.send(event)
```

### Pipeline 内部实现

```js
_runPipeline(event) {
  let current = event;
  for (const fn of this.pipeline) {
    try {
      current = fn(current);
    } catch (e) {
      // 中间件抛错 → 丢弃当前事件，不阻塞 pipeline
      this._reportInternalError(e);
      return;
    }
    if (!current) return;  // null = 丢弃
  }
  this.transport.send(current);
}
```

### 关键规则

- 中间件执行顺序严格按照 `client.use()` 注册顺序
- 某个中间件返回 `null` → 事件丢弃，不通知采集器（fire-and-forget）
- 中间件抛错 → 丢弃当前事件 + 记录内部错误，不阻塞后续事件
- 不存在 `event.preventDefault()` 或 `event.stopPropagation()` 这类概念

---

## 五、Transport 设计

```js
class Transport {
  constructor(options) {
    this.url = options.dsn;           // 上报地址
    this.batchSize = 5;               // 一批多少个
    this.batchInterval = 3000;        // 最多等多久(ms)
    this.maxQueueSize = 50;           // 队列上限，超过就丢弃旧的
    this.retryCount = 3;              // 失败重试次数
    this.retryDelay = 1000;           // 重试基础延迟
  }

  // Pipeline 终点，外部只调这个方法
  send(event) { ... }

  // 批量发送
  _flush() { ... }

  // 发送策略：优先 fetch，降级 beacon，最后 image
  _deliver(batch) { ... }

  // 失败重试（指数退避）
  _retry(batch, attempt) { ... }

  destroy() {
    this._flush();  // 销毁前清空队列
  }
}
```

### 发送降级链

```
fetch POST → sendBeacon → Image beacon
```

### 重试策略

指数退避：1s → 2s → 4s，最多 3 次，全失败就丢弃并触发 `onReportFailed` 回调。

### 关键点

- Transport 对外只暴露 `send(event)` 一个方法，内部队列完全透明
- 不区分事件类型，统一序列化为 JSON 上报
- 携带 SDK 内部标记（`X-SDK-Internal` header），避免被自己的网络监控捕获

---

## 六、Plugin 接口

```js
// Plugin 不产 Event，增强/包装能力
const vuePlugin = {
  name: 'vue',

  // Client 初始化完成后调用
  setup(client) {
    this.client = client;
    // 安装 Vue 错误处理器
  },

  // 可选：在 capture 之前拦截
  // 返回 null 阻止某些事件进入 pipeline

  teardown() {
    // 卸载 Vue 错误处理器
  }
};
```

### Plugin vs Collector 区分标准

| | Collector | Plugin |
|---|---|---|
| **干什么** | 采集数据，调用 `client.capture(event)` | 增强能力，访问 client 但不产事件 |
| **例子** | ErrorCollector、PerformanceCollector、BehaviorCollector | SessionReplay、Vue/React 集成 |
| **注册方式** | `client.addCollector(name, collector)` | `client.use(plugin)` |

---

## 七、文件结构建议

```
src/
├── index.js              # 入口，export MonitorClient
├── client/
│   ├── index.js          # MonitorClient 类
│   ├── pipeline.js       # Pipeline 中间件（filter、sampling、enrichment）
│   └── transport.js      # Transport 类
├── collector/
│   ├── error.js          # ErrorCollector
│   ├── performance.js    # PerformanceCollector
│   └── behavior.js       # BehaviorCollector
├── plugin/
│   ├── session-replay.js # SessionReplay plugin
│   ├── vue.js            # Vue plugin
│   └── react.js          # React plugin
└── core/
    ├── config.js         # 默认配置
    └── utils.js          # 工具函数
```

---

## 八、与旧架构对比

| 维度 | EventBus（旧） | Client + Pipeline（新） |
|---|---|---|
| 数据流 | 事件广播，多对多 | 单向管道，端到端可追踪 |
| 执行顺序 | 不保证 | 严格按注册顺序 |
| 丢弃事件 | 需订阅者各自判断 | 管道中提前返回 null，不浪费后续开销 |
| 扩展 | 注册新 listener | `client.use(fn)` 插入中间件 |
| 调试 | 打点分散在各处 | 管道入口/出口各一个断点即可 |
| 模块分类 | 采集器和功能模块混在一起 | Collector / Plugin / Pipeline 清晰分层 |
