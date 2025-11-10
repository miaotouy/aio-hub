/**
 * 导出管理 Composable
 * 负责会话和分支的导出功能
 */

import type { ChatSession, ChatMessageNode } from "../types";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createModuleLogger } from "@/utils/logger";

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

  /**
   * 导出当前会话为 Markdown
   */
  const exportSessionAsMarkdown = (
    session: ChatSession | null,
    currentActivePath: ChatMessageNode[]
  ): string => {
    if (!session) {
      logger.warn("导出失败：会话不存在");
      return "";
    }

    const lines: string[] = [
      `# ${session.name}`,
      "",
      `创建时间：${new Date(session.createdAt).toLocaleString("zh-CN")}`,
      `更新时间：${new Date(session.updatedAt).toLocaleString("zh-CN")}`,
      "",
      "---",
      "",
    ];

    // 使用传入的活动路径（包括禁用节点，以便用户看到完整历史）
    currentActivePath.forEach((node: ChatMessageNode) => {
      if (node.role === "system") return; // 跳过系统根节点

      const role = node.role === "user" ? "用户" : "助手";
      const time = new Date(node.timestamp).toLocaleTimeString("zh-CN");

      lines.push(`## ${role} (${time})`);
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

    logger.info("导出会话为 Markdown", { sessionId: session.id });
    return lines.join("\n");
  };

  /**
   * 导出分支为 Markdown（从指定节点开始的路径）
   * @param session 会话
   * @param nodeId 目标节点 ID
   * @param includePreset 是否包含预设消息
   * @param presetMessages 预设消息列表（如果需要包含）
   * @param options 细粒度导出选项
   */
  const exportBranchAsMarkdown = (
    session: ChatSession,
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
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) {
        logger.warn("导出分支失败：节点不存在", { nodeId: currentId });
        break;
      }
      path.unshift(node);
      currentId = node.parentId;
    }

    // 过滤掉系统根节点
    const messagePath = path.filter((node) => node.id !== session.rootNodeId);

    const lines: string[] = [
      `# ${session.name} - 分支导出`,
      "",
      `导出时间：${new Date().toLocaleString("zh-CN")}`,
      `分支节点：${messagePath.length} 条消息`,
      "",
      "---",
      "",
    ];

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
          if (node.role === "system") {
            lines.push("### 系统提示");
            lines.push("");
            lines.push(node.content);
            lines.push("");
          } else {
            const role = node.role === "user" ? "用户" : "助手";
            lines.push(`### ${role}`);
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
      const time = new Date(node.timestamp).toLocaleTimeString("zh-CN");
      const enabledStatus = node.isEnabled === false ? " [已禁用]" : "";

      if (node.role === "user") {
        // 用户消息
        const userName = includeUserProfile && node.metadata?.userProfileName
          ? node.metadata.userProfileName
          : "用户";
        const userIcon = includeUserProfile && node.metadata?.userProfileIcon && isEmoji(node.metadata.userProfileIcon)
          ? node.metadata.userProfileIcon
          : "";
        
        const userLabel = userIcon ? `${userIcon} ${userName}` : userName;
        lines.push(`## ${userLabel} (${time})${enabledStatus}`);
        lines.push("");
        
        // 添加用户档案信息（仅在启用时）
        if (includeUserProfile && node.metadata?.userProfileName) {
          lines.push(`**用户档案**: ${node.metadata.userProfileName}`);
          lines.push("");
        }
      } else if (node.role === "assistant") {
        // 助手消息
        const agentName = includeAgentInfo && node.metadata?.agentName
          ? node.metadata.agentName
          : "助手";
        const agentIcon = includeAgentInfo && node.metadata?.agentIcon && isEmoji(node.metadata.agentIcon)
          ? node.metadata.agentIcon
          : "";
        
        const agentLabel = agentIcon ? `${agentIcon} ${agentName}` : agentName;
        lines.push(`## ${agentLabel} (${time})${enabledStatus}`);
        lines.push("");
        
        // 添加智能体和模型信息
        const metadata = node.metadata;
        if (metadata) {
          // 显示智能体名称
          if (includeAgentInfo && metadata.agentName) {
            lines.push(`**智能体**: ${metadata.agentName}`);
          }
          
          // 获取并显示模型信息
          if (includeModelInfo) {
            if (metadata.profileId && metadata.modelId) {
              const profile = getProfileById(metadata.profileId);
              if (profile) {
                const model = profile.models.find(m => m.id === metadata.modelId);
                if (model) {
                  const modelName = metadata.modelName || model.name || model.id;
                  lines.push(`**模型**: ${modelName}`);
                  lines.push(`**渠道**: ${profile.name}`);
                }
              }
            } else if (metadata.modelName) {
              // 如果没有 profileId/modelId，但有 modelName，也显示
              lines.push(`**模型**: ${metadata.modelName}`);
            }
          }
          
          if ((includeAgentInfo && metadata.agentName) || includeModelInfo) {
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
      sessionId: session.id,
      nodeId,
      messageCount: messagePath.length,
      includePreset,
      presetCount: presetMessages.length,
    });

    return lines.join("\n");
  };

  /**
   * 导出分支为 JSON（从指定节点开始的路径）
   * @param session 会话
   * @param nodeId 目标节点 ID
   * @param includePreset 是否包含预设消息
   * @param presetMessages 预设消息列表（如果需要包含）
   * @param options 细粒度导出选项
   */
  const exportBranchAsJson = (
    session: ChatSession,
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
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) {
        logger.warn("导出分支失败：节点不存在", { nodeId: currentId });
        break;
      }
      path.unshift(node);
      currentId = node.parentId;
    }

    // 过滤掉系统根节点
    const messagePath = path.filter((node) => node.id !== session.rootNodeId);

    const result: any = {
      session: {
        name: session.name,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      exportTime: new Date().toISOString(),
      messageCount: messagePath.length,
      messages: [] as any[],
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
      sessionId: session.id,
      nodeId,
      messageCount: messagePath.length,
      includePreset,
      presetCount: presetMessages.length,
    });

    return result;
  };

  /**
   * 导出完整会话为 Markdown 树状格式（包含所有分支）
   * @param session 会话
   * @param options 导出选项
   */
  const exportSessionAsMarkdownTree = (
    session: ChatSession,
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
      `# ${session.name} - 完整会话导出`,
      "",
      `导出时间：${new Date().toLocaleString("zh-CN")}`,
      `创建时间：${new Date(session.createdAt).toLocaleString("zh-CN")}`,
      `更新时间：${new Date(session.updatedAt).toLocaleString("zh-CN")}`,
      "",
      "---",
      "",
    ];

    // 统计节点数量（排除根节点）
    const totalNodes = Object.keys(session.nodes).length - 1;
    lines.push(`**总消息数**: ${totalNodes} 条`);
    lines.push("");
    lines.push("---");
    lines.push("");

    /**
     * 递归遍历节点树，生成 Markdown 列表
     * @param nodeId 当前节点 ID
     * @param depth 当前深度（用于缩进）
     */
    const traverseNode = (nodeId: string, depth: number = 0): void => {
      const node = session.nodes[nodeId];
      if (!node) return;

      // 跳过系统根节点（不显示）
      if (node.id === session.rootNodeId) {
        // 直接遍历根节点的子节点
        node.childrenIds.forEach((childId) => {
          traverseNode(childId, depth);
        });
        return;
      }

      // 生成缩进（每层 2 个空格）
      const indent = "  ".repeat(depth);

      // 格式化时间和状态
      const time = new Date(node.timestamp).toLocaleTimeString("zh-CN");
      const enabledStatus = node.isEnabled === false ? " [已禁用]" : "";

      // 根据角色确定图标和名称
      let roleIcon = "";
      let roleName = "";

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
      lines.push(`${indent}- **${roleLabel}** (${time})${enabledStatus}`);

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
          lines.push(`${indent}  *[分支点 - ${node.childrenIds.length} 个分支]*`);
          lines.push("");
        }

        node.childrenIds.forEach((childId, index) => {
          // 为每个分支添加标记（如果有多个分支）
          if (node.childrenIds.length > 1) {
            lines.push(`${indent}  **分支 ${index + 1}:**`);
            lines.push("");
          }
          traverseNode(childId, depth + 1);
        });
      }
    };

    // 从根节点开始遍历
    traverseNode(session.rootNodeId, 0);

    logger.info("导出完整会话为 Markdown 树", {
      sessionId: session.id,
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