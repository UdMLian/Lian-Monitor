//整个 SDK 的中央调度器
import config from "../core/config.js";
import Transport from './transport.js';
import Scope from "../core/scope.js";
import { filterEvent, sampleEvent, enrichEvent } from './middleware.js';
import { getOrCreateSessionId, generateId, dedupKey } from './utils.js';
import { normalizeConfig } from "../core/normalizeConfig.js";
import {
  captureError, captureEvent, capturePerformance, captureMessage,
  addBreadcrumb, setUserId, setTag, setExtra,
} from './api.js';

class MonitorClient {
    constructor(options = {}) {
        // 配置兼容层：废弃参数映射 + 警告
        options = normalizeConfig(options);

        // 必填校验（在 normalizeConfig 之后，因为废弃参数可能已迁移）
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
        this.sessionId = getOrCreateSessionId();
        // Scope：存储面包屑、用户信息，与 Collector 解耦
        this.scope = new Scope(this.options.behavior?.maxBreadcrumbs ?? 20);
        this._beforeBreadcrumb = this.options.behavior?.beforeBreadcrumb || null;
        // 错误去重：同类型错误 N 秒内只报一次（Map 存储，多错误交替不互相覆盖）
        this._dedupMap = new Map();
        this._dedupInterval = this.options.dedupInterval ?? 5000;
    }

    getScope() {
        return this.scope;
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

        // 错误去重：相同 key 在窗口内只放行一次
        if (event.type === 'error') {
            const key = dedupKey(event);
            const now = Date.now();
            const lastTime = this._dedupMap.get(key);
            if (lastTime && now - lastTime < this._dedupInterval) {
                return;
            }
            this._dedupMap.set(key, now);

            // 定期清过期 key，防止 Map 无限增长
            if (this._dedupMap.size > 50) {
                for (const [k, t] of this._dedupMap) {
                    if (now - t > this._dedupInterval) this._dedupMap.delete(k);
                }
            }
        }

        event.event_id = generateId()
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
        this.use((event) => filterEvent(this, event));
        this.use((event) => sampleEvent(this, event));
        this.use((event) => enrichEvent(this, event));
        // 2. 如果用户传了 beforeSend，也注册进去
        if (this.options.beforeSend) {
            this.use(this.options.beforeSend);
        }
        // 2. 创建 Transport
        this.transport = new Transport(this.options)
        // 3. 先切状态再启动采集器，避免 collector.setup() 里触发的事件被 state='idle' 挡掉
        this.state = 'running';
        this._sessionStart = Date.now();
        // 4. 启动 Collector
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

    lastEventId() {
        return this._lastEventId;
    }

    // 供 Collector 内部调用，自动应用 beforeBreadcrumb 钩子
    _addBreadcrumbWrapper(breadcrumb) {
        this.scope.addBreadcrumb(breadcrumb, this._beforeBreadcrumb);
    }

    // ── 公开 API（委托到 api.js）──────────────────────────────

    captureError(error, options) {
        return captureError(this, error, options);
    }

    captureEvent(type, data, options) {
        return captureEvent(this, type, data, options);
    }

    capturePerformance(name, data) {
        return capturePerformance(this, name, data);
    }

    captureMessage(message, level, options) {
        return captureMessage(this, message, level, options);
    }

    addBreadcrumb(message, data, level) {
        return addBreadcrumb(this, message, data, level);
    }

    setUserId(userId) {
        return setUserId(this, userId);
    }

    setTag(key, value) {
        return setTag(this, key, value);
    }

    setExtra(key, value) {
        return setExtra(this, key, value);
    }
}

export default MonitorClient
