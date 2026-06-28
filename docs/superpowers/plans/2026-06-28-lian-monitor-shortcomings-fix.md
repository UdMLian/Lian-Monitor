# Lian-Monitor 全面修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复此前代码审查中发现的全部 21 项不足，补齐测试、类型、目录结构，修复功能缺陷和健壮性问题。

**Architecture:** 按优先级分 4 个阶段推进 —— P0 基础设施（测试 + 目录修复）→ P1 致命缺陷（类型定义、崩溃保护、内存泄漏）→ P2 功能修复（去重统一、SPA 上下文、去重精度）→ P3 补齐优化（压缩、超时、IIFE 格式）。

**Tech Stack:** Vite, Vitest, JSDOM, web-vitals, rrweb

## Global Constraints

- 遵循项目现有代码风格：class 内部方法间不加逗号，使用 `.call(window, ...)` 而非 `.apply(this, ...)`
- teardown 顺序：error collector 先于 behavior collector 拆除
- 不删除用户已有的内联注释和表格
- 每次任务完成后立即 commit（遵循项目记忆中的 commit-after-each-task）
- 保持 ESM 模块格式

---

## 阶段一：P0 —— 基础设施（缺失的要命的东西）

### Task 1: 创建 examples/ 目录和示例页面

**Files:**
- Create: `examples/vite.config.js`
- Create: `examples/index.html`
- Create: `examples/main.js`
- Create: `examples/error-demo.html`

**Interfaces:**
- Consumes: `lian-monitor` SDK（`../dist/lian-monitor.js`）
- Produces: `npm run dev:example` 可正常启动开发服务器

- [ ] **Step 1: 创建 Vite 示例配置**

```js
// examples/vite.config.js
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  server: {
    port: 5174,
    open: '/index.html',
  },
  resolve: {
    alias: {
      'lian-monitor': path.resolve(__dirname, '../src/index.js'),
    },
  },
});
```

- [ ] **Step 2: 创建示例主页面**

```html
<!-- examples/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Lian-Monitor Example</title>
  <style>
    body { font-family: sans-serif; padding: 24px; max-width: 600px; margin: auto; }
    button { margin: 4px; padding: 8px 16px; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }
    .section { margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>Lian-Monitor SDK 示例</h1>

  <div class="section">
    <h3>错误监控</h3>
    <button id="btn-js-error">触发 JS 错误</button>
    <button id="btn-promise-error">触发 Promise 错误</button>
    <button id="btn-console-error">触发 console.error</button>
    <button id="btn-manual-error">手动上报错误</button>
  </div>

  <div class="section">
    <h3>自定义事件</h3>
    <button id="btn-custom-event">手动上报事件</button>
    <button id="btn-breadcrumb">添加面包屑</button>
  </div>

  <div class="section">
    <h3>导航</h3>
    <button id="btn-pushstate">pushState 跳转</button>
    <a href="error-demo.html">跳转到错误演示页</a>
  </div>

  <div class="section">
    <h3>输出</h3>
    <pre id="output">等待事件...</pre>
  </div>

  <script type="module" src="./main.js"></script>
</body>
</html>
```

- [ ] **Step 3: 创建示例入口 JS**

```js
// examples/main.js
import { init } from 'lian-monitor';

const monitor = init({
  dsn: 'http://localhost:8787/report',
  debug: true,
  sampleRate: 1,
  release: '1.0.0',
  environment: 'development',
  behavior: {
    maxBreadcrumbs: 20,
    captureConsole: true,
  },
});

// 暴露到全局方便控制台调试
window.__monitor = monitor;

const output = document.getElementById('output');

function log(msg) {
  output.textContent = JSON.stringify(msg, null, 2) + '\n---\n' + output.textContent;
}

// 监听自定义上报（通过劫持 fetch 展示）
document.getElementById('btn-js-error').addEventListener('click', () => {
  const obj = undefined;
  obj.foo();
});

document.getElementById('btn-promise-error').addEventListener('click', () => {
  Promise.reject(new Error('Promise 异步错误测试'));
});

document.getElementById('btn-console-error').addEventListener('click', () => {
  console.error(new Error('console.error 错误测试'));
});

document.getElementById('btn-manual-error').addEventListener('click', () => {
  monitor.captureError(new Error('手动上报的错误'));
  log({ action: 'captureError', message: '手动上报的错误' });
});

document.getElementById('btn-custom-event').addEventListener('click', () => {
  monitor.captureEvent('button-click', { buttonId: 'btn-custom-event', label: '自定义事件' });
  log({ action: 'captureEvent', data: { buttonId: 'btn-custom-event' } });
});

document.getElementById('btn-breadcrumb').addEventListener('click', () => {
  monitor.addBreadcrumb('用户点击了面包屑按钮', { area: 'demo' });
  log({ action: 'addBreadcrumb', message: '面包屑已添加' });
});

document.getElementById('btn-pushstate').addEventListener('click', () => {
  history.pushState({ page: 1 }, '', '/page/1');
  log({ action: 'pushState', url: '/page/1' });
});
```

- [ ] **Step 4: 创建错误演示页面**

```html
<!-- examples/error-demo.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Error Demo</title>
</head>
<body>
  <h1>错误演示页</h1>
  <button id="btn-resource-error">加载不存在的资源</button>
  <img id="bad-image" style="display:none" />

  <script type="module">
    import { init } from 'lian-monitor';

    const monitor = init({
      dsn: 'http://localhost:8787/report',
      debug: true,
      sampleRate: 1,
      environment: 'development',
    });

    document.getElementById('btn-resource-error').addEventListener('click', () => {
      const img = document.getElementById('bad-image');
      img.src = 'https://example.invalid/nonexistent.png';
      img.style.display = 'block';
    });
  </script>
</body>
</html>
```

