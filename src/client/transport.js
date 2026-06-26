//发送请求
class Transport {
    constructor(options) {
        this.url = options.dsn
        this.queue = []
        this.batchSize = options.batchSize
        this.batchInterval = options.batchInterval
        this.timer = null
        this.retryCount = options.retryCount
        this.retryDelay = options.retryDelay
    }

    //外部调用，收集外部传入内容并发出
    send(event) {
        this.queue.push(event)
        if (this.queue.length >= this.batchSize) {
            this._flush()
        } else {
            clearTimeout(this.timer)
            this.timer = setTimeout(() => this._flush(), this.batchInterval)
        }
    }

    //内部真正发出的部分
    _flush() {
        const batch = this.queue.splice(0, this.batchSize)
        if (batch.length === 0) return
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }
        const data = JSON.stringify(batch)
        this._deliver(data)
    }

    //发送请求
    async _deliver(data) {
        const response = await this._sendByFetch(data)
        if (response && response.ok) return
        if (response && response.status >= 400 && response.status < 500) {
            return  // 4xx 直接丢弃，不重试
        }
        if (this._sendByBeacon(data)) return
        this._retry(data, 1)
    }

    _sendByImage(data) {
        const img = new Image()
        const encoded = encodeURIComponent(data)
        img.src = `${this.url}?data=${encoded}`
        return
    }

    _sendByFetch(data) {
        try {
            const response = await fetch(this.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: data,
            });
            return response
        } catch (error) {
            // 网络错误
            return null
        }
    }

    _sendByBeacon(data) {
        const blob = new Blob([data], { type: 'application/json' })
        if (navigator.sendBeacon) {
            return navigator.sendBeacon(this.url, blob);
        }
        return false
    }

    //重试
    async _retry(data, attempt) {
        if (attempt > this.retryCount) {
            return
        }
        const delay = this.retryDelay * Math.pow(2, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, delay));

        const response = await this._sendByFetch(data);
        if (response && response.ok) return;
        if (this._sendByBeacon(data)) return;

        //做最后一次重试
        if (attempt === this.retryCount) {
            this._sendByImage(data);
            return;
        }
        this._retry(data, attempt + 1);
    }

    destroy() {
        // 清除定时器，避免销毁后还触发 flush
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        // 把队列里剩下的数据最后发一次
        if (this.queue.length > 0) {
            this._sendByBeacon(JSON.stringify(this.queue))  // 同步、可靠
            this.queue = []
        }
    }


    /*  1. 为什么要分成三个函数？

  三个函数各管一种发送方式，职责单一。调用方 _deliver 和 _retry 不需要知道每种方式的具体实现，只需要调函数名。如果以后要换掉
  image 降级（比如换成 XHR），只改 _sendByImage 一个地方，不用动 _deliver。

  你也可以合并成一个函数，用 if-else 分支，但那样读起来是一大坨。

  ---
  2. 为什么 beacon 要用 Blob？

  sendBeacon 如果不包 Blob，传普通字符串：

  navigator.sendBeacon(this.url, data);

  浏览器会把 Content-Type 设成 text/plain，后端收到的请求头不对。包 Blob 可以指定 application/json，后端才能正确解析。

  ---
  3. 降级方式是不是太草率了？

  不草率，这是标准的 SDK 上报策略。Sentry、Baidu Tongji 都是这个链路：

  ┌────────────┬────────────────┬────────────────────────────┐
  │    方式    │      时机      │            限制            │
  ├────────────┼────────────────┼────────────────────────────┤
  │ fetch POST │ 正常情况       │ 页面关闭时可能被浏览器取消 │
  ├────────────┼────────────────┼────────────────────────────┤
  │ sendBeacon │ fetch 不可用时 │ 无 response，64KB 限制     │
  ├────────────┼────────────────┼────────────────────────────┤
  │ Image      │ 终极兜底       │ URL 长度限制 ~2000 字符    │
  └────────────┴────────────────┴────────────────────────────┘

  为什么 Image 作为终极兜底？因为 <img> 标签发请求不受跨域限制，不受页面卸载影响，浏览器兼容性 100%。

  ---
  4. 和成熟项目对比怎么样？

  骨架是对的。差的东西：
  - 没有做请求去重/压缩
  - 没有做队列溢出保护（maxQueueSize）
  - 没有处理 reportMethod 配置（用户想指定只用 beacon）

  这些可以后面加，不影响当前结构。

  ---
  5. 为什么要 encodeURIComponent？

  Image 降级是把数据塞在 URL 查询参数里：

  https://example.com/api?data={"type":"error",...}

  JSON 里有 {、"、空格这些字符，直接拼 URL 会破坏格式。encodeURIComponent 把它们转义成 %7B、%22 这种安全形式。
 */
}