/**
 * Behavior Collector 共享工具函数
 * 这些函数在 setup 时挂载到 collector 对象上，供各子模块通过 this 调用
 */

/**
 * 判断 URL 是否为 SDK 自己的上报地址，避免无限循环
 * @param {string} url - 待检查的 URL
 * @returns {boolean}
 */
export function isOwnReportUrl(url) {
  try {
    const dsn = this.client.options.dsn
    if (!dsn) return false
    const target = new URL(url, location.origin)
    const dsnUrl = new URL(dsn, location.origin)
    return target.origin === dsnUrl.origin && target.pathname === dsnUrl.pathname
  } catch {
    return false
  }
}

/**
 * 构建元素的 CSS 选择器（最多向上 5 层）
 * @param {Element} element - 目标 DOM 元素
 * @returns {string|null} 能唯一匹配的选择器，或 null
 */
export function getSelector(element) {
  if (!element || element === document.body) return null
  const parts = []
  let current = element
  let depth = 0
  const maxDepth = 5
  while (current && current !== document.body && current !== document.documentElement && depth < maxDepth) {
    let segment = current.tagName.toLowerCase()
    if (current.id) {
      parts.unshift(`#${current.id}`)
      break
    }
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        el => el.tagName === current.tagName
      )
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`
      }
    }

    parts.unshift(segment)
    current = current.parentElement
    depth++
  }
  const selector = parts.join('>')
  // 验证选择器能准确命中目标元素
  try {
    if (document.querySelector(selector) === element) {
      return selector;
    }
  } catch {
    // 非法选择器（极少见，如特殊字符 tagName）
  }
  return null;
}

/**
 * DOM 序列化：只捕获结构信息（标签、id、class、关键属性名），不含文本内容和 URL 参数
 * @param {Element} element - 目标 DOM 元素
 * @returns {string|null} 序列化后的 HTML 字符串
 */
export function serializeElement(element) {
  if (!element || element === document.body) return null;
  try {
    const tag = element.tagName.toLowerCase();
    let html = `<${tag}`;
    if (element.id) html += `#${element.id}`;
    if (element.className && typeof element.className === 'string') {
      const cls = element.className.trim();
      if (cls) html += `.${cls.split(/\s+/).join('.')}`;
    }
    // 只记录属性名，不记录值（href/src 去查询参数后截断）
    const attrs = ['type', 'name', 'placeholder', 'alt', 'title', 'role'];
    for (const attr of attrs) {
      const val = element.getAttribute(attr);
      if (val) html += `[${attr}="${val.substring(0, 20)}"]`;
    }
    // href/src 去查询参数和 hash
    for (const attr of ['href', 'src']) {
      let val = element.getAttribute(attr);
      if (val) {
        try {
          const u = new URL(val, location.origin);
          val = u.origin + u.pathname;
        } catch { /* 非标准 URL，直接用 */ }
        html += `[${attr}="${val.substring(0, 80)}"]`;
      }
    }
    html += '>';
    // 不捕获 textContent：可能包含用户敏感信息
    html += `</${tag}>`;
    if (html.length > 512) html = html.substring(0, 509) + '...';
    return html;
  } catch {
    return null;
  }
}

/**
 * URL 脱敏：去掉 token/secret 等敏感查询参数
 * @param {string} url - 原始 URL
 * @returns {string} 脱敏后的 URL
 */
export function sanitizeUrl(url) {
  try {
    const u = new URL(url, location.origin);
    const sensitiveParams = ['token', 'secret', 'password', 'api_key', 'apikey', 'auth', 'authorization', 'access_token'];
    for (const param of sensitiveParams) {
      if (u.searchParams.has(param)) {
        u.searchParams.set(param, '[REDACTED]');
      }
    }
    return u.origin + u.pathname + u.search;
  } catch {
    return url;
  }
}

/**
 * 脱敏序列化：敏感 key 替换为 [REDACTED]，限制深度和长度
 * @param {*} arg - 待序列化的值
 * @param {number} [depth=0] - 当前递归深度
 * @returns {*} 脱敏后的值
 */
export function sanitizeArg(arg, depth = 0) {
  const MAX_DEPTH = 3;
  const MAX_STRING = 200;
  const MAX_ARRAY = 10;
  // 敏感 key 模式：token、secret、password 等
  const SENSITIVE_RE = /^(token|secret|password|authorization|api_?key|api_?secret|credential|private_?key|access_?token)$/i;

  if (depth > MAX_DEPTH) return '[MaxDepth]';

  try {
    if (arg instanceof Error) {
      return (arg.message || '') + '\n' + (arg.stack || '');
    }

    if (arg === null || arg === undefined) return arg;

    if (typeof arg === 'string') {
      return arg.length > MAX_STRING ? arg.substring(0, MAX_STRING) + '...' : arg;
    }

    if (typeof arg !== 'object') return String(arg);

    if (Array.isArray(arg)) {
      return arg.slice(0, MAX_ARRAY).map(item => sanitizeArg(item, depth + 1));
    }

    // Plain object：遍历 key，敏感的替换为 [REDACTED]
    const result = {};
    for (const key of Object.keys(arg)) {
      if (SENSITIVE_RE.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeArg(arg[key], depth + 1);
      }
    }
    return result;
  } catch {
    return '[Unserializable]';
  }
}