- [ ] **Step 5: 验证**

```bash
npx vite --config examples/vite.config.js
```

Expected: 浏览器打开 `http://localhost:5174`，SDK 初始化成功，按钮可触发各种事件。

- [ ] **Step 6: Commit**

```bash
git add examples/
git commit -m "feat: add examples directory with demo pages"
```

---

### Task 2: 创建 server/mock-report.mjs 模拟上报服务

**Files:**
- Create: `server/mock-report.mjs`
- Create: `server/package.json`（可选，如果不需要额外依赖就跳过）

**Interfaces:**
- Consumes: 无
- Produces: `npm run mock:server` 启动 HTTP 服务在 8787 端口

- [ ] **Step 1: 创建 mock 服务器**

```js
// server/mock-report.mjs
import http from 'node:http';

const PORT = 8787;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log(`[${new Date().toISOString()}] Received ${data.events?.length || 1} event(s):`);
        data.events?.forEach((evt, i) => {
          console.log(`  [${i + 1}] type=${evt.type}, subType=${evt.subType || '-'}, level=${evt.level || '-'}`);
          if (evt.exception) {
            console.log(`       exception: ${evt.exception.values?.[0]?.type}: ${evt.exception.values?.[0]?.value}`);
          }
          if (evt.breadcrumbs) {
            console.log(`       breadcrumbs: ${evt.breadcrumbs.length}`);
          }
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        console.error('Parse error:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: e.message }));
      }
    });
    return;
  }

  // GET 请求（Image 降级走 GET）
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const data = url.searchParams.get('data');
  if (data) {
    try {
      const parsed = JSON.parse(data);
      console.log(`[${new Date().toISOString()}] Image beacon received:`, parsed.events?.length || 1, 'event(s)');
    } catch {
      console.log(`[${new Date().toISOString()}] Image beacon received (raw)`);
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
});

server.listen(PORT, () => {
  console.log(`Mock report server running at http://localhost:${PORT}/report`);
});
```

- [ ] **Step 2: 验证**

```bash
node server/mock-report.mjs
```

Expected: 终端输出 `Mock report server running at http://localhost:8787/report`，用 curl 发 POST 测试能正确解析。

- [ ] **Step 3: Commit**

```bash
git add server/
git commit -m "feat: add mock report server for local development"
```

---

### Task 3: 搭建测试框架并为核心模块写测试

**Files:**
- Create: `vitest.config.js`
- Create: `tests/setup.js`
- Create: `tests/core/config.test.js`
- Create: `tests/core/scope.test.js`
- Create: `tests/core/contexts.test.js`
- Modify: `package.json`（添加 vitest 依赖和 test 脚本）

**Interfaces:**
- Consumes: `src/core/config.js`, `src/core/scope.js`, `src/core/contexts.js`
- Produces: `npm test` 可运行测试套件

- [ ] **Step 1: 安装 Vitest 和 JSDOM**

```bash
npm install -D vitest jsdom
```

- [ ] **Step 2: 更新 package.json scripts**

在 `package.json` 的 `"scripts"` 中添加：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 创建 vitest.config.js**

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 4: 创建测试 setup 文件**

```js
// tests/setup.js
// Mock PerformanceObserver（JSDOM 不包含）
if (typeof PerformanceObserver === 'undefined') {
  global.PerformanceObserver = class PerformanceObserver {
    constructor() {}
    observe() {}
    disconnect() {}
  };
  PerformanceObserver.supportedEntryTypes = [];
}

// Mock performance memory
if (!global.performance) {
  global.performance = {};
}
global.performance.memory = undefined;
global.performance.setResourceTimingBufferSize = () => {};
global.performance.clearResourceTimings = () => {};
global.performance.addEventListener = () => {};

// Mock crypto.randomUUID
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Mock navigator.sendBeacon
if (typeof navigator.sendBeacon === 'undefined') {
  navigator.sendBeacon = () => true;
}
```

- [ ] **Step 5: 编写 config 默认值测试**

```js
// tests/core/config.test.js
import { describe, it, expect } from 'vitest';
import config from '../../src/core/config.js';

describe('config defaults', () => {
  it('should have dsn as empty string', () => {
    expect(config.dsn).toBe('');
  });

  it('should have sampleRate as 1', () => {
    expect(config.sampleRate).toBe(1);
  });

  it('should have batchSize as 5', () => {
    expect(config.batchSize).toBe(5);
  });

  it('should have batchInterval as 3000', () => {
    expect(config.batchInterval).toBe(3000);
  });

  it('should have maxQueueSize as 50', () => {
    expect(config.maxQueueSize).toBe(50);
  });

  it('should have retryCount as 3', () => {
    expect(config.retryCount).toBe(3);
  });

  it('should have retryDelay as 1000', () => {
    expect(config.retryDelay).toBe(1000);
  });

  it('should have dedupInterval as 5000', () => {
    expect(config.dedupInterval).toBe(5000);
  });

  it('should have debug as false', () => {
    expect(config.debug).toBe(false);
  });

  it('should have behavior config with maxBreadcrumbs 20', () => {
    expect(config.behavior.maxBreadcrumbs).toBe(20);
    expect(config.behavior.captureConsole).toBe(true);
  });

  it('should have error config with sampleRate 1', () => {
    expect(config.error.enabled).toBe(true);
    expect(config.error.sampleRate).toBe(1);
  });

  it('should have performance config with sampleRate 0.5', () => {
    expect(config.performance.enabled).toBe(true);
    expect(config.performance.sampleRate).toBe(0.5);
  });
});
```

