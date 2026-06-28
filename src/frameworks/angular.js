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

export function createAngularErrorHandler(client) {
  return class MonitorErrorHandler {
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
}
