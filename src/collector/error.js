const errorCollector = {
  name: 'error',

  setup(client) {
    //这句是在干什么
    this.client = client

    // 保存原始回调，后面 teardown 要还原
    this._originalOnError = window.onerror

    // 注册
    // 绑定 this，拿到函数引用后才能正确 removeEventListener
    this._onError = (message, source, lineno, colno, error) => {
      this._capture('js', { message, source, lineno, colno, stack: error?.stack });
    };

    this._onResourceError = (event) => {
      const target = event.target;
      if (!target || target === window) return;
      this._capture('resource', {
        tagName: target.tagName,
        url: target.src || target.href,
      });
    };

    this._onRejection = (event) => {
      const reason = event.reason;
      this._capture('promise', {
        message: reason?.message,
        stack: reason?.stack,
      });
    };

    // 注册
    window.onerror = this._onError;
    window.addEventListener('error', this._onResourceError, true);
    window.addEventListener('unhandledrejection', this._onRejection);
  },

  //移除监听
  teardown() {
    window.onerror = this._originalOnError;
    window.removeEventListener('error', this._onResourceError, true);
    window.removeEventListener('unhandledrejection', this._onRejection);
  },

  // 内部：统一构建 event 并交给 client                                                                                   
  _capture(type, data) {
    this.client.capture({
      type: 'error',
      subType: type,
      timestamp: Date.now(),
      data: data,
    });
  }
}