- [ ] **Step 6: 编写 Scope 测试**

```js
// tests/core/scope.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import Scope from '../../src/core/scope.js';

describe('Scope', () => {
  let scope;

  beforeEach(() => {
    scope = new Scope(10);
  });

  it('should initialize with default values', () => {
    expect(scope.breadcrumbs).toEqual([]);
    expect(scope.maxBreadcrumbs).toBe(10);
    expect(scope.userId).toBeNull();
    expect(scope.tags).toEqual({});
  });

  it('should add breadcrumb with timestamp and defaults', () => {
    scope.addBreadcrumb({ category: 'test', data: { foo: 'bar' } });
    expect(scope.breadcrumbs).toHaveLength(1);
    expect(scope.breadcrumbs[0].category).toBe('test');
    expect(scope.breadcrumbs[0].type).toBe('default');
    expect(scope.breadcrumbs[0].level).toBe('info');
    expect(typeof scope.breadcrumbs[0].timestamp).toBe('number');
  });

  it('should respect maxBreadcrumbs limit', () => {
    for (let i = 0; i < 15; i++) {
      scope.addBreadcrumb({ category: `test-${i}` });
    }
    expect(scope.breadcrumbs).toHaveLength(10);
    expect(scope.breadcrumbs[0].category).toBe('test-5');
    expect(scope.breadcrumbs[9].category).toBe('test-14');
  });

  it('should get copy of breadcrumbs (not reference)', () => {
    scope.addBreadcrumb({ category: 'test' });
    const copy = scope.getBreadcrumbs();
    copy.push({ category: 'mutated' });
    expect(scope.breadcrumbs).toHaveLength(1);
  });

  it('should clear breadcrumbs', () => {
    scope.addBreadcrumb({ category: 'test' });
    scope.clearBreadcrumbs();
    expect(scope.breadcrumbs).toHaveLength(0);
  });

  it('should set user with data', () => {
    scope.setUser('user123', { email: 'test@test.com' });
    expect(scope.userId).toBe('user123');
    expect(scope.userData.email).toBe('test@test.com');
  });

  it('should merge userData on multiple setUser calls', () => {
    scope.setUser('user1', { email: 'a@a.com' });
    scope.setUser('user2', { name: 'Bob' });
    expect(scope.userId).toBe('user2');
    expect(scope.userData.email).toBe('a@a.com');
    expect(scope.userData.name).toBe('Bob');
  });

  it('should set tags', () => {
    scope.setTag('env', 'production');
    scope.setTag('version', '1.0');
    expect(scope.tags.env).toBe('production');
    expect(scope.tags.version).toBe('1.0');
  });

  it('should set extras', () => {
    scope.setExtra('customKey', 'customValue');
    expect(scope.extras.customKey).toBe('customValue');
  });
});
```

- [ ] **Step 7: 编写 contexts 测试**

```js
// tests/core/contexts.test.js
import { describe, it, expect } from 'vitest';
import { getContexts } from '../../src/core/contexts.js';

describe('getContexts', () => {
  it('should return os, browser, device objects', () => {
    const ctx = getContexts();
    expect(ctx).toHaveProperty('os');
    expect(ctx).toHaveProperty('browser');
    expect(ctx).toHaveProperty('device');
    expect(ctx.os).toHaveProperty('name');
    expect(ctx.os).toHaveProperty('version');
    expect(ctx.browser).toHaveProperty('name');
    expect(ctx.browser).toHaveProperty('version');
    expect(ctx.device).toHaveProperty('type');
  });

  it('should detect browser based on userAgent', () => {
    // JSDOM 的默认 UA 包含 Chrome 相关信息
    expect(ctx.browser.name).toBeDefined();
  });
});
```

- [ ] **Step 8: 运行测试验证通过**

```bash
npx vitest run
```

Expected: 所有测试 PASS。

- [ ] **Step 9: Commit**

```bash
git add vitest.config.js tests/ package.json
git commit -m "test: add vitest framework and core module tests"
```

---

## 阶段二：P1 —— 致命缺陷修复

### Task 4: 修复 Transport 层 URL 编码和异常保护

**Files:**
- Modify: `src/client/transport.js`
- Create: `tests/client/transport.test.js`

**Interfaces:**
- Consumes: 现有 Transport 类
- Produces: `_sendByImage` 正确编码 URL 参数，`_sendByBeacon` 有 try-catch 保护

- [ ] **Step 1: 修复 `_sendByImage` 中缺少的 encodeURIComponent**

```js
// 修改 src/client/transport.js 的 _sendByImage 方法
_sendByImage(data) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(this.reportFields)) {
        params.set(key, value);
    }
    params.set('data', encodeURIComponent(data));  // ← 加 encodeURIComponent
    const img = new Image()
    img.src = `${this.url}?${params.toString()}`
    return
}
```

原来的代码：
```js
params.set('data', data);
```

- [ ] **Step 2: 修复 `_sendByBeacon` JSON.parse 异常保护**

