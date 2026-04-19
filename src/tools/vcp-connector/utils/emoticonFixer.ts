import { getEmoticonLibrary, getHttpBaseUrl, type EmoticonItem } from "../services/vcpEmoticonService";
import { useVcpStore } from "../stores/vcpConnectorStore";

/**
 * 修复输入中的 VCP 表情包 URL
 *
 * @param input - 单个 URL 或包含 URL 的全文本
 * @returns 修复后的字符串
 *
 * 调用位置: MessageContent.vue 的 resolveAsset 钩子
 * 约束: 必须同步返回（resolveAsset 是同步函数）
 */
export function fixVcpEmoticonUrl(input: string): string {
  const baseUrl = getHttpBaseUrl();
  if (!baseUrl) return input; // VCP 未配置，直接透传

  // 判断是否为单个 URL
  const isSingleUrl = /^https?:\/\/\S+$/.test(input.trim());

  if (isSingleUrl) {
    return fixSingleUrl(input.trim(), baseUrl);
  }

  // 全文本模式：替换所有匹配的 URL
  // 匹配 http(s)://... 中包含"表情包"的 URL
  return input.replace(/https?:\/\/[^\s"')\]]+/g, (url) => fixSingleUrl(url, baseUrl));
}

/**
 * 修复单个 VCP 表情包 URL
 */
function fixSingleUrl(url: string, baseUrl: string): string {
  // 1. host:port 必须匹配 VCP 地址（防止误伤其他图床）
  if (!url.startsWith(baseUrl)) return url;

  // 2. 路径必须含"表情包"字样（VCP 目录命名约定）
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    decoded = url;
  }
  if (!decoded.includes("表情包")) return url;

  // 3. 已有正确 pw= 且在清单中 → 直接返回
  const library = getEmoticonLibrary();
  if (library.length > 0 && library.some((item) => item.url === url)) {
    return url;
  }

  // 4. 尝试模糊匹配
  if (library.length > 0) {
    const best = findBestMatch(decoded, library);
    if (best) return best.url;
  }

  // 5. 降级：直接注入 pw= 参数
  return injectPwParam(url);
}

/**
 * 从 URL 中提取表情包分类名 (packageName) 和文件名 (filename)
 *
 * 采用 VCPChat `emoticonUrlFixer.js` 的三层容错解析策略（见附录 A）：
 *   Layer 1: `new URL().pathname`（标准 URL 解析，最健壮）
 *   Layer 2: `decodeURIComponent` + `split`（非标 URL 的降级）
 *   Layer 3: 原始 `split`（最终兜底，绝不抛出）
 */
function extractEmoticonInfo(url: string): { filename: string | null; packageName: string | null } {
  let filename: string | null = null;
  let packageName: string | null = null;

  if (!url) return { filename, packageName };

  // Layer 1: 标准 URL 对象解析
  try {
    const decodedPath = decodeURIComponent(new URL(url).pathname);
    const parts = decodedPath.split("/").filter(Boolean);
    if (parts.length > 0) filename = parts[parts.length - 1].split("?")[0];
    if (parts.length > 1) packageName = parts[parts.length - 2];
    return { filename, packageName };
  } catch {
    // Layer 2: decodeURIComponent + split
    try {
      const decoded = decodeURIComponent(url);
      const parts = decoded.split("/").filter(Boolean);
      if (parts.length > 0) filename = parts[parts.length - 1].split("?")[0];
      if (parts.length > 1) packageName = parts[parts.length - 2];
      return { filename, packageName };
    } catch {
      // Layer 3: 原始 split（最终兜底）
      const parts = url.split("/").filter(Boolean);
      if (parts.length > 0) filename = parts[parts.length - 1].split("?")[0];
      if (parts.length > 1) packageName = parts[parts.length - 2];
      return { filename, packageName };
    }
  }
}

/**
 * 模糊匹配算法
 *
 * 从 URL 中提取 packageName（倒数第 2 段路径）和 filename（最后一段），
 * 与清单中的条目计算加权相似度。
 */
function findBestMatch(decodedUrl: string, library: EmoticonItem[]): EmoticonItem | null {
  const { filename: urlFilename, packageName: urlPackage } = extractEmoticonInfo(decodedUrl);

  if (!urlFilename) return null;

  // 如果提取到的 packageName 本身是 pw=xxx 格式（被解析为路径段），跳过
  const cleanPackage = urlPackage?.match(/^pw=/) ? null : urlPackage;

  return findBestMatchWithSegments(cleanPackage ?? "", urlFilename, library);
}

function findBestMatchWithSegments(category: string, filename: string, library: EmoticonItem[]): EmoticonItem | null {
  let bestScore = 0;
  let bestItem: EmoticonItem | null = null;

  const categoryLower = category.toLowerCase();
  const filenameLower = filename.replace(/\.[^.]+$/, "").toLowerCase();

  for (const item of library) {
    const catSim = jaroWinklerSimilarity(categoryLower, item.category.toLowerCase());
    const fileSim = jaroWinklerSimilarity(filenameLower, item.searchKey);
    const score = 0.7 * catSim + 0.3 * fileSim;

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore > 0.6 ? bestItem : null;
}

/**
 * Jaro-Winkler 相似度算法（简化实现）
 */
function jaroWinklerSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler 前缀加成
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * 降级方案：直接在 URL 中注入 pw= 参数
 *
 * 注意：先剥离已有的错误 pw= 段，防止 double-pw 问题
 */
function injectPwParam(url: string): string {
  let imageKey: string;
  try {
    const store = useVcpStore();
    // 优先使用 Image Key，如果没有则回退到全局 Key
    imageKey = store.config.vcpImageKey || store.config.vcpKey;
  } catch {
    return url; // store 未初始化，无法注入
  }

  if (!imageKey) return url;

  // 剥离已有的错误 pw= 段
  let cleaned = url.replace(/\/pw=[^/]+\//, "/");

  // 在 /images/ 前插入正确的 pw=
  if (cleaned.includes("/images/")) {
    return cleaned.replace(/\/images\//, `/pw=${imageKey}/images/`);
  }

  return url; // 无法识别路径结构，原样返回
}