import { readDir, remove } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { reactive, watch } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { bytesToBase64 } from "@/utils/base64";
import { useAgentStorage } from "./useAgentStorage";

const logger = createModuleLogger("agent-manager/avatar");

/** 根目录中可能作为头像的图片扩展名；agent.json 等非图片文件天然被排除。 */
const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

const FILENAME_TIMESTAMP_PATTERNS = [
  /^avatar-(\d+)/,
  /^avatar_migrated_(\d+)/,
] as const;

/**
 * 与桌面端 `isLikelyFilename` 判定一致：icon 形如独立文件名
 * （含扩展名、无路径分隔与协议头）时视为私有目录中的头像文件。
 */
export function isAgentIconFilename(icon: string | undefined | null): boolean {
  if (!icon) return false;
  if (icon.startsWith("data:") || icon.includes("://")) return false;
  return (
    icon.includes(".") &&
    !icon.includes("/") &&
    !icon.includes("\\") &&
    !icon.includes(":")
  );
}

function isImageFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function filenameTimestamp(filename: string): number {
  for (const pattern of FILENAME_TIMESTAMP_PATTERNS) {
    const match = filename.match(pattern);
    if (match) return Number.parseInt(match[1], 10);
  }
  return 0;
}

function guessMime(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const extension =
    dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/**
 * 模块级 dataURL LRU 缓存（key 为 `${agentId}/${filename}`，跨视图共享）。
 * 上限 32 条：单头像通常几十至几百 KB，防止 Agent 数量增长后 base64 无限常驻内存。
 */
const DATA_URL_CACHE_MAX = 32;
const dataUrlCache = new Map<string, string>();

function cacheKey(agentId: string, filename: string): string {
  return `${agentId}/${filename}`;
}

function cacheGet(key: string): string | undefined {
  const value = dataUrlCache.get(key);
  if (value !== undefined) {
    // Map 迭代按插入序：命中后移到末尾实现 LRU。
    dataUrlCache.delete(key);
    dataUrlCache.set(key, value);
  }
  return value;
}

function cacheSet(key: string, value: string): void {
  dataUrlCache.delete(key);
  dataUrlCache.set(key, value);
  while (dataUrlCache.size > DATA_URL_CACHE_MAX) {
    const oldest = dataUrlCache.keys().next().value;
    if (oldest === undefined) break;
    dataUrlCache.delete(oldest);
  }
}

export interface AgentAvatarSource {
  id: string;
  icon?: string;
  avatarDataUrl?: string;
}

export interface AgentAvatarHistorySource {
  id: string;
  avatarHistory?: string[];
}

export function useAgentAvatar() {
  const storage = useAgentStorage();

  /**
   * 解析智能体头像的最终显示 URL。
   * 优先级与桌面端对齐：私有目录文件名（icon）→ 导入预览（avatarDataUrl）→
   * null（由调用方回退为 emoji/首字文本）。文件读取结果进入模块级缓存。
   */
  async function resolveAgentAvatarUrl(
    agent: AgentAvatarSource
  ): Promise<string | null> {
    const icon = agent.icon?.trim();
    if (icon && isAgentIconFilename(icon)) {
      const key = cacheKey(agent.id, icon);
      const cached = cacheGet(key);
      if (cached) return cached;
      try {
        const bytes = await storage.readAgentAsset(agent.id, icon);
        if (bytes?.length) {
          const dataUrl = `data:${guessMime(icon)};base64,${bytesToBase64(bytes)}`;
          cacheSet(key, dataUrl);
          return dataUrl;
        }
      } catch (error) {
        logger.warn("读取智能体头像文件失败，回退导入预览", {
          agentId: agent.id,
          icon,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (agent.avatarDataUrl?.startsWith("data:image/")) {
      return agent.avatarDataUrl;
    }
    return null;
  }

  /**
   * 列出可选的历史头像：合并 Agent 私有根目录中的图片文件与持久化的
   * `avatarHistory`，去重后按文件名时间戳倒序（与桌面端排序一致）。
   */
  async function listAvatarHistory(
    agent: AgentAvatarHistorySource
  ): Promise<string[]> {
    const found: string[] = [];
    try {
      const dir = await storage.getAgentDir(agent.id);
      const entries = await readDir(dir);
      for (const entry of entries) {
        if (entry.isFile && entry.name && isImageFilename(entry.name)) {
          found.push(entry.name);
        }
      }
    } catch (error) {
      logger.warn("读取智能体头像历史目录失败", {
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const merged = new Set([...(agent.avatarHistory ?? []), ...found]);
    return Array.from(merged).sort((a, b) => {
      const timeA = filenameTimestamp(a);
      const timeB = filenameTimestamp(b);
      if (timeA && timeB) return timeB - timeA;
      return b.localeCompare(a);
    });
  }

  /**
   * 将用户选择的图片保存为 Agent 私有头像文件（`agents/{id}/avatar-{ts}.{ext}`），
   * 返回文件名；调用方负责把 icon 回写为该文件名并维护 avatarHistory。
   */
  async function saveAvatarFile(
    agentId: string,
    filename: string,
    data: Uint8Array
  ): Promise<string> {
    const extension = filename.includes(".")
      ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
      : ".png";
    const safeFilename = `avatar-${Date.now()}${extension}`;
    await storage.saveAgentAvatar(agentId, safeFilename, data);
    return safeFilename;
  }

  /** 删除历史头像文件（仅允许删除图片文件，agent.json 等不可触碰）。 */
  async function deleteAvatarFile(
    agentId: string,
    filename: string
  ): Promise<void> {
    if (!isImageFilename(filename)) {
      throw new Error("INVALID_AVATAR_FILENAME");
    }
    const dir = await storage.getAgentDir(agentId);
    await remove(await join(dir, filename));
    dataUrlCache.delete(cacheKey(agentId, filename));
  }

  /** 头像文件内容变化（如重新导入同名文件）后使缓存失效。 */
  function invalidateAgentAvatar(agentId: string, filename?: string): void {
    if (filename) {
      dataUrlCache.delete(cacheKey(agentId, filename));
      return;
    }
    for (const key of Array.from(dataUrlCache.keys())) {
      if (key.startsWith(`${agentId}/`)) dataUrlCache.delete(key);
    }
  }

  return {
    resolveAgentAvatarUrl,
    listAvatarHistory,
    saveAvatarFile,
    deleteAvatarFile,
    invalidateAgentAvatar,
  };
}

/**
 * 模块级失效入口：供视图在删除 Agent、同名文件重新导入后清空对应缓存，
 * 无需为拿这一个函数而实例化整个 useAgentAvatar。
 */
export function invalidateAgentAvatar(agentId: string, filename?: string): void {
  if (filename) {
    dataUrlCache.delete(cacheKey(agentId, filename));
    return;
  }
  for (const key of Array.from(dataUrlCache.keys())) {
    if (key.startsWith(`${agentId}/`)) dataUrlCache.delete(key);
  }
}

/**
 * 面向视图的响应式头像 URL 绑定：watch 智能体列表，按「icon + 导入预览」签名
 * 自动解析/失效，并在 Agent 被删除后清理显示条目与模块级缓存。
 *
 * 此前 AgentList 与 LlmChatView 各自复制了一份 "watch id 列表 + 已存在即跳过"
 * 的实现，导致编辑页更换头像后两处一直显示旧 dataURL、删除 Agent 后内存残留；
 * 该 composable 是两者的唯一实现。
 */
export function useAgentAvatarUrls(
  getAgents: () => AgentAvatarSource[]
): Record<string, string> {
  const { resolveAgentAvatarUrl } = useAgentAvatar();
  const avatarUrls = reactive<Record<string, string>>({});
  const resolvedSignatures = new Map<string, string>();

  watch(
    () =>
      getAgents()
        .map(
          (agent) =>
            `${agent.id}\u0000${agent.icon ?? ""}\u0000${
              agent.avatarDataUrl?.length ?? 0
            }`
        )
        .join("\u0001"),
    async () => {
      const agents = getAgents();
      const signatures = new Map(
        agents.map((agent) => [
          agent.id,
          `${agent.icon ?? ""}|${agent.avatarDataUrl?.length ?? 0}`,
        ])
      );
      const validIds = new Set(agents.map((agent) => agent.id));
      for (const key of Object.keys(avatarUrls)) {
        if (!validIds.has(key)) delete avatarUrls[key];
      }
      for (const key of Array.from(resolvedSignatures.keys())) {
        if (!validIds.has(key)) {
          resolvedSignatures.delete(key);
          invalidateAgentAvatar(key);
        }
      }
      for (const [agentId, signature] of signatures) {
        if (resolvedSignatures.get(agentId) === signature) continue;
        resolvedSignatures.set(agentId, signature);
        const agent = agents.find((item) => item.id === agentId)!;
        const url = await resolveAgentAvatarUrl(agent);
        // 异步回调可能乱序完成：签名已变化时本次结果过期，丢弃写入。
        if (resolvedSignatures.get(agentId) !== signature) continue;
        if (url) avatarUrls[agentId] = url;
        else delete avatarUrls[agentId];
      }
    },
    { immediate: true }
  );

  return avatarUrls;
}
