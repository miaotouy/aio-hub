/**
 * 知识库工具函数
 */

/**
 * 已知的 Profile ID 前缀
 */
const KNOWN_PROFILE_PREFIXES = ["llm-profile-", "ocr-profile-"];

/**
 * 从 comboId (profileId:modelId) 中提取纯模型 ID
 *
 * 逻辑优化:
 * 1. 优先识别已知前缀，找到第一个冒号，后面部分全部视为模型 ID
 * 2. 避免误伤模型 ID 中自带冒号的情况 (如 local:llama3:latest)
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

  // 如果没有前缀或没有冒号，回退到旧逻辑或返回原值
  const parts = comboId.split(":");
  return parts.length > 1 ? parts.slice(1).join(":") : comboId;
}

/**
 * 提取 Profile ID (冒号前部分)
 */
export function getProfileId(comboId: string | null | undefined): string {
  if (!comboId) return "";

  // 检查是否包含已知前缀
  const hasKnownPrefix = KNOWN_PROFILE_PREFIXES.some((prefix) => comboId.startsWith(prefix));

  if (hasKnownPrefix) {
    const firstColonIndex = comboId.indexOf(":");
    if (firstColonIndex !== -1) {
      return comboId.substring(0, firstColonIndex);
    }
  }

  // 回退逻辑
  const parts = comboId.split(":");
  return parts[0];
}

/**
 * 计算文本的 SHA-256 哈希值
 */
export async function calculateHash(text: string): Promise<string> {
  if (!text) return "";
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 格式化标签 (去除空格，转小写等)
 */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 从内容中提取标签
 * 匹配格式: Tag: xxx, yyy 或 标签: xxx, yyy
 */
export function extractTagsFromContent(content: string): string[] {
  if (!content) return [];

  // 匹配 Tag: 或 标签: 开头的行 (忽略大小写)
  // 支持多种分隔符: 逗号 (中英文), 分号 (中英文), 空格
  const regex = /^(?:tags?|标签)\s*[:：]\s*(.+)$/im;
  const match = content.match(regex);

  if (match && match[1]) {
    const tagsStr = match[1].trim();
    // 使用正则拆分多种分隔符 (不再使用空格拆分，以支持带空格的标签)
    return tagsStr
      .split(/[,，;；]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  return [];
}

/**
 * 从内容中提取标题 (Markdown)
 * 匹配第一个 # 或 ### 等开头的行
 */
export function extractTitleFromContent(content: string): string | null {
  if (!content) return null;

  // 匹配第一个 Markdown 标题行
  const regex = /^#+\s+(.+)$/m;
  const match = content.match(regex);

  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}
