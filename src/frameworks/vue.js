// Vue 2 / Vue 3 错误捕获插件
// 用法：
//   Vue 2: Vue.use(createVuePlugin(monitor))
//   Vue 3: app.use(createVuePlugin(monitor))

export function createVuePlugin(client) {
    let originalErrorHandler = null;

    return {
        install(app) {
            // Vue 3: app 是 { config: { errorHandler } }
            // Vue 2: app 是 Vue 构造函数，也有 Vue.config.errorHandler
            const config = app.config;
            if (!config) return;

            originalErrorHandler = config.errorHandler;

            config.errorHandler = (err, instance, info) => {
                client.captureError(err instanceof Error ? err : new Error(String(err)), {
                    data: {
                        framework: 'vue',
                        info: typeof info === 'string' ? info : '',
                    },
                });
                // 调用原有 handler
                if (originalErrorHandler) {
                    originalErrorHandler.call(app, err, instance, info);
                }
            };
        },

        // 恢复原始 errorHandler，防止内存泄漏
        uninstall(app) {
            const config = app?.config;
            if (config) {
                config.errorHandler = originalErrorHandler;
            }
        },
    };
}
