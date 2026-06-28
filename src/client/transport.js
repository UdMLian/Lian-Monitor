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
        this.reportFields = options.reportFields || {}
        this.maxQueueSize = options.maxQueueSize || 50

        //服务端说暂停到这个时间
        this._rateLimitUntil = 0
    }

    //外部调用，收集外部传入内容并发出
    send(event) {
        // 队列溢出保护：超过上限丢弃最旧的事件
        while (this.queue.length >= this.maxQueueSize) {
            this.queue.shift()
        }
        this.queue.push(event)
        // 限速到期后自动 flush，防止队列死等
        if (this._isRateLimited()) {
            const remaining = this._rateLimitUntil - Date.now();
            if (remaining > 0) {
                clearTimeout(this.timer);
                this.timer = setTimeout(() => this._flush(), remaining);
            }
            return;
        }
        if (this.queue.length >= this.batchSize) {
            this._flush()
        } else {
            clearTimeout(this.timer)
            this.timer = setTimeout(() => this._flush(), this.batchInterval)
        }
    }

    //立即上报（错误专用）：beacon → fetch → image，不走队列
    sendImmediate(event) {
        if (this._isRateLimited()) {
            this.send(event);  // 降级到队列，等限速解除
            return;
        }
        const payload = JSON.stringify({ events: [event] })
        if (this._sendByBeacon(payload)) return
        this._sendByFetch(payload).catch(() => {
            this._sendByImage(payload)
        })
    }

    //内部真正发出的部分
    _flush() {
        const batch = this.queue.splice(0, this.batchSize)
        if (batch.length === 0) return
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }
        const payload = JSON.stringify({ events: batch })
        this._deliver(payload)
    }

    //发送请求
    async _deliver(data) {
        const response = await this._sendByFetch(data)
        this._handleRateLimit(response);
        if (response && response.ok) return
        // 4xx（429 除外）是客户端错误，重试没有意义，直接丢弃
        if (response && this._isClientError(response.status)) return
        if (this._sendByBeacon(data)) return
        this._retry(data, 1)
    }

    _isClientError(status) {
        return status >= 400 && status < 500 && status !== 429;
    }

    _handleRateLimit(response) {
        if (!response) return

        // Retry-After：秒数或 HTTP-date
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
            const seconds = /^\d+$/.test(retryAfter)
                ? parseInt(retryAfter, 10)
                : Math.max(0, (new Date(retryAfter).getTime() - Date.now()) / 1000);
            if (!isFinite(seconds)) return;  // ← 加这行，解析失败就不设
            this._rateLimitUntil = Date.now() + seconds * 1000;
        }

        // X-Sentry-Rate-Limits: retry_after:categories:scope
        const rateLimits = response.headers.get('X-Sentry-Rate-Limits');
        if (rateLimits) {
            for (const entry of rateLimits.split(',')) {
                const parts = entry.trim().split(':');
                const delay = parseInt(parts[0], 10);
                if (delay > 0) {
                    this._rateLimitUntil = Math.max(this._rateLimitUntil, Date.now() + delay * 1000);
                }
            }
        }
    }

    _isRateLimited() {
        return this._rateLimitUntil > 0 && Date.now() < this._rateLimitUntil;
    }

    _sendByImage(data) {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(this.reportFields)) {
            params.set(key, value);
        }
        params.set('data', encodeURIComponent(data));
        const img = new Image()
        img.src = `${this.url}?${params.toString()}`
        return
    }

    async _sendByFetch(data) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.requestTimeout ?? 10000);
            const headers = { 'Content-Type': 'application/json' }
            for (const [key, value] of Object.entries(this.reportFields)) {
                headers[key] = value
            }
            const response = await fetch(this.url, {
                method: 'POST',
                headers,
                body: data,
                signal: controller.signal,
            });
            clearTimeout(timer);
            return response
        } catch (error) {
            // 网络错误或超时（AbortError）
            return null
        }
    }

    /*  navigator.sendBeacon(url, blob)  // → true  |  false
 
  - true — 浏览器成功入队了（不保证送达，但保证会尝试）
  - false — 入队失败（URL 不对、数据太大、浏览器关闭中等）
   */

    _sendByBeacon(data) {
        try {
            const parsed = JSON.parse(data);
            const body = JSON.stringify({
                ...this.reportFields,
                ...parsed
            });
            const blob = new Blob([body], { type: 'application/json' });
            if (navigator.sendBeacon) {
                return navigator.sendBeacon(this.url, blob);
            }
            return false;
        } catch {
            return false;  // JSON 解析失败，静默降级
        }
    }

    //重试
    async _retry(data, attempt) {
        if (attempt > this.retryCount) {
            return
        }
        const delay = this.retryDelay * Math.pow(2, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, delay));

        const response = await this._sendByFetch(data);
        this._handleRateLimit(response);
        if (response && response.ok) return;
        // 4xx（429 除外）不重试
        if (response && this._isClientError(response.status)) return;
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
        this._flush();
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

export default Transport;
