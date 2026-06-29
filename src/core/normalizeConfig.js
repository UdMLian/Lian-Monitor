/**
 * 配置兼容层：检测废弃参数并映射到新参数名
 *
 * 使用方式：
 *   当需要重命名配置项时，在 DEPRECATED_MAP 中添加映射，
 *   旧参数会在下个 major 版本移除。
 *
 * 示例：
 *   { batchSize: 'batch.size' }  →  用户传 batchSize 会被复制到 batch.size
 */

// 废弃参数名 → 新参数名（点号分隔嵌套路径）
const DEPRECATED_MAP = {
  // 未来示例：
  // batchSize: 'batch.size',
  // batchInterval: 'batch.interval',
};

/**
 * 按点号路径设置嵌套对象值
 * setNested(obj, 'batch.size', 5) → obj.batch = { size: 5 }
 */
function setNested(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

/**
 * 规范化用户配置：检测废弃参数，打印警告，迁移到新参数名
 * @param {Object} rawOptions - 用户传入的原始配置
 * @returns {Object} 规范化后的配置（不会修改原始对象）
 */
export function normalizeConfig(rawOptions) {
  const normalized = { ...rawOptions };

  for (const [oldKey, newPath] of Object.entries(DEPRECATED_MAP)) {
    if (oldKey in normalized) {
      const value = normalized[oldKey];
      console.warn(
        `[Monitor] DEPRECATED: "${oldKey}" is deprecated and will be removed in a future major version. ` +
        `Use "${newPath}" instead.`
      );
      // 只在用户没同时传新参数时迁移
      if (!(newPath in normalized)) {
        setNested(normalized, newPath, value);
      }
      delete normalized[oldKey];
    }
  }

  return normalized;
}
