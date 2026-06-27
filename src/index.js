// 入口文件：封装组装流程，对外暴露简洁 API
import MonitorClient from './client/index.js';
import errorCollector from './collector/error.js';
import performanceCollector from './collector/performance.js';
import behaviorCollector from './collector/behavior.js';
import rrwebPlugin from './plugins/rrweb.js';

function init(options = {}) {
  const client = new MonitorClient(options);
  client.addCollector('error', errorCollector);
  client.addCollector('performance', performanceCollector);
  client.addCollector('behavior', behaviorCollector);
  client.use(rrwebPlugin);
  client.start();
  return client;
}

export { MonitorClient, init };
export default { MonitorClient, init };