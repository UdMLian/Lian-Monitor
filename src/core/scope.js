class Scope {
  constructor() {
    this.breadcrumbs = [];
    this.maxBreadcrumbs = 20;
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
}

export default Scope;
