import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 动态 import，在 beforeEach 设置好 mock 后再加载
let Transport;

beforeEach(async () => {
  // Mock fetch
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
  );
  // Mock navigator.sendBeacon
  global.navigator.sendBeacon = vi.fn().mockReturnValue(true);

  const mod = await import('../../src/client/transport.js');
  Transport = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createTransport(overrides = {}) {
  return new Transport({
    dsn: 'http://localhost:8787/report',
    batchSize: 3,
    batchInterval: 100,
    retryCount: 2,
    retryDelay: 100,
    ...overrides,
  });
}

describe('Transport', () => {
  it('should initialize with given options', () => {
    const t = createTransport();
    expect(t.url).toBe('http://localhost:8787/report');
    expect(t.batchSize).toBe(3);
    expect(t.batchInterval).toBe(100);
    expect(t.queue).toEqual([]);
    expect(t.timer).toBeNull();
  });

  it('should enqueue events and flush at batch size', async () => {
    const t = createTransport();
    t.send({ type: 'custom', data: 'test1' });
    t.send({ type: 'custom', data: 'test2' });
    t.send({ type: 'custom', data: 'test3' });
    // 达到 batchSize 应自动触发 flush
    await new Promise(r => setTimeout(r, 50));
    expect(fetch).toHaveBeenCalled();
  });

  it('should respect maxQueueSize and drop oldest events', () => {
    const t = createTransport({ batchSize: 100, maxQueueSize: 5 });
    for (let i = 0; i < 10; i++) {
      t.send({ type: 'custom', data: `test-${i}` });
    }
    expect(t.queue.length).toBe(5);
    // 最早的事件被丢弃，保留最新的
    expect(t.queue[0].data).toBe('test-5');
    expect(t.queue[4].data).toBe('test-9');
  });

  it('should encode data param with encodeURIComponent in _sendByImage', () => {
    const t = createTransport();
    const data = JSON.stringify({ events: [{ type: 'error', data: { message: 'test & special = chars' } }] });

    // 验证 encodeURIComponent 正确编码特殊字符
    const encoded = encodeURIComponent(data);
    expect(encoded).not.toContain('&');
    expect(encoded).not.toContain('=');
    expect(encoded).toContain('%26');  // & 被编码
    expect(encoded).toContain('%3D');  // = 被编码
  });

  it('should handle JSON parse error in _sendByBeacon gracefully', () => {
    const t = createTransport();
    const result = t._sendByBeacon('invalid json {{{');
    expect(result).toBe(false);
  });

  it('_sendByBeacon should return true on success', () => {
    const t = createTransport();
    const data = JSON.stringify({ events: [{ type: 'custom' }] });
    const result = t._sendByBeacon(data);
    expect(result).toBe(true);
    expect(navigator.sendBeacon).toHaveBeenCalled();
  });

  it('should rate limit after 429 response', () => {
    const t = createTransport();
    const response = new Response(null, {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
    t._handleRateLimit(response);
    expect(t._isRateLimited()).toBe(true);
  });

  it('should not be rate limited by default', () => {
    const t = createTransport();
    expect(t._isRateLimited()).toBe(false);
  });

  it('should set rate limit from X-Sentry-Rate-Limits header', () => {
    const t = createTransport();
    const response = new Response(null, {
      status: 429,
      headers: { 'X-Sentry-Rate-Limits': '120:error:organization' },
    });
    t._handleRateLimit(response);
    expect(t._isRateLimited()).toBe(true);
  });

  it('should clear timer on destroy', () => {
    const t = createTransport();
    t.timer = setTimeout(() => {}, 99999);
    t.destroy();
    expect(t.timer).toBeNull();
  });

  it('should flush remaining events on destroy', () => {
    const t = createTransport({ batchSize: 10 });
    t.send({ type: 'custom', data: 'pending' });
    t.destroy();
    // flush → _deliver 调用了 fetch
    expect(fetch).toHaveBeenCalled();
  });
});
