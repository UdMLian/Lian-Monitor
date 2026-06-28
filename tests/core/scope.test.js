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
    expect(scope.breadcrumbs[0].data).toEqual({ foo: 'bar' });
  });

  it('should respect maxBreadcrumbs limit', () => {
    for (let i = 0; i < 15; i++) {
      scope.addBreadcrumb({ category: `test-${i}` });
    }
    expect(scope.breadcrumbs).toHaveLength(10);
    // 最早的面包屑被移出，保留最新 10 个
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
    scope.setExtra('another', 123);
    expect(scope.extras.another).toBe(123);
  });

  it('should use default maxBreadcrumbs of 20', () => {
    const defaultScope = new Scope();
    expect(defaultScope.maxBreadcrumbs).toBe(20);
  });
});