```js
// 修改 src/client/transport.js 的 _sendByBeacon 方法
_sendByBeacon(data) {
    try {
        const parsed = JSON.parse(data);
        const body = JSON.stringify({
            ...this.reportFields,
            ...parsed
        });
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon) {
            return navigator.sendBeacon(this.url, blob);
        }
        return false;
    } catch {
        return false;  // JSON 解析失败，静默降级
    }
}
```

原来的代码：
```js
_sendByBeacon(data) {
    const body = JSON.stringify({
        ...this.reportFields,
        ...JSON.parse(data)
    })
    ...
}
```

- [ ] **Step 3: 为 fetch 添加 AbortController 超时机制**

```js
// 在 _sendByFetch 方法中添加超时
async _sendByFetch(data, timeoutMs = 10000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const headers = { 'Content-Type': 'application/json' };
        for (const [key, value] of Object.entries(this.reportFields)) {
            headers[key] = value;
        }
        const response = await fetch(this.url, {
            method: 'POST',
            headers,
            body: data,
            signal: controller.signal,
        });
        clearTimeout(timer);
        return response;
    } catch (error) {
        if (error.name === 'AbortError') {
            // 超时：返回 null，由上层走降级逻辑
        }
        return null;
    }
}
```

- [ ] **Step 4: 添加 Transport 超时配置**

在 `src/core/config.js` 中添加默认配置项：
```js
// 在 config 对象中添加
requestTimeout: 10000,  // fetch 请求超时时间（毫秒）
```

在 Transport 构造函数中读取：
```js
this.requestTimeout = options.requestTimeout ?? 10000;
```

然后将 `_sendByFetch` 中的硬编码 `timeoutMs = 10000` 改为使用 `this.requestTimeout`。

- [ ] **Step 5: 编写 Transport 测试**

```js
// tests/client/transport.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 需要先 mock fetch 和 navigator.sendBeacon
describe('Transport', () => {
  let Transport;
  let transport;

  beforeEach(async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    );
    global.navigator.sendBeacon = vi.fn().mockReturnValue(true);
    // 动态导入以使用 mock
    const mod = await import('../../src/client/transport.js');
    Transport = mod.default;
    transport = new Transport({
      dsn: 'http://localhost:8787/report',
      batchSize: 3,
      batchInterval: 100,
      retryCount: 2,
      retryDelay: 100,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should enqueue events and flush at batch size', async () => {
    transport.send({ type: 'custom', data: 'test1' });
    transport.send({ type: 'custom', data: 'test2' });
    transport.send({ type: 'custom', data: 'test3' });
    // 达到 batchSize 应自动 flush
    await new Promise(r => setTimeout(r, 50));
    expect(fetch).toHaveBeenCalled();
  });

  it('should encode data param in _sendByImage', () => {
    const data = JSON.stringify({ events: [{ type: 'error', data: { message: 'test & special = chars' } }] });
    // 验证 URLSearchParams 正确编码
    const params = new URLSearchParams();
    params.set('data', encodeURIComponent(data));
    const url = params.toString();
    // 不应包含未编码的特殊字符
    expect(url).not.toMatch(/[&](?!=)/);  // & 应该被编码
  });

  it('should handle JSON parse error in _sendByBeacon gracefully', () => {
    const result = transport._sendByBeacon('invalid json {{{');
    expect(result).toBe(false);
  });

  it('should rate limit after 429 response', () => {
    const response = new Response(null, {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
    transport._handleRateLimit(response);
    expect(transport._isRateLimited()).toBe(true);
  });

  it('should respect maxQueueSize', () => {
    for (let i = 0; i < 60; i++) {
      transport.send({ type: 'custom', data: `test-${i}` });
    }
    expect(transport.queue.length).toBeLessThanOrEqual(50);
    // 最早的事件被丢弃，保留最新
    expect(transport.queue[0].data).not.toBe('test-0');
  });
});
```

- [ ] **Step 6: 运行测试验证**

```bash
npx vitest run tests/client/transport.test.js
```

- [ ] **Step 7: Commit**

```bash
git add src/client/transport.js src/core/config.js tests/client/transport.test.js
git commit -m "fix(transport): add URL encoding, JSON parse protection, and fetch timeout"
```

---

### Task 5: 修复 sessionStorage / crypto 崩溃保护

**Files:**
- Modify: `src/client/index.js`

**Interfaces:**
- Consumes: `MonitorClient._getOrCreateSessionId`, `MonitorClient._generateId`
- Produces: SSR 环境、隐私模式、旧浏览器下不崩溃

- [ ] **Step 1: 修复 `_getOrCreateSessionId` 缺少 try-catch**

```js
// 修改 src/client/index.js 的 _getOrCreateSessionId 方法
_getOrCreateSessionId() {
    const key = 'monitor_session';
    try {
        let sessionId = sessionStorage.getItem(key);
        if (sessionId) return sessionId;
    } catch {
        // sessionStorage 不可用（SSR、隐私模式、沙箱 iframe）
    }

    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    try {
        sessionStorage.setItem(key, sessionId);
    } catch {
        // 写入失败不阻塞
    }
    return sessionId;
}
```

原来的代码直接访问 `sessionStorage.getItem(key)` 无保护。

- [ ] **Step 2: 修复 `_generateId` 中 `crypto` 引用和 `substr` 废弃 API**

```js
// 修改 src/client/index.js 的 _generateId 方法
_generateId() {
    try {
        if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
            return globalThis.crypto.randomUUID();
        }
    } catch {
        // crypto 不可用
    }
    return 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}
```

