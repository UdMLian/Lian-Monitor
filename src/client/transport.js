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

    async _sendByFetch(data) {
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

        if (attempt === this.retryCount) {
            this._sendByImage(data);
            return;
        }
        this._retry(data, attempt + 1);
    }

    destroy() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.queue.length > 0) {
            this._sendByBeacon(JSON.stringify(this.queue))
            this.queue = []
        }
    }
}

export default Transport;
