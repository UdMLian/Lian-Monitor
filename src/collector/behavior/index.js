/**
 * Behavior Collector — 用户行为采集
 *
 * 采集点击、路由跳转、网络请求、页面进入/离开、控制台输出、键盘操作，
 * 统一写入面包屑。BehaviorCollector 不调 client.capture()，
 * 它只存面包屑，等错误发生时由 _enrichment 来取。
 */
import { setupClick, teardownClick } from './click.js';
import { setupRoute, teardownRoute } from './route.js';
import { setupXHR, teardownXHR, setupFetch, teardownFetch } from './network.js';
import { setupPageView, teardownPageView } from './page-view.js';
import { setupConsole, teardownConsole } from './console.js';
import { setupKeypress, teardownKeypress } from './keypress.js';
import {
  isOwnReportUrl,
  getSelector,
  serializeElement,
  sanitizeUrl,
  sanitizeArg,
} from './utils.js';

const behaviorCollector = {
  name: 'behavior',

  setup(client) {
    this.client = client;

    // 挂载共享工具函数
    this._isOwnReportUrl = isOwnReportUrl;
    this._getSelector = getSelector;
    this._serializeElement = serializeElement;
    this._sanitizeUrl = sanitizeUrl;
    this._sanitizeArg = sanitizeArg;

    setupClick(this);
    setupRoute(this);
    setupXHR(this);
    setupFetch(this);
    setupPageView(this);
    setupConsole(this);
    setupKeypress(this);
  },

  teardown() {
    teardownClick(this);
    teardownRoute(this);
    teardownXHR(this);
    teardownFetch(this);
    teardownPageView(this);
    teardownConsole(this);
    teardownKeypress(this);
  },

  /** 内部调用：将面包屑写入 Scope（经过 beforeBreadcrumb 钩子） */
  addBreadcrumb(category, data, level = 'info') {
    this.client._addBreadcrumbWrapper({ category, level, data });
  },
};

// BehaviorCollector 不调 client.capture()，它只存面包屑，等错误发生时由 _enrichment 来取。

export default behaviorCollector;
