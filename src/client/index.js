//整个 SDK 的中央调度器
import config from "../core/config.js";
import Transport from './transport.js';
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
        this.userId = null;
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

    //传入插件或者中间件，并存入队列，支持链式调用
    use(fnOrPlugin) {
        //为什么plugin和中间件类型不同
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
        this.transport.send(current)
    }

    /* start() 要做四件事：
  1. 注册三个默认中间件（Filter、Sampling、Enrichment）
  2. 创建 Transport 实例
  3. 启动所有已注册的 Collectors（调 setup）
  4. 状态切为 'running'
   */

    start() {
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

        this.state = 'destroyed';
        return this;
    }

    //设置用户id
    setUserId(userId) {
        this.userId = userId;
        return this;
    }

    //三个默认中间件
    //判断这个事件该不该被处理。返回 null = 丢弃，返回 event = 放行
    _filter(event) {
        const typeConfig = this.options[event.type];
        if (typeConfig && typeConfig.enabled === false) return null;
        return event;
    }

    //采样
    _sampling(event) {
        if (Math.random() > this.options.sampleRate) return null;
        return event;
    }

    //为事件附加上下文信息
    _enrichment(event) {
        // SDK 元数据
        event.sdk = {
            name: 'lian-monitor',
            version: '1.0.0',
        };

        // 通用：每个事件都带上
        event.sessionId = this.sessionId;
        event.pageUrl = window.location.href;

        // 用户设置了 userId 就带上
        if (this.userId) {
            event.userId = this.userId;
        }

        // 错误事件：附加面包屑
        if (event.type === 'error') {
            event.breadcrumbs = this._getBreadcrumbs();
        }

        return event;
    }

    // 面包屑（breadcrumbs）就是错误发生前用户做了什么操作的记录。
    _getBreadcrumbs() {
        // 1. 从 Map 里按名字取出 behavior 采集器
        const behaviorCollector = this.collectors.get('behavior');

        // 2. 如果存在 → 调它的 getBreadcrumbs() 拿面包屑数组
        //    如果不存在 → 返回空数组 []
        return behaviorCollector ? behaviorCollector.getBreadcrumbs() : [];
    }
}

export default MonitorClient