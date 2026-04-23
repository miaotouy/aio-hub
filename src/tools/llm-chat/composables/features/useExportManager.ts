/**
 * 导出管理 Composable
 * 负责会话和分支的导出功能
 */

import type { ChatSessionDetail, ChatSessionIndex, ChatMessageNode } from "../../types";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useAgentStore } from "../../stores/agentStore";
import { createModuleLogger } from "@/utils/logger";
import { formatDateTime } from "@/utils/time";

const logger = createModuleLogger("llm-chat/export-manager");

/**
 * 导出选项接口
 */
export interface ExportOptions {
  mergePresetIntoMessages?: boolean;
  includeUserProfile?: boolean;
  includeAgentInfo?: boolean;
  includeModelInfo?: boolean;
  includeTokenUsage?: boolean;
  includeAttachments?: boolean;
  includeErrors?: boolean;
  range?: [number, number];
}

/**
 * 检查字符串是否为 Emoji
 */
const isEmoji = (str: string): boolean => {
  if (!str) return false;
  // Emoji 通常是 1-4 个字符，且不包含路径分隔符
  return str.length <= 4 && !str.includes('/') && !str.includes('\\') && !str.includes('.');
};

export function useExportManager() {
  const { getProfileById } = useLlmProfiles();
  const userProfileStore = useUserProfileStore();
  const agentStore = useAgentStore();

  /**
   * 导出当前会话为 Markdown
   */
  const exportSessionAsMarkdown = (
    index: ChatSessionIndex | null,
    detail: ChatSessionDetail | null,
    currentActivePath: ChatMessageNode[]
  ): string => {
    if (!index || !detail) {
      logger.warn("导出失败：会话不存在或详情未加载");
      return "";
    }

    const lines: string[] = [
      `# 对话记录: ${index.name}`,
      "",
      `会话创建：${formatDateTime(index.createdAt, 'yyyy-MM-dd HH:mm:ss')}`,
      `最后更新：${formatDateTime(index.updatedAt, 'yyyy-MM-dd HH:mm:ss')}`,
      "",
      "---",
      "",
    ];

    // 收集活动路径中被压缩隐藏的节点 ID
    const hiddenNodeIds = new Set<string>();
    currentActivePath.forEach(node => {
      if (node.metadata?.isCompressionNode && node.metadata.compressedNodeIds && node.isEnabled !== false) {
        node.metadata.compressedNodeIds.forEach(id => hiddenNodeIds.add(id));
      }
    });

    // 使用传入的活动路径（包括禁用节点，以便用户看到完整历史）
    currentActivePath.forEach((node: ChatMessageNode) => {
      if (node.role === "system") return; // 跳过系统根节点
      if (hiddenNodeIds.has(node.id)) return; // 跳过被压缩隐藏的节点

      const role = node.role === "user" ? "用户" : "助手";
      const nameStr = node.name ? ` - ${node.name}` : "";
      const time = node.timestamp ? formatDateTime(node.timestamp, 'HH:mm:ss') : "";

      lines.push(`## ${role}${nameStr} (${time})`);
      lines.push("");
      lines.push(node.content);
      lines.push("");

      if (node.metadata?.usage) {
        const usage = node.metadata.usage;
        lines.push(
          `*Token 使用: ${usage.totalTokens} (输入: ${usage.promptTokens}, 输出: ${usage.completionTokens})*`
        );
        lines.push("");
      }

      if (node.metadata?.error) {
        lines.push(`**错误**: ${node.metadata.error}`);
        lines.push("");
      }
    });

    logger.info("导出会话为 Markdown", { sessionId: index.id });
    return lines.join("\n");
  };

  /**
   * 导出分支为 Markdown（从指定节点开始的路径）
   * @param index 会话索引
   * @param detail 会话详情
   * @param nodeId 目标节点 ID
   * @param includePreset 是否包含预设消息
   * @param presetMessages 预设消息列表（如果需要包含）
   * @param options 细粒度导出选项
   */
  const exportBranchAsMarkdown = (
    index: ChatSessionIndex,
    detail: ChatSessionDetail,
    nodeId: string,
    includePreset: boolean = false,
    presetMessages: ChatMessageNode[] = [],
    options: ExportOptions = {}
  ): string => {
    // 设置默认值
    const {
      mergePresetIntoMessages = true,
      includeUserProfile = true,
      includeAgentInfo = true,
      includeModelInfo = true,
      includeTokenUsage = true,
      includeAttachments = true,
      includeErrors = true,
    } = options;

    // 构建从根节点到目标节点的路径
    const path: ChatMessageNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = detail.nodes?.[currentId];
      if (!node) {
        logger.warn("导出分支失败：节点不存在", { nodeId: currentId });
        break;
      }
      path.unshift(node);
      currentId = node.parentId;
    }

    // 收集所有被压缩隐藏的节点 ID
    const hiddenNodeIds = new Set<string>();
    path.forEach(node => {
      if (node.metadata?.isCompressionNode && node.metadata.compressedNodeIds && node.isEnabled !== false) {
        node.metadata.compressedNodeIds.forEach(id => hiddenNodeIds.add(id));
      }
    });

    // 过滤掉系统根节点和被压缩隐藏的节点
    let messagePath = path.filter((node) =>
      node.id !== detail.rootNodeId && !hiddenNodeIds.has(node.id)
    );

    // 应用导出范围过滤
    if (options.range) {
      const [start, end] = options.range;
      messagePath = messagePath.slice(start - 1, end);
    }

    const lines: string[] = [
      `# 对话记录: ${index.name}`,
      "",
      `导出时间：${formatDateTime(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
      `消息统计：共 ${messagePath.length} 条消息`,
    ];

    // 在顶部添加参与者信息
    const participants: string[] = [];

    // 收集所有参与的用户和智能体
    if (includeUserProfile) {
      const uniqueUsers = new Set<string>();
      messagePath.forEach(node => {
        if (node.role === 'user' && node.metadata?.userProfileName) {
          uniqueUsers.add(node.metadata.userProfileName);
        }
      });

      if (uniqueUsers.size > 0) {
        participants.push(`用户: ${Array.from(uniqueUsers).join(', ')}`);
      }
    }

    if (includeAgentInfo) {
      const uniqueAgents = new Set<string>();
      messagePath.forEach(node => {
        if (node.role === 'assistant' && node.metadata?.agentName) {
          uniqueAgents.add(node.metadata.agentName);
        }
      });

      if (uniqueAgents.size > 0) {
        participants.push(`智能体: ${Array.from(uniqueAgents).join(', ')}`);
      }
    }

    if (participants.length > 0) {
      lines.push(`对话参与者：${participants.join(' | ')}`);
    }

    lines.push("");
    lines.push("---");
    lines.push("");

    // 准备要导出的消息列表
    let allMessages: ChatMessageNode[] = [];

    if (includePreset && presetMessages.length > 0) {
      if (mergePresetIntoMessages) {
        // 合并模式：将预设消息和会话消息合并到一起
        allMessages = [...presetMessages, ...messagePath];
      } else {
        // 分离模式：先显示预设消息
        lines.push("## 📋 智能体预设消息");
        lines.push("");

        presetMessages.forEach((node) => {
          const nameStr = node.name ? ` - ${node.name}` : "";
          if (node.role === "system") {
            lines.push(`### 系统提示${nameStr}`);
            lines.push("");
            lines.push(node.content);
            lines.push("");
          } else {
            const role = node.role === "user" ? "用户" : "助手";
            lines.push(`### ${role}${nameStr}`);
            lines.push("");
            lines.push(node.content);
            lines.push("");
          }
        });

        lines.push("---");
        lines.push("");
        lines.push("## 💬 会话消息");
        lines.push("");

        // 只添加会话消息
        allMessages = messagePath;
      }
    } else {
      // 不包含预设，只添加会话消息
      allMessages = messagePath;
    }

    // 添加消息
    allMessages.forEach((node) => {
      const time = node.timestamp ? formatDateTime(node.timestamp, 'HH:mm:ss') : "";
      const enabledStatus = node.isEnabled === false ? " [已禁用]" : "";

      if (node.role === "user") {
        // 用户消息
        let userName = "用户";
        if (includeUserProfile) {
          if (node.metadata?.userProfileName) {
            userName = node.metadata.userProfileName;
          } else if (node.metadata?.userProfileId) {
            // 尝试从 Store 获取最新信息作为回退
            const profile = userProfileStore.getProfileById(node.metadata.userProfileId);
            if (profile) {
              userName = profile.displayName || profile.name;
            }
          }
        }

        const userIcon = includeUserProfile && node.metadata?.userProfileIcon && isEmoji(node.metadata.userProfileIcon)
          ? node.metadata.userProfileIcon
          : "";

        const userLabel = userIcon ? `${userIcon} ${userName}` : userName;
        lines.push(`## ${userLabel} (${time})${enabledStatus}`);
        lines.push("");
      } else if (node.role === "assistant") {
        // 助手消息
        let agentName = "助手";
        if (includeAgentInfo) {
          if (node.metadata?.agentName) {
            agentName = node.metadata.agentName;
          } else if (node.metadata?.agentId) {
            // 尝试从 Store 获取最新信息作为回退
            const agent = agentStore.getAgentById(node.metadata.agentId);
            if (agent) {
              agentName = agent.displayName || agent.name;
            }
          }
        }

        const agentIcon = includeAgentInfo && node.metadata?.agentIcon && isEmoji(node.metadata.agentIcon)
          ? node.metadata.agentIcon
          : "";

        const agentLabel = agentIcon ? `${agentIcon} ${agentName}` : agentName;
        lines.push(`## ${agentLabel} (${time})${enabledStatus}`);
        lines.push("");

        // 添加模型信息
        const metadata = node.metadata;
        if (metadata && includeModelInfo) {
          if (metadata.profileId && metadata.modelId) {
            const profile = getProfileById(metadata.profileId);
            if (profile) {
              const model = profile.models.find(m => m.id === metadata.modelId);
              if (model) {
                const modelName = metadata.modelName || model.name || model.id;
                lines.push(`*模型: ${modelName} (${profile.name})*`);
                lines.push("");
              }
            }
          } else if (metadata.modelName) {
            lines.push(`*模型: ${metadata.modelName}*`);
            lines.push("");
          }
        }
      } else {
        // 系统消息
        lines.push(`## ⚙️ 系统 (${time})${enabledStatus}`);
        lines.push("");
      }

      // 消息内容
      lines.push(node.content);
      lines.push("");

      // 添加附件信息
      if (includeAttachments && node.attachments && node.attachments.length > 0) {
        lines.push("**附件**:");
        node.attachments.forEach((attachment) => {
          lines.push(`- ${attachment.name} (${attachment.type})`);
        });
        lines.push("");
      }

      // 添加 Token 使用信息
      if (includeTokenUsage && node.metadata?.usage) {
        const usage = node.metadata.usage;
        lines.push(
          `*Token 使用: ${usage.totalTokens} (输入: ${usage.promptTokens}, 输出: ${usage.completionTokens})*`
        );
        lines.push("");
      }

      // 添加错误信息
      if (includeErrors && node.metadata?.error) {
        lines.push(`**错误**: ${node.metadata.error}`);
        lines.push("");
      }

      // 添加分隔线（在消息之间）
      lines.push("---");
      lines.push("");
    });

    logger.info("导出分支为 Markdown", {
      sessionId: index.id,
      nodeId,
      messageCount: messagePath.length,
      includePreset,
      presetCount: presetMessages.length,
    });

    return lines.join("\n");
  };

  /**
   * 导出分支为 JSON（从指定节点开始的路径）
   * @param index 会话索引
   * @param detail 会话详情
   * @param nodeId 目标节点 ID
   * @param includePreset 是否包含预设消息
   * @param presetMessages 预设消息列表（如果需要包含）
   * @param options 细粒度导出选项
   */
  const exportBranchAsJson = (
    index: ChatSessionIndex,
    detail: ChatSessionDetail,
    nodeId: string,
    includePreset: boolean = false,
    presetMessages: ChatMessageNode[] = [],
    options: ExportOptions = {}
  ): any => {
    // 设置默认值
    const {
      mergePresetIntoMessages = true,
      includeUserProfile = true,
      includeAgentInfo = true,
      includeModelInfo = true,
      includeTokenUsage = true,
      includeAttachments = true,
      includeErrors = true,
    } = options;

    // 构建从根节点到目标节点的路径
    const path: ChatMessageNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = detail.nodes?.[currentId];
      if (!node) {
        logger.warn("导出分支失败：节点不存在", { nodeId: currentId });
        break;
      }
      path.unshift(node);
      currentId = node.parentId;
    }

    // 收集所有被压缩隐藏的节点 ID
    const hiddenNodeIds = new Set<string>();
    path.forEach(node => {
      if (node.metadata?.isCompressionNode && node.metadata.compressedNodeIds && node.isEnabled !== false) {
        node.metadata.compressedNodeIds.forEach(id => hiddenNodeIds.add(id));
      }
    });

    // 过滤掉系统根节点和被压缩隐藏的节点
    let messagePath = path.filter((node) =>
      node.id !== detail.rootNodeId && !hiddenNodeIds.has(node.id)
    );

    // 应用导出范围过滤
    if (options.range) {
      const [start, end] = options.range;
      messagePath = messagePath.slice(start - 1, end);
    }

    interface ExportMessage {
      role: string;
      name?: string;
      content: string;
      timestamp: number;
      isEnabled?: boolean;
      user?: { name: string; icon?: string };
      agent?: { name: string; icon?: string };
      model?: { name: string; id?: string; provider?: string };
      attachments?: { name: string; type: string; id: string }[];
      tokenUsage?: { total: number; prompt: number; completion: number };
      error?: string;
    }

    interface ExportResult {
      session: {
        name: string;
        createdAt: string;
        updatedAt: string;
      };
      exportTime: string;
      messageCount: number;
      messages: ExportMessage[];
      presetMessages?: any[]; // 预设消息结构可能较复杂，暂用 any 或根据实际情况定义
    }

    const result: ExportResult = {
      session: {
        name: index.name,
        createdAt: index.createdAt,
        updatedAt: index.updatedAt,
      },
      exportTime: new Date().toISOString(),
      messageCount: messagePath.length,
      messages: [] as ExportMessage[],
    };

    // 准备要导出的消息列表
    let allMessages: ChatMessageNode[] = [];

    if (includePreset && presetMessages.length > 0) {
      if (mergePresetIntoMessages) {
        // 合并模式：将预设消息和会话消息合并到一起
        allMessages = [...presetMessages, ...messagePath];
      } else {
        // 分离模式：预设消息单独存放
        result.presetMessages = presetMessages.map((node) => {
          const msg: any = {
            role: node.role,
            name: node.name,
            content: node.content,
            timestamp: node.timestamp,
          };
          return msg;
        });
        allMessages = messagePath;
      }
    } else {
      // 不包含预设，只添加会话消息
      allMessages = messagePath;
    }

    // 添加消息
    allMessages.forEach((node) => {
      const msg: any = {
        role: node.role,
        name: node.name,
        content: node.content,
        timestamp: node.timestamp,
        isEnabled: node.isEnabled,
      };

      // 用户信息
      if (node.role === "user" && includeUserProfile && node.metadata?.userProfileName) {
        msg.user = {
          name: node.metadata.userProfileName,
          icon: node.metadata.userProfileIcon,
        };
      }

      // 智能体信息
      if (node.role === "assistant" && node.metadata) {
        if (includeAgentInfo && node.metadata.agentName) {
          msg.agent = {
            name: node.metadata.agentName,
            icon: node.metadata.agentIcon,
          };
        }

        // 模型信息
        if (includeModelInfo) {
          if (node.metadata.profileId && node.metadata.modelId) {
            const profile = getProfileById(node.metadata.profileId);
            if (profile) {
              const model = profile.models.find((m) => m.id === node.metadata!.modelId);
              if (model) {
                msg.model = {
                  name: node.metadata.modelName || model.name || model.id,
                  id: model.id,
                  provider: profile.name,
                };
              }
            }
          } else if (node.metadata.modelName) {
            msg.model = {
              name: node.metadata.modelName,
            };
          }
        }
      }

      // 附件信息
      if (includeAttachments && node.attachments && node.attachments.length > 0) {
        msg.attachments = node.attachments.map((att) => ({
          name: att.name,
          type: att.type,
          id: att.id,
        }));
      }

      // Token 使用信息
      if (includeTokenUsage && node.metadata?.usage) {
        msg.tokenUsage = {
          total: node.metadata.usage.totalTokens,
          prompt: node.metadata.usage.promptTokens,
          completion: node.metadata.usage.completionTokens,
        };
      }

      // 错误信息
      if (includeErrors && node.metadata?.error) {
        msg.error = node.metadata.error;
      }

      result.messages.push(msg);
    });

    logger.info("导出分支为 JSON", {
      sessionId: index.id,
      nodeId,
      messageCount: messagePath.length,
      includePreset,
      presetCount: presetMessages.length,
    });

    return result;
  };

  /**
   * 导出完整会话为 Markdown 树状格式（包含所有分支）
   * @param index 会话索引
   * @param detail 会话详情
   * @param options 导出选项
   */
  const exportSessionAsMarkdownTree = (
    index: ChatSessionIndex,
    detail: ChatSessionDetail,
    options: ExportOptions = {}
  ): string => {
    // 设置默认值
    const {
      includeUserProfile = true,
      includeAgentInfo = true,
      includeModelInfo = true,
      includeTokenUsage = true,
      includeAttachments = true,
      includeErrors = true,
    } = options;

    const lines: string[] = [
      `# 完整对话记录: ${index.name}`,
      "",
      `导出时间：${formatDateTime(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
      `会话创建：${formatDateTime(index.createdAt, 'yyyy-MM-dd HH:mm:ss')}`,
      `最后更新：${formatDateTime(index.updatedAt, 'yyyy-MM-dd HH:mm:ss')}`,
      "",
      "---",
      "",
    ];

    // 统计节点数量（排除根节点）
    const totalNodes = Object.keys(detail.nodes || {}).length - 1;
    lines.push(`**总消息数**: ${totalNodes} 条`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // 收集全树中所有被压缩隐藏的节点 ID
    const allHiddenNodeIds = new Set<string>();
    Object.values(detail.nodes || {}).forEach(node => {
      if (node.metadata?.isCompressionNode && node.metadata.compressedNodeIds && node.isEnabled !== false) {
        node.metadata.compressedNodeIds.forEach(id => allHiddenNodeIds.add(id));
      }
    });

    /**
     * 递归遍历节点树，生成 Markdown 列表
     * @param nodeId 当前节点 ID
     * @param depth 当前深度（用于缩进）
     */
    const traverseNode = (nodeId: string, depth: number = 0): void => {
      const node = detail.nodes?.[nodeId];
      if (!node) return;

      const isHidden = allHiddenNodeIds.has(nodeId);

      // 跳过系统根节点（不显示）
      if (node.id === detail.rootNodeId) {
        // 直接遍历根节点的子节点
        node.childrenIds.forEach((childId) => {
          traverseNode(childId, depth);
        });
        return;
      }

      // 如果节点被隐藏，我们不渲染它，但需要继续遍历它的子节点
      if (isHidden) {
        if (node.childrenIds && node.childrenIds.length > 0) {
          node.childrenIds.forEach((childId) => {
            traverseNode(childId, depth);
          });
        }
        return;
      }

      // 生成缩进（每层 2 个空格）
      const indent = "  ".repeat(depth);

      // 格式化时间和状态
      const time = node.timestamp ? formatDateTime(node.timestamp, 'HH:mm:ss') : "";
      const enabledStatus = node.isEnabled === false ? " [已禁用]" : "";

      // 根据角色确定图标和名称
      let roleIcon = "";
      let roleName = "";
      const nameStr = node.name ? ` [${node.name}]` : "";

      if (node.role === "user") {
        const userName = includeUserProfile && node.metadata?.userProfileName
          ? node.metadata.userProfileName
          : "用户";
        const userIcon = includeUserProfile && node.metadata?.userProfileIcon && isEmoji(node.metadata.userProfileIcon)
          ? node.metadata.userProfileIcon
          : "";
        roleIcon = userIcon;
        roleName = userName;
      } else if (node.role === "assistant") {
        const agentName = includeAgentInfo && node.metadata?.agentName
          ? node.metadata.agentName
          : "助手";
        const agentIcon = includeAgentInfo && node.metadata?.agentIcon && isEmoji(node.metadata.agentIcon)
          ? node.metadata.agentIcon
          : "";
        roleIcon = agentIcon;
        roleName = agentName;
      } else {
        roleIcon = "⚙️";
        roleName = "系统";
      }

      // 添加消息标题（使用列表项）
      const roleLabel = roleIcon ? `${roleIcon} ${roleName}` : roleName;
      lines.push(`${indent}- **${roleLabel}${nameStr}** (${time})${enabledStatus}`);

      // 添加元数据（缩进）
      const metaIndent = indent + "  ";

      if (node.role === "assistant" && node.metadata) {
        if (includeModelInfo) {
          if (node.metadata.profileId && node.metadata.modelId) {
            const profile = getProfileById(node.metadata.profileId);
            if (profile) {
              const model = profile.models.find((m) => m.id === node.metadata!.modelId);
              if (model) {
                const modelName = node.metadata.modelName || model.name || model.id;
                lines.push(`${metaIndent}*模型: ${modelName} | 渠道: ${profile.name}*`);
              }
            }
          } else if (node.metadata.modelName) {
            lines.push(`${metaIndent}*模型: ${node.metadata.modelName}*`);
          }
        }
      }

      // 添加消息内容（需要适当缩进和换行处理）
      const contentLines = node.content.split("\n");
      contentLines.forEach((line, index) => {
        if (index === 0 && line.trim()) {
          lines.push(`${metaIndent}${line}`);
        } else if (line.trim()) {
          lines.push(`${metaIndent}${line}`);
        } else {
          lines.push("");
        }
      });

      // 添加附件信息
      if (includeAttachments && node.attachments && node.attachments.length > 0) {
        lines.push(`${metaIndent}*附件: ${node.attachments.map(a => a.name).join(", ")}*`);
      }

      // 添加 Token 使用信息
      if (includeTokenUsage && node.metadata?.usage) {
        const usage = node.metadata.usage;
        lines.push(
          `${metaIndent}*Token: ${usage.totalTokens} (输入: ${usage.promptTokens}, 输出: ${usage.completionTokens})*`
        );
      }

      // 添加错误信息
      if (includeErrors && node.metadata?.error) {
        lines.push(`${metaIndent}*错误: ${node.metadata.error}*`);
      }

      lines.push(""); // 消息之间添加空行

      // 递归遍历子节点
      if (node.childrenIds && node.childrenIds.length > 0) {
        // 如果有多个子节点，说明有分支
        if (node.childrenIds.length > 1) {
          lines.push(`${indent}  *[此处产生了 ${node.childrenIds.length} 条不同的对话路径]*`);
          lines.push("");
        }

        node.childrenIds.forEach((childId, index) => {
          // 为每个分支添加标记（如果有多个分支）
          if (node.childrenIds.length > 1) {
            lines.push(`${indent}  **路径 ${index + 1}:**`);
            lines.push("");
          }
          traverseNode(childId, depth + 1);
        });
      }
    };

    // 从根节点开始遍历
    traverseNode(detail.rootNodeId || "", 0);

    logger.info("导出完整会话为 Markdown 树", {
      sessionId: index.id,
      totalNodes,
    });

    return lines.join("\n");
  };

  return {
    exportSessionAsMarkdown,
    exportBranchAsMarkdown,
    exportBranchAsJson,
    exportSessionAsMarkdownTree,
  };
}