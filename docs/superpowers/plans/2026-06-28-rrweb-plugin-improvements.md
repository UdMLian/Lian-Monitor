# rrweb Plugin 完善计划

> **Goal:** 将 rrweb 插件从 60 行原型提升为生产级 SessionReplay 方案。

**Architecture:** 保持现有 plugin 模式，通过 `client.options.rrweb` 接收用户配置，内部补全合理默认值。

---

## 阶段一：配置化（P0 —— 必须做）

### Task 1: 支持用户通过 options.rrweb 覆盖所有配置

**Files:**
- Modify: `src/plugins/rrweb.js`
- Modify: `src/core/config.js`

**当前硬编码值：**

```js
this._maxEvents = 80
sampling: { mousemove: false, scroll: 150 }
maskAllInputs: true
maskTextClass: 'rr-mask'
blockClass: 'rr-block'
maskInputOptions: { password: true }
```

**改为从 `client.options.rrweb` 读取，和默认值合并：**

config.js 加默认值：
```js
rrweb: {
    enabled: true,
    maxEvents: 80,
    checkoutEveryNms: 60000,   // 每 60 秒生成一次全量快照
    checkoutEveryNth: 500,     // 或每 500 帧生成一次
    sampling: {
        mousemove: false,
        scroll: 150,
    },
    maskAllInputs: true,
    maskTextClass: 'rr-mask',
    blockClass: 'rr-block',
    maskInputOptions: {
        password: true,
    },
    recordCanvas: false,       // Canvas 录制（数据量大，默认关闭）
    recordCrossOriginIframes: false,
    inlineStylesheet: true,
    packFn: null,              // 用户自定义压缩函数
    beforeEmit: null,          // (event) => event | null，返回 null 丢弃该帧
},
```

rrweb.js 中读取：
```js
const cfg = client.options.rrweb || {};
this._maxEvents = cfg.maxEvents ?? 80;
this._checkoutEveryNms = cfg.checkoutEveryNms;
this._beforeEmit = cfg.beforeEmit;
// ...
```

---

### Task 2: 录制区间可配置（不只挂在 error 上）

**Files:**
- Modify: `src/plugins/rrweb.js`

**当前：** middleware 只对 `event.type === 'error'` 附加 rrweb 数据。

**改为：** 用户可通过 `options.rrweb.attachTo` 指定事件类型数组。

```js
// config.js 默认值
attachTo: ['error'],

// rrweb.js middleware
this._middleware = (event) => {
    const attachTo = cfg.attachTo || ['error'];
    if (attachTo.includes(event.type) && this._events.length > 0) {
        event.rrweb = this._events.slice();
    }
    return event;
};
```

这样用户可以配 `attachTo: ['error', 'session', 'custom']` 把所有事件都带上录屏。

---

## 阶段二：可靠性（P1 —— 回放质量）

### Task 3: 添加 checkout 全量快照

**Files:**
- Modify: `src/plugins/rrweb.js`

**问题：** rrweb 默认只录 DOM 增量。如果没有全量快照，回放时必须从第一个事件开始才能正确渲染。

**修复：** 传入 `checkoutEveryNms` 和 `checkoutEveryNth`，定期生成完整 DOM 快照。

```js
this._stopFn = record({
    emit: (event) => {
        if (this._beforeEmit) {
            const filtered = this._beforeEmit(event);
            if (!filtered) return;
            event = filtered;
        }
        this._events.push(event);
        if (this._events.length > this._maxEvents) {
            this._events.shift();
        }
    },
    checkoutEveryNms: cfg.checkoutEveryNms,
    checkoutEveryNth: cfg.checkoutEveryNth,
    // ... 其他配置
});
```

---

### Task 4: 压缩支持（packFn）

**Files:**
- Modify: `src/plugins/rrweb.js`

rrweb 的 `record()` 支持 `packFn`，在 emit 之前压缩事件。用户可传自定义压缩函数，或使用默认的 base64 编码。

```js
this._packFn = cfg.packFn || null;

// 在 record() 配置中传入
record({
    emit: (event) => { ... },
    packFn: this._packFn,
});
```

用户侧用法：
```js
import { pack } from '@rrweb/packer';  // rrweb 官方 packer
init({
    dsn: '...',
    rrweb: { packFn: pack },
});
```

---

## 阶段三：控制力（P2 —— 用户体验）

### Task 5: 用户手动启停 + 最大录制时长

**Files:**
- Modify: `src/plugins/rrweb.js`
- Modify: `src/client/index.js`（暴露方法）

**1. 手动启停：**

rrweb 插件暴露 `startRecording()` / `stopRecording()`：

```js
// rrweb.js
startRecording() {
    if (this._stopFn) return;  // 已经启动
    this._active = true;
    this._startRecording();
},

stopRecording() {
    if (this._stopFn) {
        this._stopFn();
        this._stopFn = null;
    }
},
```

**2. 最大录制时长：**

```js
// config.js
maxDuration: 300000,  // 5 分钟后自动停止，防止长 SPA 无限录制

// rrweb.js setup 中
if (cfg.maxDuration > 0) {
    this._maxDurationTimer = setTimeout(() => {
        this.stopRecording();
    }, cfg.maxDuration);
}
```

---

### Task 6: beforeEmit 钩子

**Files:**
- Modify: `src/plugins/rrweb.js`

用户可以在帧进入缓冲区之前过滤/修改：

```js
// emit 回调中
emit: (event) => {
    if (this._beforeEmit) {
        try {
            event = this._beforeEmit(event);
        } catch {
            return;  // 钩子出错丢弃该帧
        }
        if (!event) return;
    }
    this._events.push(event);
    // ...
},
```

---

## Task 依赖

```
Task 1 (配置化) ──┬── Task 2 (attachTo)
                 ├── Task 3 (checkout)
                 └── Task 4 (packFn)
Task 1 完成后，Task 2/3/4 可并行

Task 5 (启停+时长) ← 依赖 Task 1
Task 6 (beforeEmit) ← 依赖 Task 1
```

---

## 验证

- `npm run build` 构建通过
- `npm test` 40 个测试通过
- `npm run dev:example` 示例页中 rrweb 录制正常
- 用户可传 `options.rrweb` 覆盖所有默认值
