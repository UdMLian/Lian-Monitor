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

  it('should have behavior config with correct defaults', () => {
    expect(config.behavior.enabled).toBe(true);
    expect(config.behavior.sampleRate).toBe(0.3);
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

  it('should have custom config with sampleRate 1', () => {
    expect(config.custom.enabled).toBe(true);
    expect(config.custom.sampleRate).toBe(1);
  });

  it('should have beforeSend as null', () => {
    expect(config.beforeSend).toBeNull();
  });

  it('should have ignoreErrors as empty array', () => {
    expect(config.ignoreErrors).toEqual([]);
  });

  it('should have reportFields as empty object', () => {
    expect(config.reportFields).toEqual({});
  });
});
