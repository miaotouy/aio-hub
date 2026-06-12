import type { ChatMessageNode } from "../../../../types";

/**
 * 已知的思考块标签名列表
 */
export const THINK_TAG_NAMES = ["think", "guguthink", "thinking"];

const THINK_BLOCK_REGEXES = THINK_TAG_NAMES.map(
  (tag) => new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, "gi")
);

const THINK_BLOCK_CAPTURE_REGEXES = THINK_TAG_NAMES.map(
  (tag) => new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i")
);

const THINK_OPEN_TAG_REGEXES = THINK_TAG_NAMES.map(
  (tag) => new RegExp(`<${tag}>`, "i")
);

/**
 * 从文本中剥离思考块标签及其内容，返回纯正文
 */
export function stripThinkingBlocks(text: string): string {
  let result = text;
  for (const regex of THINK_BLOCK_REGEXES) {
    result = result.replace(regex, "");
  }
  // 清理剥离后可能产生的多余空行
  return result.replace(/^\s*\n/gm, "").trim();
}

/**
 * 提取思考块内容的简短摘要
 */
export function extractThinkingPreview(
  text: string,
  reasoningContent?: string
): string | null {
  // 优先使用 API 返回的独立推理字段
  if (reasoningContent) {
    const preview = reasoningContent.substring(0, 60).trim();
    return preview + (reasoningContent.length > 60 ? "..." : "");
  }

  // 从内容中提取思考块
  for (const regex of THINK_BLOCK_CAPTURE_REGEXES) {
    const match = text.match(regex);
    if (match && match[1]) {
      const content = match[1].trim();
      const preview = content.substring(0, 60).trim();
      return preview + (content.length > 60 ? "..." : "");
    }
  }

  return null;
}

/**
 * 检测文本中是否包含思考块
 */
export function hasThinkingContent(
  text: string,
  reasoningContent?: string
): boolean {
  if (reasoningContent) return true;
  for (const regex of THINK_OPEN_TAG_REGEXES) {
    if (regex.test(text)) return true;
  }
  return false;
}

/**
 * 截断文本用于显示
 */
export function truncateText(text: string, maxLength: number = 150): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * 判断图标是否像文件名
 */
export function isLikelyFilename(icon: string): boolean {
  return icon.includes(".") && !icon.includes("/") && !icon.includes("\\");
}

/**
 * 获取角色的头像和显示名称
 */
export function getRoleDisplay(
  node: ChatMessageNode,
  userProfileStore: any,
  agentStore: any
): { icon: string; name: string } {
  if (node.role === "user") {
    const userProfileId = node.metadata?.userProfileId;
    const currentProfile = userProfileStore.getEffectiveProfile(userProfileId);

    const name =
      node.metadata?.userProfileName ||
      currentProfile?.displayName ||
      currentProfile?.name ||
      "你";

    let target;
    if (node.metadata?.userProfileIcon && node.metadata?.userProfileId) {
      target = {
        id: node.metadata.userProfileId,
        icon: node.metadata.userProfileIcon,
      };
    } else {
      target = userProfileStore.getEffectiveProfile(userProfileId);
    }

    let icon = target?.icon?.trim() || "👤";

    if (icon && icon !== "👤") {
      if (isLikelyFilename(icon) && target?.id) {
        icon = `appdata://llm-chat/user-profiles/${target.id}/${icon}`;
      }
    }

    return { icon, name };
  } else if (node.role === "assistant") {
    const agentId = node.metadata?.agentId;
    const currentAgent = agentId ? agentStore.getAgentById(agentId) : null;

    const name =
      node.metadata?.agentName ||
      currentAgent?.displayName ||
      currentAgent?.name ||
      "助手";

    let target;
    if (node.metadata?.agentIcon && node.metadata?.agentId) {
      target = {
        id: node.metadata.agentId,
        icon: node.metadata.agentIcon,
      };
    } else {
      const agentId = node.metadata?.agentId;
      target = agentId ? agentStore.getAgentById(agentId) : null;
    }

    let icon = target?.icon?.trim() || "🤖";

    if (icon && icon !== "🤖") {
      if (isLikelyFilename(icon) && target?.id) {
        icon = `appdata://llm-chat/agents/${target.id}/${icon}`;
      }
    }

    return { icon, name };
  } else if (node.role === "tool") {
    const toolName =
      node.metadata?.toolCalls?.[0]?.toolName ||
      node.metadata?.toolCall?.toolName ||
      "工具";
    return { icon: "🔧", name: toolName };
  } else {
    return { icon: "⚙️", name: "系统" };
  }
}

/**
 * 获取副标题信息（模型、渠道）
 */
export function getSubtitleInfo(
  node: ChatMessageNode,
  agentStore: any,
  getProfileById: (id: string) => any,
  getModelIcon: (model: any) => string | undefined | null
) {
  const metadata = node.metadata;
  if (!metadata || node.role !== "assistant") return null;

  const agent = metadata.agentId
    ? agentStore.getAgentById(metadata.agentId)
    : null;

  const profileId = metadata.profileId || agent?.profileId;
  const modelId = metadata.modelId || agent?.modelId;

  if (!profileId || !modelId) return null;

  const profile = getProfileById(profileId);
  if (!profile) return null;

  const model = profile.models.find((m: any) => m.id === modelId);
  if (!model) return null;

  const modelIcon = getModelIcon(model);
  const profileIcon = profile.icon || profile.logoUrl;
  const displayModelName = metadata.modelName || model.name || model.id;

  return {
    profileName: profile.name,
    profileIcon: profileIcon,
    modelName: displayModelName,
    modelIcon: modelIcon || undefined,
  };
}
