const errorCollector = {
  name: 'error',

  setup(client) {
    //这句是在干什么
    this.client = client

    // 保存原始回调，后面 teardown 要还原
    this._originalOnError = window.onerror

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

  _onError(message, source, lineno, colno, error) {
    // message: 错误消息字符串                                                                                              
    // source: 出错文件 URL                                                                                                 
    // lineno: 行号                                                                                                         
    // colno: 列号                                                                                                          
    // error: Error 对象（有 stack）                                                                                        
    this._capture('js', { message, source, lineno, colno, stack: error?.stack });
  },

  _onResourceError(event) {
    const target = event.target
    // 资源加载失败时，event.target 是 DOM 元素（script/img/link）
    // JS 错误时，event 是 ErrorEvent，event.target 是 window
    if (!target || target === window) return  // 跳过 JS 错误
    this._capture('resource', {
      tagName: target.tagName,
      url: target.src || target.href,
    })
  },

  _onRejection(event) {
    const reason = event.reason;
    this._capture('promise', {
      message: reason?.message,
      stack: reason?.stack,
    })
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