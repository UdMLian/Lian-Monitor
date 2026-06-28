/**
 * MonitorClient 内部工具函数
 */

/**
 * 生成或读取 sessionId，优先用 sessionStorage 持久化。
 * 捕获 sessionStorage 不可用的场景（SSR、隐私模式、沙箱 iframe），降级为内存 ID。
 * @returns {string}
 */
export function getOrCreateSessionId() {
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

/**
 * 生成全局唯一事件 ID，优先用 crypto.randomUUID()。
 * @returns {string}
 */
export function generateId() {
    try {
        if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
            return globalThis.crypto.randomUUID();
        }
    } catch {
        // crypto 不可用
    }
    return 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

/**
 * 构建错误去重 key：subType + message + source + lineno + colno + stack 前两帧。
 * 相同 key 在 dedupInterval 窗口内只放行一次。
 * @param {Object} event - 错误事件对象
 * @returns {string}
 */
export function dedupKey(event) {
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
