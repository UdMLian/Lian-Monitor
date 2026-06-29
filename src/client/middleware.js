/**
 * Pipeline 中间件（Filter → Sampling → Enrichment）
 *
 * 每个中间件签名：(event) => event | null
 * 返回 null 中断 pipeline，丢弃该事件
 */
import { getContexts } from '../core/contexts.js';

// 事件格式版本：与 SDK 版本解耦，字段结构变化时手动递增
const SCHEMA_VERSION = 1;

// userId + type → 0~1 固定值。同用户同类型永远同结果，采样稳定可复现
function _sample(client, type) {
    const seed = (client.scope.userId || client.sessionId) + '_' + type;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    return (Math.abs(hash) % 10000) / 10000;
}

function _inferLevel(event) {
    if (event.type === 'error') return 'error';
    if (event.type === 'message') return event.subType || 'info';  // 'info'/'warning'/'error'
    return 'info';
}

// 从 stack 第一行提取错误类型（'TypeError: x is undefined' → 'TypeError'）
function _errorType(event) {
    const stack = event.data?.stack;
    if (typeof stack === 'string') {
        const firstLine = stack.split('\n')[0];
        const match = firstLine.match(/^(\w+)(?::|\s|$)/);
        if (match) return match[1];
    }
    const map = { js: 'Error', resource: 'ResourceError', promise: 'PromiseRejection', console: 'Error', manual: 'Error' };
    return map[event.subType] || 'Error';
}

/**
 * Filter 中间件：判断这个事件该不该被处理
 * - 检查类型是否在 options 中被禁用（enabled: false）
 * - 检查 error message 是否匹配 ignoreErrors 列表
 * 返回 null = 丢弃，返回 event = 放行
 */
export function filterEvent(client, event) {
    const typeConfig = client.options[event.type];
    if (typeConfig && typeConfig.enabled === false) return null;

    if (event.type === 'error') {
        const ignoreErrors = client.options.ignoreErrors || []
        const message = event.data?.message || ''
        for (let pattern of ignoreErrors) {
            if (typeof pattern === 'string' && message === pattern) return null;
            if (pattern instanceof RegExp && pattern.test(message)) return null;
        }
    }

    return event;
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

/**
 * Sampling 中间件：按采样率决定是否保留事件
 * - 手动事件（_manual: true）始终采样
 * - sampler 函数优先于静态 sampleRate
 */
export function sampleEvent(client, event) {
    if (event._manual) {
        event._sampled = true;
        event.sample_rate = 'manual';
        return event;
    }

    const typeConfig = client.options[event.type];

    const sampler = typeConfig?.sampler ?? client.options.sampler
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
            if (client.options.debug) {
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
            if (_sample(client, event.type) > rate) {
                if (client.options.debug) {
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
    const rate = typeConfig?.sampleRate ?? client.options.sampleRate;
    if (_sample(client, event.type) > rate) {
        if (client.options.debug) {
            console.log(`[Monitor] Event dropped by sampling: type=${event.type}, rate=${rate}`);
        }
        return null;
    }
    // 有了 _sampled: true + sample_rate: 0.5，事件自带"身份证明"——看一眼就知道这条是通过了 50% 采样进来的。
    event._sampled = true;
    event.sample_rate = rate;
    return event;
}

/**
 * Enrichment 中间件：为事件附加上下文信息
 * - SDK 元数据（name、version）
 * - sessionId、pageUrl、contexts（OS/浏览器/设备）
 * - 用户信息（userId、tags、extras）
 * - 错误事件：结构化 exception + 面包屑
 * - session/custom 事件：附面包屑
 */
export function enrichEvent(client, event) {
    // SDK 元数据
    event.sdk = {
        name: 'lian-monitor',
        version: __SDK_VERSION__,
        packages: [{ name: 'lian-monitor', version: __SDK_VERSION__ }],
    };
    event.schema_version = SCHEMA_VERSION;
    event.platform = 'javascript';
    event.level = _inferLevel(event);
    // 通用：每个事件都带上
    event.sessionId = client.sessionId;
    event.pageUrl = window.location.href;
    event.contexts = getContexts();
    if (client.options.release) event.release = client.options.release;
    if (client.options.environment) event.environment = client.options.environment;

    // 用户信息
    if (client.scope.userId) {
        event.userId = client.scope.userId;
    }

    // 标签 & 额外上下文
    if (client.scope.tags && Object.keys(client.scope.tags).length > 0) {
        event.tags = { ...client.scope.tags };
    }
    if (client.scope.extras && Object.keys(client.scope.extras).length > 0) {
        event.extras = { ...client.scope.extras };
    }

    // 错误事件：结构化 exception + 面包屑
    if (event.type === 'error') {
        event.breadcrumbs = client.scope.getBreadcrumbs();
        event.exception = {
            values: [{
                type: _errorType(event),
                value: event.data?.message || '',
                stacktrace: event.data?.stack ? { frames: event.data.stack } : undefined,
            }],
        };
        delete event.data;
    }

    // session 摘要：附面包屑，保留 data.duration
    if (event.type === 'session' || event.type === 'custom') {
        event.breadcrumbs = client.scope.getBreadcrumbs();
    }
    return event;
}
