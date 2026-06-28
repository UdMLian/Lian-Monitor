//整个 SDK 的中央调度器
import config from "../core/config.js";
import Transport from './transport.js';
import Scope from "../core/scope.js";
import { getContexts } from "../core/contexts.js";

let _cachedContexts = null
class MonitorClient {
    constructor(options = {}) {
        // 必填校验
        if (!options.dsn) {
            throw new Error('[Monitor] dsn is required');
        }
        // 范围校验
        if (options.sampleRate != null && (options.sampleRate < 0 || options.sampleRate > 1)) {
            throw new Error('[Monitor] sampleRate must be between 0 and 1');
        }

        // 把用户传的 options 和默认配置合并
        this.options = { ...config, ...options }
        // 中间件数组（pipeline 里的函数们）
        this.pipeline = [];

        // 采集器仓库（name → collector）
        this.collectors = new Map();

        // 插件列表
        this.plugins = [];

        // Transport 实例，start() 时才创建
        this.transport = null;

        // 当前状态
        this.state = 'idle';
        // Session 持久化：同一会话内页面刷新不产生新 sessionId
        this.sessionId = this._getOrCreateSessionId();
        // Scope：存储面包屑、用户信息，与 Collector 解耦
        this.scope = new Scope(this.options.behavior?.maxBreadcrumbs ?? 20);
    }

    getScope() {
        return this.scope;
    }

