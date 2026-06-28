// 入口文件：封装组装流程，对外暴露简洁 API
import MonitorClient from './client/index.js';
import errorCollector from './collector/error.js';
import performanceCollector from './collector/performance.js';
import behaviorCollector from './collector/behavior/index.js';
import rrwebPlugin from './plugins/rrweb.js';
import { createVuePlugin } from './frameworks/vue.js';
import { createErrorBoundary } from './frameworks/react.js';
import { createAngularErrorHandler } from './frameworks/angular.js';

function init(options = {}) {
  const client = new MonitorClient(options);
  client.addCollector('error', errorCollector);
  client.addCollector('performance', performanceCollector);
  client.addCollector('behavior', behaviorCollector);
  client.use(rrwebPlugin);
  client.start();
  return client;
}

export { MonitorClient, init, createVuePlugin, createErrorBoundary, createAngularErrorHandler };
export default { MonitorClient, init };