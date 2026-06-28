class Scope {
  constructor(maxBreadcrumbs = 20) {
    this.breadcrumbs = [];
    this.maxBreadcrumbs = maxBreadcrumbs;
    this.userId = null;
    this.userData = {};
    this.tags = {};
  }

  addBreadcrumb(breadcrumb, beforeBreadcrumb) {
    let crumb = {
      type: 'default',
      level: 'info',
      timestamp: Date.now() / 1000,
      ...breadcrumb,
    };

    // 调用用户钩子，可以修改或返回 null 丢弃
    if (typeof beforeBreadcrumb === 'function') {
      try {
        crumb = beforeBreadcrumb(crumb);
      } catch {
        return;  // 钩子出错 → 丢弃面包屑
      }
      if (!crumb) return;
    }

    this.breadcrumbs.push(crumb);
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  getBreadcrumbs() {
    return [...this.breadcrumbs];
  }

  clearBreadcrumbs() {
    this.breadcrumbs = [];
  }

  setUser(userId, data = {}) {
    this.userId = userId;
    this.userData = { ...this.userData, ...data };
  }

  setTag(key, value) {
    this.tags[key] = value;
  }

  setExtra(key, value) {
    if (!this.extras) this.extras = {};
    this.extras[key] = value;
  }
}

export default Scope;
