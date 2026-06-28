import { init } from 'lian-monitor';

const monitor = init({
  dsn: 'http://localhost:8787/report',
  debug: true,
  sampleRate: 1,
  release: '1.0.0',
  environment: 'development',
  behavior: {
    maxBreadcrumbs: 20,
    captureConsole: true,
  },
});

// 暴露到全局方便控制台调试
window.__monitor = monitor;

const output = document.getElementById('output');

function log(msg) {
  output.textContent = JSON.stringify(msg, null, 2) + '\n---\n' + output.textContent;
}

// 错误监控按钮
document.getElementById('btn-js-error').addEventListener('click', () => {
  const obj = undefined;
  obj.foo(); // eslint-disable-line
});

document.getElementById('btn-promise-error').addEventListener('click', () => {
  Promise.reject(new Error('Promise 异步错误测试'));
});

document.getElementById('btn-console-error').addEventListener('click', () => {
  console.error(new Error('console.error 错误测试'));
});

document.getElementById('btn-manual-error').addEventListener('click', () => {
  monitor.captureError(new Error('手动上报的错误'), {
    data: { scene: 'demo', userId: 'test-user' },
  });
  log({ action: 'captureError', message: '手动上报的错误' });
});

// 自定义事件按钮
document.getElementById('btn-custom-event').addEventListener('click', () => {
  monitor.captureEvent('button-click', { buttonId: 'btn-custom-event', label: '自定义事件' });
  log({ action: 'captureEvent', data: { buttonId: 'btn-custom-event' } });
});

document.getElementById('btn-custom-perf').addEventListener('click', () => {
  const start = performance.now();
  // 模拟一些工作
  let sum = 0;
  for (let i = 0; i < 1000000; i++) sum += i;
  monitor.capturePerformance('heavy-calculation', { duration: performance.now() - start, iterations: 1000000 });
  log({ action: 'capturePerformance', duration: (performance.now() - start).toFixed(2) + 'ms' });
});

document.getElementById('btn-breadcrumb').addEventListener('click', () => {
  monitor.addBreadcrumb('用户点击了面包屑按钮', { area: 'demo', timestamp: Date.now() });
  log({ action: 'addBreadcrumb', message: '面包屑已添加' });
});

// 导航
document.getElementById('btn-pushstate').addEventListener('click', () => {
  history.pushState({ page: 1 }, '', '/page/1');
  log({ action: 'pushState', url: '/page/1' });
});
