class Scope {
  constructor(maxBreadcrumbs = 20) {
    this.breadcrumbs = [];
    this.maxBreadcrumbs = maxBreadcrumbs;
    this.userId = null;
    this.userData = {};
    this.tags = {};
  }

  addBreadcrumb(breadcrumb) {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: Date.now(),
    });
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