    _getOrCreateSessionId() {
        const key = 'monitor_session';
        let sessionId = sessionStorage.getItem(key);
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem(key, sessionId);
        }
        return sessionId;
    }

    /*
     * Middleware：纯函数 (event) => event | null
     * - 每个事件都经过所有 Middleware，按注册顺序执行
     * - 示例：Filter、Sampling、Enrichment、beforeSend
     *
     * Plugin：带生命周期的对象 { name, setup(client), teardown() }
     * - 一次初始化，不参与事件处理
     * - 示例：SessionReplay、Vue/React 集成
     */
    use(fnOrPlugin) {
        if (typeof fnOrPlugin === 'function') {
            this.pipeline.push(fnOrPlugin)
        } else if (typeof fnOrPlugin === 'object' && fnOrPlugin !== null) {
            this.plugins.push(fnOrPlugin)
        }
        return this
    }

    //像并发调度
    // Collector 就是收货员 ,收集各种数据信息
    //addCollector就是登记收货员
    addCollector(name, collector) {
        this.collectors.set(name, collector)
        //把收货员名字和它本人存进 this.collectors 这个 Map 里。
        // start() 时统一调 collector.setup(this) 让它们上岗。如果 SDK
        //已经在跑，就立刻上岗。
        if (this.state === 'running') {
            collector.setup(this)
        }
        return this
    }

    //capture 就是采集器把数据交给 SDK 的入口，先中间件处理，之后上报
    capture(event) {
        // SDK 没在运行，不处理
        if (this.state !== 'running') return

        event.event_id = this._generateId()
        this._lastEventId = event.event_id

        let current = event
        for (const fn of this.pipeline) {
            try {
                current = fn(current)
            } catch (e) {
                // 中间件抛错 → 丢弃这个事件
                if (this.options.debug) {
                    console.error('[Monitor] pipeline error:', e);
                }
                return;
            }
            if (!current) return
        }
        /* event → [Filter] → [Sampling] → [Enrichment] → [beforeSend] → transport.send()
        每个中间件返回 null 就中断 */
        if (current.type === 'error' || current.type === 'session') {
            this.transport.sendImmediate(current);
        } else {
            this.transport.send(current);
        }
    }

    // 用户自己的 try-catch 里就能调：client.captureError(err)。
    captureError(error, options = {}) {
        this.capture({
            type: 'error',
            subType: 'manual',
            timestamp: Date.now(),
            fingerprint: 'fingerprint' in options ? options.fingerprint : undefined,
            data: {
                message: error?.message,
                stack: error?.stack,
            },
        });
    }

    /* start() 要做四件事：
  1. 注册三个默认中间件（Filter、Sampling、Enrichment）
  2. 创建 Transport 实例
  3. 启动所有已注册的 Collectors（调 setup）
  4. 状态切为 'running'
   */

    start() {
        // 防止重复调用：idle → running → destroyed 单向
        if (this.state !== 'idle') return;
        // 1. 注册默认中间件
        this.use(this._filter.bind(this));
        this.use(this._sampling.bind(this));
        this.use(this._enrichment.bind(this));
        // 2. 如果用户传了 beforeSend，也注册进去
        if (this.options.beforeSend) {
            this.use(this.options.beforeSend);
        }
        // 2. 创建 Transport（后面写）
        this.transport = new Transport(this.options)
        // 3. 启动 Collector（后面写）
        for (const [name, collector] of this.collectors) {
            try {
                collector.setup(this);
            } catch (e) {
                if (this.options.debug) {
                    console.error(`[Monitor] Collector "${name}" setup failed:`, e);
                }
                // 继续启动其他的，不让一个采集器拖垮整个 SDK                                                                 
            }
        }
        //启动plugin
        for (const plugin of this.plugins) {
            try {
                plugin.setup?.(this)
            } catch (e) {
                if (this.options.debug) {
                    console.error(`[Monitor] Plugin "${plugin.name}" setup failed:`, e);
                }
            }
        }
        // 4. 开工
        this.state = 'running';
        this._sessionStart = Date.now();

        this._onPageHide = () => {
            if (this.transport) {
                const breadcrumbs = this.scope.getBreadcrumbs();
                if (breadcrumbs.length > 0) {
                    this.capture({
                        type: 'session',
                        subType: 'summary',
                        timestamp: Date.now(),
                        data: {
                            duration: Date.now() - this._sessionStart,
                        },
                    });
                }
                this.transport.destroy();
            }
        }
        window.addEventListener('pagehide', this._onPageHide)
    }

    destroy() {
        // 关掉所有采集器
        for (const [name, collector] of this.collectors) {
            try {
                collector.teardown();
            } catch (e) {
                if (this.options.debug) {
                    console.error(`[Monitor] Collector "${name}" teardown failed:`, e);
                }
            }
        }

        // 关掉所有插件
        for (const plugin of this.plugins) {
            try {
                plugin.teardown?.();
            } catch (e) {
                if (this.options.debug) {
                    console.error(`[Monitor] Plugin "${plugin.name}" teardown failed:`, e);
                }
            }
        }

        // 清空 transport（会先把队列剩余数据发出去）
        if (this.transport) {
            this.transport.destroy();
        }

        window.removeEventListener('pagehide', this._onPageHide)

        this.state = 'destroyed';
        return this;
    }

    //设置用户信息
    setUserId(userId) {
        this.scope.setUser(userId);
        return this;
    }

    _generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    lastEventId() {
        return this._lastEventId;
    }

    setTag(key, value) {
        this.scope.setTag(key, value);
        return this;
    }

    setExtra(key, value) {
        this.scope.setExtra(key, value);
        return this;
    }

    captureMessage(message, level = 'info', options = {}) {
        this.capture({
            type: 'message',
            subType: level,
            fingerprint: 'fingerprint' in options ? options.fingerprint : undefined,
            timestamp: Date.now(),
            data: { message },
        });
    }

    // 用户手动记录自定义面包屑
    addBreadcrumb(message, data, level = 'info') {
        this.scope.addBreadcrumb({
            category: 'custom',
            level,
            data: { message, ...data },
        });
        return this;
    }

    //三个默认中间件
    //判断这个事件该不该被处理。返回 null = 丢弃，返回 event = 放行
    _filter(event) {
        const typeConfig = this.options[event.type];
        if (typeConfig && typeConfig.enabled === false) return null;

        if (event.type === 'error') {
            const ignoreErrors = this.options.ignoreErrors || []
            const message = event.data?.message || ''
            for (let pattern of ignoreErrors) {
                if (typeof pattern === 'string' && message === pattern) return null;
                if (pattern instanceof RegExp && pattern.test(message)) return null;
            }
        }

        return event;
    }

    // userId + type → 0~1 固定值。同用户同类型永远同结果，采样稳定可复现
    _sample(type) {
        const seed = (this.scope.userId || this.sessionId) + '_' + type;
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
        }
        return (Math.abs(hash) % 10000) / 10000;
    }

    /*
  ┌──────────────┬───────────────────┬───────────────────────────┐                                                          
  │              │   Math.random()   │    hash(userId + type)    │                                                          
  ├──────────────┼───────────────────┼───────────────────────────┤                                                          
  │ 同用户同类型 │ 每次不同          │ 永远相同                  │                                                          
  ├──────────────┼───────────────────┼───────────────────────────┤                                                          
  │ 结果         │ 用户 A 数据碎片化 │ 用户 A 要么全采要么全不采 │                                                          
  ├──────────────┼───────────────────┼───────────────────────────┤                                                          
  │ 数据质量     │ 没法追踪单个用户  │ 单个用户数据完整连续      │                                                          
  └──────────────┴───────────────────┴───────────────────────────┘         */

    //采样：先查该类型的独立采样率，没有就用全局
    _sampling(event) {
        const typeConfig = this.options[event.type];

        const sampler = typeConfig?.sampler ?? this.options.sampler
        if (typeof sampler === 'function') {
            const ctx = {
                type: event.type,
                subType: event.subType || '',
                url: window.location.href,
                data: event.data
            }
            const result = sampler(ctx)
            if (result === false) {
                // 明确丢弃
                if (this.options.debug) {
                    console.log(`[Monitor] Event dropped by sampler: type=${event.type}`);
                }
                return null;
            }
            if (result === true) {
                event._sampled = true
                event.sample_rate = 'sampler'
                return event
            }


            if (typeof result === 'number') {
                // 返回采样率数字，跟 hash 比较
                const rate = Math.max(0, Math.min(1, result));
                if (this._sample(event.type) > rate) {
                    if (this.options.debug) {
                        console.log(`[Monitor] Event dropped by sampler: type=${event.type}, rate=${rate}`);
                    }
                    return null;
                }
                event._sampled = true;
                event.sample_rate = rate;
                return event;
            }

            // 返回值不明确，默认放行
            event._sampled = true;
            event.sample_rate = 'sampler';
            return event;
        }

        // 2. 静态数字采样率（fallback）
        const rate = typeConfig?.sampleRate ?? this.options.sampleRate;
        if (this._sample(event.type) > rate) {
            if (this.options.debug) {
                console.log(`[Monitor] Event dropped by sampling: type=${event.type}, rate=${rate}`);
            }
            return null;
        }
        // 有了 _sampled: true + sample_rate: 0.5，事件自带"身份证明"——看一眼就知道这条是通过了 50% 采样进来的。
        event._sampled = true;
        event.sample_rate = rate;
        return event;
    }
    _inferLevel(event) {
        if (event.type === 'error') return 'error';
        if (event.type === 'message') return event.subType || 'info';  // 'info'/'warning'/'error'
        return 'info';
    }

    // 从 stack 第一行提取错误类型（'TypeError: x is undefined' → 'TypeError'）
    _errorType(event) {
        const stack = event.data?.stack;
        if (typeof stack === 'string') {
            const firstLine = stack.split('\n')[0];
            const match = firstLine.match(/^(\w+)(?::|\s|$)/);
            if (match) return match[1];
        }
        const map = { js: 'Error', resource: 'ResourceError', promise: 'PromiseRejection', console: 'Error', manual: 'Error' };
        return map[event.subType] || 'Error';
    }

    //为事件附加上下文信息
    _enrichment(event) {
        // SDK 元数据
        event.sdk = {
            name: 'lian-monitor',
            version: '1.0.0',
            packages: [{ name: 'lian-monitor', version: '1.0.0' }],
        };
        event.platform = 'javascript';
        event.level = this._inferLevel(event);
        // 通用：每个事件都带上
        event.sessionId = this.sessionId;
        event.pageUrl = window.location.href;
        //  改成用缓存
        if (!_cachedContexts) _cachedContexts = getContexts();
        event.contexts = _cachedContexts;
        if (this.options.release) event.release = this.options.release;
        if (this.options.environment) event.environment = this.options.environment;

        // 用户信息
        if (this.scope.userId) {
            event.userId = this.scope.userId;
        }

        // 标签 & 额外上下文
        if (this.scope.tags && Object.keys(this.scope.tags).length > 0) {
            event.tags = { ...this.scope.tags };
        }
        if (this.scope.extras && Object.keys(this.scope.extras).length > 0) {
            event.extras = { ...this.scope.extras };
        }

        // 错误事件：结构化 exception + 面包屑
        if (event.type === 'error') {
            event.breadcrumbs = this.scope.getBreadcrumbs();
            event.exception = {
                values: [{
                    type: this._errorType(event),
                    value: event.data?.message || '',
                    stacktrace: event.data?.stack ? { frames: event.data.stack } : undefined,
                }],
            };
            delete event.data;
        }

        // session 摘要：附面包屑，保留 data.duration
        if (event.type === 'session') {
            event.breadcrumbs = this.scope.getBreadcrumbs();
        }

        return event;
    }
}

export default MonitorClient