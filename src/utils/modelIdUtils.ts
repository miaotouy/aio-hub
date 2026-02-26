/**
 * 模型 ID 处理工具函数
 * 
 * 解决模型 ID 中可能包含冒号 (如 local:llama3:latest) 导致的分割问题。
 * 标准格式为: profileId:modelId
 */

/**
 * 已知的 Profile ID 前缀
 */
const KNOWN_PROFILE_PREFIXES = ["llm-profile-", "ocr-profile-", "embedding-profile-", "tts-profile-"];

/**
 * 从 comboId (profileId:modelId) 中提取纯模型 ID
 *
 * 逻辑:
 * 1. 优先识别已知前缀，找到第一个冒号，后面部分全部视为模型 ID
 * 2. 如果没有已知前缀，但包含冒号，也采取“第一个冒号分割”策略（因为 profileId 通常不带冒号）
 */
export function getPureModelId(comboId: string | null | undefined): string {
  if (!comboId) return "";

  // 检查是否包含已知前缀
  const hasKnownPrefix = KNOWN_PROFILE_PREFIXES.some((prefix) => comboId.startsWith(prefix));

  if (hasKnownPrefix) {
    const firstColonIndex = comboId.indexOf(":");
    if (firstColonIndex !== -1) {
      // 返回第一个冒号之后的所有内容
      return comboId.substring(firstColonIndex + 1);
    }
  }

  // 如果没有已知前缀，但包含冒号，也采取“第一个冒号分割”策略
  const firstColonIndex = comboId.indexOf(":");
  if (firstColonIndex !== -1) {
    return comboId.substring(firstColonIndex + 1);
  }

  return comboId;
}

/**
 * 提取 Profile ID (冒号前部分)
 */
export function getProfileId(comboId: string | null | undefined): string {
  if (!comboId) return "";

  // 寻找第一个冒号
  const firstColonIndex = comboId.indexOf(":");
  if (firstColonIndex !== -1) {
    return comboId.substring(0, firstColonIndex);
  }

  // 如果没有冒号，则整个字符串可能是 profileId (虽然不符合规范) 或者没有 profileId
  return comboId;
}

/**
 * 组合 Profile ID 和 Model ID
 */
export function buildModelCombo(profileId: string, modelId: string): string {
  if (!profileId) return modelId;
  return `${profileId}:${modelId}`;
}

/**
 * 解析组合 ID，返回 [profileId, modelId]
 */
export function parseModelCombo(comboId: string | null | undefined): [string, string] {
  if (!comboId) return ["", ""];
  return [getProfileId(comboId), getPureModelId(comboId)];
}

/**
 * 检查是否是组合 ID 格式
 */
export function isModelCombo(id: string | null | undefined): boolean {
  if (!id) return false;
  // 简单检查是否包含冒号且符合前缀规范
  return id.includes(":") && KNOWN_PROFILE_PREFIXES.some(prefix => id.startsWith(prefix));
}