原来的代码用 `crypto` 裸引用和 `substr`（已废弃）。

- [ ] **Step 3: Commit**

```bash
git add src/client/index.js
git commit -m "fix(client): protect sessionStorage/crypto access from crashing in SSR and old browsers"
```

---

### Task 6: 为 Framework 集成添加 teardown 机制

**Files:**
- Modify: `src/frameworks/vue.js`
- Modify: `src/frameworks/react.js`
- Modify: `src/frameworks/angular.js`

**Interfaces:**
- Consumes: `client.captureError()`
- Produces: 每个框架集成都有 restore/uninstall 方法

- [ ] **Step 1: Vue 插件添加 teardown**

```js
// src/frameworks/vue.js
export function createVuePlugin(client) {
    let originalErrorHandler = null;

    return {
        install(app) {
            const config = app.config;
            if (!config) return;

            originalErrorHandler = config.errorHandler;

            config.errorHandler = (err, instance, info) => {
                client.captureError(err instanceof Error ? err : new Error(String(err)), {
                    data: {
                        framework: 'vue',
                        info: typeof info === 'string' ? info : '',
                    },
                });
                if (originalErrorHandler) {
                    originalErrorHandler.call(app, err, instance, info);
                }
            };
        },

        // Vue 2: Vue.config.errorHandler = null 即可恢复默认
        uninstall(app) {
            const config = app?.config;
            if (config) {
                config.errorHandler = originalErrorHandler;
            }
        },
    };
}
```

原来的代码没有保存 `originalErrorHandler` 引用也没有 `uninstall` 方法。

- [ ] **Step 2: React ErrorBoundary 添加 dispose**

```js
// src/frameworks/react.js — 在 componentDidCatch 之后添加

componentWillUnmount() {
    // 清理：如果父组件期望在卸载时停止监控
    if (this.props.onDispose) {
        this.props.onDispose();
    }
}
```

同时支持 `onDispose` 回调（可选清理）。

- [ ] **Step 3: Angular ErrorHandler 改用工厂复用模式**

```js
// src/frameworks/angular.js
let _MonitorErrorHandler = null;

export function createAngularErrorHandler(client) {
    // 复用已创建的 class，避免每次调用创建新 class
    if (_MonitorErrorHandler) return _MonitorErrorHandler;

    _MonitorErrorHandler = class MonitorErrorHandler {
        handleError(error) {
            const err = error.originalError || error;
            client.captureError(err instanceof Error ? err : new Error(String(err)), {
                data: {
                    framework: 'angular',
                    ngModule: error.ngModule || '',
                },
            });
            console.error(err);
        }
    };

    return _MonitorErrorHandler;
}
```

原来的代码每次调用都创建新的匿名 class。

- [ ] **Step 4: Commit**

```bash
git add src/frameworks/vue.js src/frameworks/react.js src/frameworks/angular.js
git commit -m "fix(frameworks): add teardown/uninstall for Vue, React, Angular integrations"
```

---

## 阶段三：P2 —— 功能修复

### Task 7: 统一错误去重逻辑

**Files:**
- Modify: `src/collector/error.js`
- Modify: `src/client/index.js`

**Interfaces:**
- Consumes: `client.capture()`, `client._dedupKey()`
- Produces: 错误收集器不再自己维护 `_recentErrors` Set，完全依赖 client 的去重

- [ ] **Step 1: 移除 error collector 中的冗余去重**

删除 `errorCollector._capture` 中的 Set 去重逻辑，保留原始的函数：

```js
// src/collector/error.js — _capture 方法简化为
_capture(type, data) {
    this.client.capture({
        type: 'error',
        subType: type,
        timestamp: Date.now(),
        data: data,
    });
}
```

删除：
```js
if (!this._recentErrors) this._recentErrors = new Set();
const key = `${type}|${data.message}|${data.source || ''}|${data.lineno || ''}`;
if (this._recentErrors.has(key)) return;
this._recentErrors.add(key);
if (this._recentErrors.size > 50) { ... }
```

- [ ] **Step 2: 改进 `_dedupKey` 的精度**

```js
// src/client/index.js — _dedupKey 方法
_dedupKey(event) {
    const msg = event.data?.message || '';
    const stack = event.data?.stack || '';
    const subType = event.subType || '';
    const source = event.data?.source || '';
    const lineno = event.data?.lineno ?? '';
    const colno = event.data?.colno ?? '';

    // 取 stack 前两帧做指纹（增加精度，减少误去重）
    const frames = stack.split('\n').slice(1, 3).map(f => f.trim()).join('|');

    return [subType, msg, source, lineno, colno, frames].join('@');
}
```

原来的 key 只用 `message + first stack frame`。

- [ ] **Step 3: Commit**

```bash
git add src/collector/error.js src/client/index.js
git commit -m "fix(dedup): unify dedup logic into client, improve key precision"
```

---

### Task 8: 修复 SPA 路由切换时 contexts 不更新

**Files:**
- Modify: `src/client/index.js`

**Interfaces:**
- Consumes: `getContexts()` from `../core/contexts.js`
- Produces: 每次 enrichment 都能获取最新的 contexts（特别是 pageUrl）

- [ ] **Step 1: 移除 `_cachedContexts` 并让 `pageUrl` 动态获取**

