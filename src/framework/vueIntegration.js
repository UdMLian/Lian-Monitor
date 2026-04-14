import eventBus from '../core/eventBus';

class VueIntegration {
  constructor(config) {
    this.config = config;
    this.originalErrorHandler = null;
  }
  
  install(Vue) {
    if (!Vue) return;
    
    this.originalErrorHandler = Vue.config.errorHandler;
    
    Vue.config.errorHandler = (err, vm, info) => {
      // 捕获Vue组件错误
      const errorData = {
        type: 'vue',
        message: err?.message || 'Unknown Vue error',
        componentName: vm?.constructor?.name || 'Unknown component',
        info,
        stack: err?.stack,
        error: err,
        vm: {
          propsData: vm?.$options?.propsData,
          route: vm?.$route ? {
            path: vm.$route.path,
            name: vm.$route.name,
            params: vm.$route.params,
            query: vm.$route.query
          } : undefined
        }
      };
      
      eventBus.emit('error:captured', errorData);
      
      // 调用原始的错误处理函数
      if (this.originalErrorHandler) {
        this.originalErrorHandler(err, vm, info);
      }
    };
    
    // 添加全局混入，捕获生命周期钩子错误
    Vue.mixin({
      beforeCreate() {
        if (this.$options.methods) {
          // 包装方法以捕获错误
          Object.keys(this.$options.methods).forEach(methodName => {
            const originalMethod = this.$options.methods[methodName];
            if (typeof originalMethod === 'function') {
              this.$options.methods[methodName] = (...args) => {
                try {
                  return originalMethod.apply(this, args);
                } catch (err) {
                  const errorData = {
                    type: 'vue-method',
                    message: err?.message || 'Unknown Vue method error',
                    componentName: this.$options.name || 'Unknown component',
                    methodName,
                    stack: err?.stack,
                    error: err
                  };
                  
                  eventBus.emit('error:captured', errorData);
                  throw err;
                }
              };
            }
          });
        }
      }
    });
    
    eventBus.emit('framework:vue:integrated');
  }
  
  uninstall(Vue) {
    if (!Vue) return;
    
    if (this.originalErrorHandler) {
      Vue.config.errorHandler = this.originalErrorHandler;
      this.originalErrorHandler = null;
    }
    
    eventBus.emit('framework:vue:unintegrated');
  }
}

export default VueIntegration;