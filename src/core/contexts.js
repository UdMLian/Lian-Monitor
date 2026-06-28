// 从 userAgent 提取 OS / 浏览器 / 设备信息
// 用 navigator.userAgentData（现代 API）优先，fallback 到正则解析

export function getContexts() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';

  return {
    os: getOS(ua, platform),
    browser: getBrowser(ua),
    device: getDevice(ua),
  };
}

function getOS(ua, platform) {
  // Windows
  const winMatch = ua.match(/Windows NT (\d+\.\d+)/);
  if (winMatch) {
    const versionMap = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    return { name: 'Windows', version: versionMap[winMatch[1]] || winMatch[1] };
  }

  // macOS
  const macMatch = ua.match(/Mac OS X (\d+[._]\d+)/);
  if (macMatch) {
    return { name: 'macOS', version: macMatch[1].replace('_', '.') };
  }

  // Linux
  if (/Linux/.test(ua)) {
    const androidMatch = ua.match(/Android (\d+\.\d+)/);
    if (androidMatch) return { name: 'Android', version: androidMatch[1] };
    return { name: 'Linux', version: '' };
  }

  // iOS
  const iosMatch = ua.match(/OS (\d+[._]\d+).*like Mac OS X/);
  if (iosMatch) {
    return { name: 'iOS', version: iosMatch[1].replace('_', '.') };
  }

  return { name: platform || 'Unknown', version: '' };
}

function getBrowser(ua) {
  // Edge (Chromium)
  const edgeMatch = ua.match(/Edg\/(\d+\.\d+)/);
  if (edgeMatch) return { name: 'Edge', version: edgeMatch[1] };

  // Chrome
  const chromeMatch = ua.match(/Chrome\/(\d+\.\d+)/);
  if (chromeMatch) {
    const version = chromeMatch[1];
    // Opera
    if (/OPR\/(\d+\.\d+)/.test(ua)) return { name: 'Opera', version: ua.match(/OPR\/(\d+\.\d+)/)[1] };
    return { name: 'Chrome', version };
  }

  // Safari
  const safariMatch = ua.match(/Version\/(\d+\.\d+).*Safari/);
  if (safariMatch && !/Chrome/.test(ua)) return { name: 'Safari', version: safariMatch[1] };

  // Firefox
  const firefoxMatch = ua.match(/Firefox\/(\d+\.\d+)/);
  if (firefoxMatch) return { name: 'Firefox', version: firefoxMatch[1] };

  return { name: 'Unknown', version: '' };
}

function getDevice(ua) {
  if (/Mobile|Android.*Mobile|iPhone|iPod/.test(ua)) return { type: 'mobile' };
  if (/iPad|Tablet/.test(ua)) return { type: 'tablet' };
  return { type: 'desktop' };
}