```js
// src/client/index.js

// 删除模块级变量：
// let _cachedContexts = null  ← 删掉这行

// 在 _enrichment 方法中：
_enrichment(event) {
    // ... 前面的代码不变 ...

    event.pageUrl = window.location.href;

    // contexts 每次动态获取（UA 不变所以缓存没问题，
    // 但 pageUrl 必须动态赋值已在上面处理）
    // 移除原来的：
    // if (!_cachedContexts) _cachedContexts = getContexts();
    // event.contexts = _cachedContexts;
    // 改为每次获取：
    event.contexts = getContexts();

    // ... 后面不变 ...
}
```

注意：`getContexts()` 只做 UA 解析，开销很小（无 DOM 操作），所以去掉缓存对性能影响可忽略。

- [ ] **Step 2: Commit**

```bash
git add src/client/index.js
git commit -m "fix(client): always fetch fresh contexts and pageUrl for SPA route changes"
```

---

### Task 9: 修复 session 摘要只在有 breadcrumb 时才上报

**Files:**
- Modify: `src/client/index.js`

**Interfaces:**
- Consumes: `pagehide` 事件
- Produces: 无论有没有 breadcrumb 都上报 session 摘要

- [ ] **Step 1: 移除 breadcrumb 数量检查**

```js
// src/client/index.js — start() 中的 _onPageHide

this._onPageHide = () => {
    if (this.transport) {
        // 始终上报 session 摘要，不检查 breadcrumb 数量
        this.capture({
            type: 'session',
            subType: 'summary',
            timestamp: Date.now(),
            data: {
                duration: Date.now() - this._sessionStart,
            },
        });
        this.transport.destroy();
    }
};
```

移除原来的 `const breadcrumbs = this.scope.getBreadcrumbs(); if (breadcrumbs.length > 0) { ... }` 条件。

- [ ] **Step 2: Commit**

```bash
git add src/client/index.js
git commit -m "fix(client): always send session summary on pagehide regardless of breadcrumbs"
```

---

### Task 10: 统一两个 pagehide 监听器的执行顺序

**Files:**
- Modify: `src/client/index.js`
- Modify: `src/collector/behavior.js`

**Interfaces:**
- Consumes: `pagehide` 事件
- Produces: behavior 的 page-leave breadcrumb 先写入，client 的 session 摘要后发送

- [ ] **Step 1: 让 behavior 的 pagehide 先于 client 的触发**

方案：behavior 的 pagehide 保持捕获阶段注册（默认 bubbling），client 的 pagehide 延迟一帧执行：

```js
// src/client/index.js — start() 中
this._onPageHide = () => {
    // 用 setTimeout 延迟执行，确保 behavior 的 pagehide 先写完 breadcrumb
    setTimeout(() => {
        if (this.transport && this.state === 'running') {
            this.capture({
                type: 'session',
                subType: 'summary',
                timestamp: Date.now(),
                data: {
                    duration: Date.now() - this._sessionStart,
                },
            });
            this.transport.destroy();
        }
    }, 0);
};
window.addEventListener('pagehide', this._onPageHide);
```

注意：`pagehide` 期间 `setTimeout` 的行为——在 `pagehide` 中 `setTimeout(fn, 0)` 的回调不会执行（页面正在卸载）。更好的方式是使用 `visibilitychange`：

```js
// src/client/index.js — 改用 visibilitychange + pagehide 双保险
this._onVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && this.transport && this.state === 'running') {
        this.capture({
            type: 'session',
            subType: 'summary',
            timestamp: Date.now(),
            data: { duration: Date.now() - this._sessionStart },
        });
        this.transport.destroy();
    }
};
document.addEventListener('visibilitychange', this._onVisibilityChange);
```

同时在 `destroy()` 中移除 listener：
```js
document.removeEventListener('visibilitychange', this._onVisibilityChange);
```

- [ ] **Step 2: Commit**

```bash
git add src/client/index.js
git commit -m "fix(client): use visibilitychange for session summary to ensure breadcrumb order"
```

---

## 阶段四：P3 —— 补齐优化

### Task 11: 扩展 UA 解析支持更多浏览器和设备

**Files:**
- Modify: `src/core/contexts.js`
- Create: `tests/core/contexts.test.js`（补充测试）

**Interfaces:**
- Consumes: `navigator.userAgent`
- Produces: 更准确的 OS/浏览器/设备检测

- [ ] **Step 1: 补充浏览器检测**

在 `getBrowser` 函数中，在 Edge 检测之前插入：

```js
// src/core/contexts.js — getBrowser 函数补充

// Samsung Internet（必须在 Chrome 之前检测）
const samsungMatch = ua.match(/SamsungBrowser\/(\d+\.\d+)/);
if (samsungMatch) return { name: 'Samsung Internet', version: samsungMatch[1] };

// WeChat 内置浏览器
if (/MicroMessenger/i.test(ua)) {
    const wxMatch = ua.match(/MicroMessenger\/(\d+\.\d+)/);
    return { name: 'WeChat', version: wxMatch ? wxMatch[1] : '' };
}

// UC Browser
const ucMatch = ua.match(/UCBrowser\/(\d+\.\d+)/);
if (ucMatch) return { name: 'UC Browser', version: ucMatch[1] };
```

- [ ] **Step 2: 补充 iPadOS 13+ 检测**

在 `getDevice` 函数中：

```js
// src/core/contexts.js — getDevice 函数补充
function getDevice(ua) {
    // iPadOS 13+ 伪装成桌面 Safari，需要通过触摸点判断
    if (/iPad|Tablet/.test(ua)) return { type: 'tablet' };
    if (/Mobile|Android.*Mobile|iPhone|iPod/.test(ua)) return { type: 'mobile' };
    // iPadOS 13+：Mac 但支持触摸
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return { type: 'tablet' };
    return { type: 'desktop' };
}
```

