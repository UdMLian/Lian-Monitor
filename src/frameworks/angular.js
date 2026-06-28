// Angular ErrorHandler 工厂函数
// 用法：
//   import { ErrorHandler } from '@angular/core'
//   import { createAngularErrorHandler } from 'lian-monitor'
//
//   @NgModule({
//     providers: [
//       { provide: ErrorHandler, useFactory: () => createAngularErrorHandler(monitor) }
//     ]
//   })

let _MonitorErrorHandler = null;

export function createAngularErrorHandler(client) {
  // 复用已创建的 class，避免每次调用创建新 class
  if (_MonitorErrorHandler) return _MonitorErrorHandler;

  _MonitorErrorHandler = class MonitorErrorHandler {
    handleError(error) {
      // Angular 错误对象可能包装了一层，取原始错误
      const err = error.originalError || error;
      client.captureError(err instanceof Error ? err : new Error(String(err)), {
        data: {
          framework: 'angular',
          ngModule: error.ngModule || '',
        },
      });
      // 仍然输出到控制台
      console.error(err);
    }
  };

  return _MonitorErrorHandler;
}
