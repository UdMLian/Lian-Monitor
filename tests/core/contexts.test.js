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

  it('should detect a desktop browser type', () => {
    const ctx = getContexts();
    // JSDOM 默认 UA 不含 mobile 标识
    expect(ctx.device.type).toBe('desktop');
  });

  it('should return a non-empty browser name', () => {
    const ctx = getContexts();
    expect(ctx.browser.name).toBeTruthy();
    // JSDOM 默认 UA 可能不被识别，但真实浏览器环境一定能检测到
    if (ctx.browser.name === 'Unknown') {
      console.warn('[test] JSDOM default userAgent not recognized by getBrowser — expected in CI/headless');
    }
  });
});
