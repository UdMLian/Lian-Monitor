class EventBus {
  constructor() {
    this.events = {};
  }
  
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    return this;
  }
  
  once(event, callback) {
    const onceCallback = (...args) => {
      callback(...args);
      this.off(event, onceCallback);
    };
    return this.on(event, onceCallback);
  }
  
  off(event, callback) {
    if (!this.events[event]) return this;
    
    if (!callback) {
      delete this.events[event];
      return this;
    }
    
    this.events[event] = this.events[event].filter(cb => cb !== callback);
    return this;
  }
  
  emit(event, ...args) {
    if (!this.events[event]) return this;
    
    this.events[event].forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
      }
    });
    return this;
  }
  
  clear() {
    this.events = {};
    return this;
  }
}

export default new EventBus();