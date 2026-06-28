/**
 * MonitorClient 公开 API
 * 每个函数接收 client 实例作为第一参数，支持链式调用（返回 client）。
 */

/** 用户自己的 try-catch 里就能调：client.captureError(err)。 */
export function captureError(client, error, options = {}) {
    client.capture({
        type: 'error',
        subType: 'manual',
        timestamp: Date.now(),
        fingerprint: 'fingerprint' in options ? options.fingerprint : undefined,
        _manual: true,
        data: {
            message: error?.message,
            stack: error?.stack,
            ...(options.data || {}),
        },
    });
    return client;
}

/** 手动上报自定义事件 */
export function captureEvent(client, type, data, options = {}) {
    client.capture({
        type: 'custom',
        subType: type,
        timestamp: Date.now(),
        fingerprint: 'fingerprint' in options ? options.fingerprint : undefined,
        _manual: true,
        data,
    });
    return client;
}

/** 手动上报性能数据 */
export function capturePerformance(client, name, data = {}) {
    client.capture({
        type: 'performance',
        subType: 'custom',
        timestamp: Date.now(),
        _manual: true,
        data: { name, ...data },
    });
    return client;
}

/** 手动上报消息（info / warning / error） */
export function captureMessage(client, message, level = 'info', options = {}) {
    client.capture({
        type: 'message',
        subType: level,
        fingerprint: 'fingerprint' in options ? options.fingerprint : undefined,
        timestamp: Date.now(),
        data: { message },
        _manual: true,
    });
    return client;
}

/** 用户手动记录自定义面包屑 */
export function addBreadcrumb(client, message, data, level = 'info') {
    client.scope.addBreadcrumb({
        category: 'custom',
        level,
        data: { message, ...data },
    });
    return client;
}

/** 设置用户 ID */
export function setUserId(client, userId) {
    client.scope.setUser(userId);
    return client;
}

/** 设置标签 */
export function setTag(client, key, value) {
    client.scope.setTag(key, value);
    return client;
}

/** 设置额外上下文 */
export function setExtra(client, key, value) {
    client.scope.setExtra(key, value);
    return client;
}