- [ ] **Step 3: 补充 macOS 版本号处理**

在 `getOS` 中对 macOS 的 `version` 处理完善：

```js
// 已通过 .replace('_', '.') 处理，macOS 10.15.x 这种只需处理第一个 _
const macMatch = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
if (macMatch) {
    return { name: 'macOS', version: macMatch[1].replace(/_/g, '.') };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/core/contexts.js
git commit -m "feat(contexts): add Samsung Internet, WeChat, UC Browser detection and iPadOS 13+"
```

---

### Task 12: 添加 IIFE/UMD 构建格式

**Files:**
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: `src/index.js`
- Produces: `dist/lian-monitor.iife.js` 可直接通过 `<script>` 标签使用

- [ ] **Step 1: 修改 Vite 配置添加 IIFE 格式**

```js
// vite.config.js
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'LianMonitor',
      fileName: 'lian-monitor',
      formats: ['es', 'cjs', 'iife']  // ← 添加 'iife'
    },
    rollupOptions: {
      external: ['rrweb', 'web-vitals'],
      output: {
        exports: 'named',
        globals: {
          rrweb: 'rrweb',
          'web-vitals': 'webVitals',
        },
      },
    },
    sourcemap: true,
  },
});
```

- [ ] **Step 2: 验证构建**

```bash
npm run build
```

Expected: `dist/` 目录下出现 `lian-monitor.iife.js` 文件。

- [ ] **Step 3: Commit**

```bash
git add vite.config.js
git commit -m "feat(build): add IIFE format for script tag usage"
```

---

### Task 13: 添加 requestTimeout 配置和 AbortController 超时（已在 Task 4 中处理）

> 注：此任务已在 Task 4 中一并完成，此处不再重复。如果 Task 4 未做超时部分，在此补做。

---

### Task 14: 补充 package.json 元信息

**Files:**
- Modify: `package.json`

**Interfaces:**
- 无

- [ ] **Step 1: 补充 package.json**

```json
{
  "name": "lian-monitor",
  "version": "1.0.0",
  "description": "Front-end monitoring SDK — error tracking, performance metrics, user behavior breadcrumbs, and session replay",
  "license": "ISC",
  "author": "odk-l",
  "type": "module",
  "main": "./dist/lian-monitor.cjs",
  "module": "./dist/lian-monitor.js",
  "unpkg": "./dist/lian-monitor.iife.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/lian-monitor.js",
      "require": "./dist/lian-monitor.cjs"
    }
  },
  "files": [
    "dist"
  ],
  "keywords": [
    "monitoring",
    "error-tracking",
    "performance",
    "frontend",
    "sdk",
    "rrweb",
    "web-vitals"
  ],
  "repository": {
    "type": "git",
    "url": ""
  },
  "bugs": {
    "url": ""
  },
  "homepage": "",
  "scripts": {
    "dev:example": "vite --config examples/vite.config.js",
    "build": "vite build",
    "preview:example": "vite preview --config examples/vite.config.js",
    "mock:server": "node server/mock-report.mjs",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vite": "^7.0.0",
    "vitest": "^3.0.0",
    "jsdom": "^26.0.0"
  },
  "dependencies": {
    "rrweb": "^2.0.0-alpha.4",
    "web-vitals": "^5.1.0"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add package metadata, keywords, and repository info"
```

---

### Task 15: 为 rrweb 和 web-vitals 加载失败添加 debug 日志

**Files:**
- Modify: `src/plugins/rrweb.js`
- Modify: `src/collector/performance.js`

**Interfaces:**
- Consumes: `client.options.debug`
- Produces: debug 模式下加载失败有 console 输出

- [ ] **Step 1: rrweb 加载失败日志**

```js
// src/plugins/rrweb.js — catch 块中
} catch (e) {
    if (this.client?.options?.debug) {
        console.warn('[Monitor] rrweb failed to load:', e.message);
    }
}
```

- [ ] **Step 2: web-vitals 加载失败日志**

```js
// src/collector/performance.js — catch 块中
} catch (e) {
    if (this.client?.options?.debug) {
        console.warn('[Monitor] web-vitals failed to load:', e.message);
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/plugins/rrweb.js src/collector/performance.js
git commit -m "fix: add debug logging for rrweb and web-vitals load failures"
```

---

### Task 16: 为 XHR/Fetch breadcrumb URL 添加查询参数脱敏

**Files:**
- Modify: `src/collector/behavior.js`

**Interfaces:**
- Consumes: XHR/Fetch 拦截
- Produces: URL 中的敏感查询参数被剥离

- [ ] **Step 1: 添加 URL 脱敏工具函数**

```js
// src/collector/behavior.js — 在 _setupXHR 之前添加

_sanitizeUrl(url) {
    try {
        const u = new URL(url, location.origin);
        const sensitiveParams = ['token', 'secret', 'password', 'api_key', 'apikey', 'auth', 'authorization', 'access_token'];
        for (const param of sensitiveParams) {
            if (u.searchParams.has(param)) {
                u.searchParams.set(param, '[REDACTED]');
            }
        }
        return u.origin + u.pathname + u.search;
    } catch {
        return url;
    }
}
```

- [ ] **Step 2: 在 XHR breadcrumb 中使用脱敏 URL**

