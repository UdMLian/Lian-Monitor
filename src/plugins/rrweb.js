/**
 * rrweb SessionReplay 插件
 * 录制用户操作，错误发生时附带录屏数据用于回溯现场。
 * 配置通过 client.options.rrweb 传入，所有字段均有默认值。
 */
const rrwebPlugin = {
    name: 'rrweb',

    setup(client) {
        this.client = client;
        const cfg = client.options.rrweb || {};

        if (cfg.enabled === false) return;

        // 环形缓冲区：只保留最近的事件
        this._events = [];
        this._maxEvents = cfg.maxEvents ?? 80;
        this._active = true;
        this._beforeEmit = cfg.beforeEmit || null;

        // 通过 middleware 把录屏数据附到指定事件上
        // 不清空缓冲区：连续错误共享录屏数据（环形缓冲区自动淘汰旧数据）
        this._middleware = (event) => {
            const attachTo = cfg.attachTo || ['error'];
            if (attachTo.includes(event.type) && this._events.length > 0) {
                event.rrweb = this._events.slice();
            }
            return event;
        };

        client.use(this._middleware);
        this._startRecording();

        // 最大录制时长：到时自动停止，防止长生命周期 SPA 无限录制
        if (cfg.maxDuration > 0) {
            this._maxDurationTimer = setTimeout(() => {
                this.stopRecording();
            }, cfg.maxDuration);
        }
    },

    async _startRecording() {
        const cfg = this.client.options.rrweb || {};
        try {
            const { record } = await import('rrweb');
            if (!this._active) return;  // import 完成前已关闭就退出

            this._stopFn = record({
                emit: (event) => {
                    if (this._beforeEmit) {
                        try {
                            const filtered = this._beforeEmit(event);
                            if (!filtered) return;
                            event = filtered;
                        } catch {
                            return;  // 钩子出错 → 丢弃该帧
                        }
                    }
                    this._events.push(event);
                    if (this._events.length > this._maxEvents) {
                        this._events.shift();
                    }
                },
                // 采样配置
                sampling: {
                    mousemove: false,          // 不记录鼠标移动（数据量太大）
                    scroll: 150,               // 滚动事件节流 150ms
                    ...(cfg.sampling || {}),
                },
                // 定期生成全量快照，保证回放不依赖从头播放
                checkoutEveryNms: cfg.checkoutEveryNms,
                checkoutEveryNth: cfg.checkoutEveryNth,
                // 脱敏配置
                maskAllInputs: cfg.maskAllInputs ?? true,
                maskTextClass: cfg.maskTextClass || 'rr-mask',       // class="rr-mask" 的文本变 ***
                blockClass: cfg.blockClass || 'rr-block',            // class="rr-block" 的整个元素遮挡
                maskInputOptions: {
                    password: true,                                    // 密码始终遮蔽
                    ...(cfg.maskInputOptions || {}),
                },
                recordCanvas: cfg.recordCanvas ?? false,
                recordCrossOriginIframes: cfg.recordCrossOriginIframes ?? false,
                inlineStylesheet: cfg.inlineStylesheet ?? true,
                packFn: cfg.packFn || undefined,
            });
        } catch (e) {
            if (this.client?.options?.debug) {
                console.warn('[Monitor] rrweb failed to load:', e.message);
            }
        }
    },

    /** 手动启动录制（teardown 后重新开始） */
    startRecording() {
        if (this._stopFn) return;  // 已启动
        this._active = true;
        this._startRecording();
    },

    /** 手动停止录制 */
    stopRecording() {
        if (this._stopFn) {
            this._stopFn();
            this._stopFn = null;
        }
    },

    teardown() {
        this._active = false;
        if (this._stopFn) this._stopFn();
        if (this._maxDurationTimer) clearTimeout(this._maxDurationTimer);
        this._events = [];
    },
};

export default rrwebPlugin;
