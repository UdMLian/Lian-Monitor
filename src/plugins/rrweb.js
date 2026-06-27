const rrwebPlugin = {
    name: 'rrweb',
    setup(client) {
        this.client = client
        // 环形缓冲区：只保留最近的事件
        this._events = []
        this._maxEvents = 80

        // 通过 middleware 把录屏数据附到错误事件上
        // 不清空缓冲区：连续错误共享录屏数据（环形缓冲区自动淘汰旧数据）
        this._middleware = (event) => {
            if (event.type === 'error' && this._events.length > 0) {
                event.rrweb = this._events.slice()
            }
            return event
        }

        client.use(this._middleware)
        this._startRecording()
    },

    async _startRecording() {
        try {
            const { record } = await import('rrweb')
            this._stopFn = record({
                emit: (event) => {
                    this._events.push(event)
                    if (this._events.length > this._maxEvents) {
                        this._events.shift()
                    }
                },
                sampling: {
                    // 不记录鼠标移动（数据量太大）
                    mousemove: false,
                    // 滚动事件节流 150ms
                    scroll: 150,
                },
                //脱敏配置
                maskAllInputs: true,
                maskTextClass: 'rr-mask',     // class="rr-mask" 的文本变 ***
                blockClass: 'rr-block',        // class="rr-block" 的整个元素遮挡
                maskInputOptions: {
                    password: true,               // 密码始终遮蔽（默认）
                },
            })
        } catch (e) {

        }
    },

    teardown() {
        if (this._stopFn) this._stopFn();
        this._events = [];
    },
};

export default rrwebPlugin;