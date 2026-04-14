import eventBus from '../core/eventBus';

let rrweb = null;

async function loadRrweb() {
  try {
    const module = await import('rrweb');
    rrweb = module;
  } catch (error) {
    console.warn('rrweb not found, session replay will not be available');
  }
}

class SessionReplay {
  constructor(config) {
    this.config = config;
    this.recorder = null;
    this.events = [];
    this.isRecording = false;
    this.lastErrorTime = 0;
    this.autoStopTimer = null;
  }
  
  init() {
    if (!this.config.advanced.enableSessionReplay) return;
    
    // 加载 rrweb 模块
    if (!rrweb) {
      loadRrweb();
    }
    
    // 采样决定是否启用录屏
    if (Math.random() > this.config.advanced.sessionReplaySampleRate) {
      return;
    }
    
    // 监听错误事件，错误发生前后录制
    eventBus.on('error:captured', () => {
      this.lastErrorTime = Date.now();
      
      // 如果没有在录制，开始录制
      if (!this.isRecording) {
        this.startRecording();
      }
      
      // 重置自动停止计时器
      this.resetAutoStopTimer();
    });
    
    eventBus.emit('advanced:sessionReplay:initialized');
  }
  
  startRecording() {
    if (this.isRecording || !this.config.serverUrl) return;
    
    if (!rrweb) {
      loadRrweb().then(() => {
        if (rrweb && rrweb.record) {
          this._doStartRecording();
        }
      });
      return;
    }
    
    if (!rrweb.record) return;
    
    this._doStartRecording();
  }
  
  _doStartRecording() {
    if (this.isRecording) return;
    
    this.isRecording = true;
    this.events = [];
    
    this.recorder = rrweb.record({
      emit: (event) => {
        this.events.push(event);
        
        if (this.events.length > 1000) {
          this.events.shift();
        }
      },
      recordCanvas: false,
      maskAllInputs: true,
      blockSelector: '.monitor-block',
      ignoreClass: 'monitor-ignore',
      maskTextSelector: 'input, textarea, [data-monitor-mask]'
    });
    
    eventBus.emit('advanced:sessionReplay:started');
  }
  
  stopRecording() {
    if (!this.isRecording || !this.recorder) return;
    
    this.recorder(); // 停止录制
    this.recorder = null;
    this.isRecording = false;
    
    // 清除自动停止计时器
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    
    eventBus.emit('advanced:sessionReplay:stopped');
  }
  
  resetAutoStopTimer() {
    // 清除现有计时器
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    
    // 设置新的自动停止计时器（错误发生后10秒停止录制）
    this.autoStopTimer = setTimeout(() => {
      this.stopRecording();
      this.reportSessionReplay();
    }, 10000);
  }
  
  reportSessionReplay() {
    if (this.events.length === 0 || !this.config.serverUrl) return;
    
    const data = {
      type: 'session-replay',
      timestamp: Date.now(),
      lastErrorTime: this.lastErrorTime,
      events: this.events,
      duration: this.events.length > 1 ? 
        this.events[this.events.length - 1].timestamp - this.events[0].timestamp : 0
    };
    
    // 直接上报，不经过队列，因为数据较大
    this.report(data);
    
    // 清空事件
    this.events = [];
  }
  
  report(data) {
    // 直接从核心模块获取会话ID和用户ID
    let sessionId = '';
    let userId = '';
    
    // 临时存储回调返回值的方法
    eventBus.once('core:getSessionId', (id) => {
      sessionId = id;
    });
    eventBus.once('core:getUserId', (id) => {
      userId = id;
    });
    
    // 触发事件
    eventBus.emit('core:requestSessionId');
    eventBus.emit('core:requestUserId');
    
    const reportData = {
      appKey: this.config.appKey,
      sessionId,
      userId,
      data,
      timestamp: Date.now()
    };
    
    // 仅在配置了serverUrl时上报
    if (this.config.serverUrl) {
      try {
        const serializedData = JSON.stringify(reportData);
        
        // 使用beacon或fetch上报（不使用image，因为数据量大）
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`${this.config.serverUrl}/session-replay`, serializedData);
        } else {
          fetch(`${this.config.serverUrl}/session-replay`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: serializedData,
            credentials: 'include',
            keepalive: true
          }).catch(err => {
            console.warn('Failed to report session replay data:', err);
          });
        }
      } catch (error) {
        console.warn('Error serializing session replay data:', error);
      }
    }
  }
  
  getEvents() {
    return [...this.events];
  }
  
  isActive() {
    return this.isRecording;
  }
  
  destroy() {
    this.stopRecording();
    eventBus.off('error:captured');
    eventBus.emit('advanced:sessionReplay:destroyed');
  }
}

export default SessionReplay;