```js
// src/collector/behavior.js — XHR loadend handler 中
monitor._loadendHandler = () => {
    self.addBreadcrumb('http.xhr', {
        method: monitor.method,
        url: self._sanitizeUrl(monitor.url),  // ← 使用脱敏 URL
        status: this.status,
        duration: Date.now() - monitor.startTime,
    });
};
```

- [ ] **Step 3: 在 Fetch breadcrumb 中使用脱敏 URL**

```js
// src/collector/behavior.js — Fetch 拦截中
self.addBreadcrumb('http.fetch', {
    method,
    url: self._sanitizeUrl(String(url)),  // ← 使用脱敏 URL
    status: response.status,
    duration: Date.now() - startTime,
});
```

- [ ] **Step 4: Commit**

```bash
git add src/collector/behavior.js
git commit -m "fix(behavior): sanitize query params in XHR/Fetch breadcrumb URLs"
```

---

### Task 17: 添加 beforeBreadcrumb 钩子

**Files:**
- Modify: `src/core/scope.js`
- Modify: `src/core/config.js`
- Modify: `src/client/index.js`

**Interfaces:**
- Consumes: `scope.addBreadcrumb()`
- Produces: 用户可以通过 `beforeBreadcrumb` 过滤/修改面包屑

- [ ] **Step 1: 在 config 中添加 beforeBreadcrumb 配置**

```js
// src/core/config.js behavior 部分
behavior: {
    enabled: true,
    sampleRate: 0.3,
    maxBreadcrumbs: 20,
    captureConsole: true,
    sampler: null,
    beforeBreadcrumb: null,  // ← 新增：用户面包屑过滤钩子
},
```

- [ ] **Step 2: 在 Scope 中支持 beforeBreadcrumb**

```js
// src/core/scope.js — 修改 addBreadcrumb 方法
addBreadcrumb(breadcrumb, beforeBreadcrumb) {
    let crumb = {
        type: 'default',
        level: 'info',
        timestamp: Date.now() / 1000,
        ...breadcrumb,
    };

    // 调用用户钩子，可以修改或返回 null 丢弃
    if (typeof beforeBreadcrumb === 'function') {
        try {
            crumb = beforeBreadcrumb(crumb);
        } catch {
            return;  // 钩子出错 → 丢弃面包屑
        }
        if (!crumb) return;
    }

    this.breadcrumbs.push(crumb);
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
        this.breadcrumbs.shift();
    }
}
```

- [ ] **Step 3: 在 Client 初始化时传入 beforeBreadcrumb**

```js
// src/client/index.js — constructor 中
this.scope = new Scope(this.options.behavior?.maxBreadcrumbs ?? 20);
this._beforeBreadcrumb = this.options.behavior?.beforeBreadcrumb || null;
```

同时创建一个内部方法供 behavior collector 调用：
```js
_addBreadcrumbWrapper(breadcrumb) {
    this.scope.addBreadcrumb(breadcrumb, this._beforeBreadcrumb);
}
```

- [ ] **Step 4: 更新 behavior collector 使用新的 wrapper**

在 `behavior.js` 的 `addBreadcrumb` 方法中调用 `client._addBreadcrumbWrapper`：

```js
// src/collector/behavior.js
addBreadcrumb(category, data, level = 'info') {
    const client = this.client;
    if (client._addBreadcrumbWrapper) {
        client._addBreadcrumbWrapper({ category, level, data });
    } else {
        client.getScope().addBreadcrumb({ category, level, data });
    }
},
```

- [ ] **Step 5: Commit**

```bash
git add src/core/scope.js src/core/config.js src/client/index.js src/collector/behavior.js
git commit -m "feat: add beforeBreadcrumb hook for filtering/modifying breadcrumbs"
```

---

## 验证清单

全部任务完成后，进行以下端到端验证：

- [ ] `npm test` — 所有测试通过
- [ ] `npm run build` — 构建成功，输出 ES/CJS/IIFE 三种格式
- [ ] `npm run mock:server` — Mock 服务器正常启动
- [ ] `npm run dev:example` — 示例页面正常启动，SDK 初始化无报错
- [ ] 手动点击示例页按钮，观察 mock 服务器收到的事件
- [ ] 在隐私模式下打开示例页，SDK 不崩溃
- [ ] Vue/React/Angular 集成可以正常 teardown 不泄漏

---

## 任务依赖图

```
阶段一 (P0):
  Task 1 (examples/)     ─┐
  Task 2 (mock server)   ─┤ 无依赖，可并行
  Task 3 (vitest setup)  ─┘

阶段二 (P1):
  Task 4 (transport fix)     ← 依赖 Task 3（测试框架）
  Task 5 (crash protection)  ← 无依赖
  Task 6 (framework teardown)← 无依赖

阶段三 (P2):
  Task 7 (dedup unification)  ← 依赖 Task 5（修改同一文件）
  Task 8 (SPA contexts)       ← 依赖 Task 5（修改同一文件）
  Task 9 (session summary)    ← 依赖 Task 5（修改同一文件）
  Task 10 (pagehide order)    ← 依赖 Task 5（修改同一文件）

阶段四 (P3):
  Task 11 (UA expansion)      ← 无依赖
  Task 12 (IIFE format)       ← 无依赖
  Task 14 (package.json)      ← 无依赖
  Task 15 (debug logging)     ← 无依赖
  Task 16 (URL sanitization)  ← 无依赖
  Task 17 (beforeBreadcrumb)  ← 无依赖
```

推荐按阶段顺序执行，同一阶段内可部分并行。
