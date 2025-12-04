<template>
  <div class="structured-view">
    <!-- Agent 信息 -->
    <InfoCard title="智能体信息" class="agent-info-card">
      <div class="agent-info">
        <Avatar
          v-if="contextData.agentInfo.icon"
          :src="
            resolveAvatarPath(
              { id: contextData.agentInfo.id, icon: contextData.agentInfo.icon },
              'agent'
            ) || ''
          "
          :alt="contextData.agentInfo.name"
          :size="96"
          shape="square"
          :radius="8"
        />
        <div class="agent-details">
          <div class="info-item">
            <span class="label">名称:</span>
            <span class="value">{{ contextData.agentInfo.name || "未命名" }}</span>
          </div>
          <div class="info-item">
            <span class="label">模型:</span>
            <span class="value">{{ contextData.agentInfo.modelId }}</span>
          </div>
          <div class="info-item">
            <span class="label">配置文件:</span>
            <span class="value">{{ contextData.agentInfo.profileId }}</span>
          </div>
        </div>
      </div>
    </InfoCard>

    <!-- 统计信息 -->
    <InfoCard class="stats-card">
      <template #header>
        <div class="card-header">
          <span>上下文统计</span>
          <el-tag v-if="contextData.statistics.tokenizerName" size="small" type="info">
            {{ contextData.statistics.isEstimated ? "字符估算" : "Token 计算" }} -
            {{ contextData.statistics.tokenizerName }}
          </el-tag>
        </div>
      </template>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">总消息数</div>
          <div class="stat-value">{{ contextData.statistics.messageCount }}</div>
        </div>
        <div v-if="contextData.statistics.totalTokenCount !== undefined" class="stat-item primary">
          <div class="stat-label">总 Token 数</div>
          <div class="stat-value">
            {{ contextData.statistics.totalTokenCount.toLocaleString() }}
            <span class="char-count">
              {{ contextData.statistics.totalCharCount.toLocaleString() }} 字符
            </span>
          </div>
        </div>
        <div v-else class="stat-item">
          <div class="stat-label">总字符数</div>
          <div class="stat-value">{{ contextData.statistics.totalCharCount.toLocaleString() }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">预设消息</div>
          <div class="stat-value">
            <template v-if="contextData.statistics.presetMessagesTokenCount !== undefined">
              {{ contextData.statistics.presetMessagesTokenCount.toLocaleString() }} tokens
              <span class="char-count">
                {{ contextData.statistics.presetMessagesCharCount.toLocaleString() }} 字符
              </span>
            </template>
            <template v-else>
              {{ contextData.statistics.presetMessagesCharCount.toLocaleString() }} 字符
            </template>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-label">会话历史</div>
          <div class="stat-value">
            <template v-if="contextData.statistics.chatHistoryTokenCount !== undefined">
              {{ contextData.statistics.chatHistoryTokenCount.toLocaleString() }} tokens
              <span class="char-count">
                {{ contextData.statistics.chatHistoryCharCount.toLocaleString() }} 字符
              </span>
            </template>
            <template v-else>
              {{ contextData.statistics.chatHistoryCharCount.toLocaleString() }} 字符
            </template>
          </div>
        </div>
        <div v-if="contextData.statistics.postProcessingTokenCount" class="stat-item">
          <div class="stat-label">后处理消耗</div>
          <div class="stat-value">
            {{ contextData.statistics.postProcessingTokenCount.toLocaleString() }} tokens
            <span class="char-count" v-if="contextData.statistics.postProcessingCharCount">
              {{ contextData.statistics.postProcessingCharCount.toLocaleString() }} 字符
            </span>
          </div>
        </div>
      </div>
    </InfoCard>

    <!-- 统一消息列表（按实际上下文顺序） -->
    <div v-if="unifiedMessages.length > 0" class="section">
      <div class="section-title">
        <span>上下文消息</span>
        <div class="header-tags">
          <el-tag size="small" type="primary"> {{ unifiedMessages.length }} 条消息 </el-tag>
          <el-tag
            v-if="contextData.statistics.totalTokenCount !== undefined"
            size="small"
            type="success"
          >
            {{ contextData.statistics.totalTokenCount.toLocaleString() }} tokens
          </el-tag>
        </div>
      </div>
      <div class="messages-list">
        <InfoCard v-for="(msg, index) in unifiedMessages" :key="msg.key" class="message-card">
          <template #header>
            <div class="message-card-header">
              <div class="message-title">
                <!-- 根据角色显示不同头像 -->
                <Avatar
                  v-if="msg.role === 'user'"
                  :src="msg.userIcon || ''"
                  :alt="msg.userName || 'User'"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <Avatar
                  v-else-if="msg.role === 'assistant'"
                  :src="
                    msg.agentIcon ||
                    resolveAvatarPath(
                      { id: contextData.agentInfo.id, icon: contextData.agentInfo.icon },
                      'agent'
                    ) ||
                    ''
                  "
                  :alt="msg.agentName || contextData.agentInfo.name || '助手'"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <el-icon v-else class="system-icon">
                  <Setting />
                </el-icon>
                <span class="message-role-name">
                  {{ getRoleName(msg) }}
                  #{{ index + 1 }}
                </span>
                <!-- 来源标签 -->
                <el-tag
                  :type="getSourceTagType(msg.source)"
                  size="small"
                  effect="plain"
                  class="source-tag"
                >
                  {{ getSourceLabel(msg) }}
                </el-tag>
              </div>
              <div class="header-tags">
                <el-tag v-if="msg.tokenCount !== undefined" size="small" type="success">
                  {{ msg.tokenCount }} tokens
                </el-tag>
                <el-tag size="small" type="info"> {{ msg.charCount }} 字符 </el-tag>
              </div>
            </div>
          </template>
          <div class="message-content">{{ getDisplayContent(msg.content) }}</div>
          <!-- 附件分析（仅会话历史消息有） -->
          <div v-if="msg.attachments && msg.attachments.length > 0" class="attachments-section">
            <div class="attachments-title">附件分析</div>
            <div class="attachments-grid">
              <AttachmentCard
                v-for="(att, attIndex) in msg.attachments"
                :key="attIndex"
                :asset="castToAsset(att)"
                :all-assets="castToAssetArray(msg.attachments)"
                :token-count="att.tokenCount"
                :token-estimated="att.isEstimated"
                :token-error="att.error"
                :removable="false"
                size="large"
              />
            </div>
          </div>
        </InfoCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Setting } from "@element-plus/icons-vue";
import InfoCard from "@/components/common/InfoCard.vue";
import Avatar from "@/components/common/Avatar.vue";
import AttachmentCard from "../AttachmentCard.vue";
import type { ContextPreviewData } from "../../composables/useChatContextBuilder";
import type { Asset } from "@/types/asset-management";
import { resolveAvatarPath } from "../../composables/useResolvedAvatar";
import type { LlmMessageContent } from "@/llm-apis/common";

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

/**
 * 统一消息类型
 */
interface UnifiedMessage {
  key: string;
  role: "system" | "user" | "assistant";
  content: string | LlmMessageContent[];
  charCount: number;
  tokenCount?: number;
  source: "agent_preset" | "session_history" | "unknown";
  // 用户信息（user 角色）
  userName?: string;
  userIcon?: string;
  // 智能体信息（assistant 角色）
  agentName?: string;
  agentIcon?: string;
  // 附件（仅会话历史）
  attachments?: ContextPreviewData["chatHistory"][0]["attachments"];
  _mergedSources?: any[];
}

/**
 * 将 finalMessages 与详细信息合并，生成统一的消息列表
 * 按照 finalMessages 的实际顺序显示，确保 index 准确
 */
const unifiedMessages = computed<UnifiedMessage[]>(() => {
  const { finalMessages, presetMessages, chatHistory } = props.contextData;

  // 建立预设消息索引 (index -> preset)
  const presetMap = new Map<number, (typeof presetMessages)[0]>();
  presetMessages.forEach((p) => presetMap.set(p.index, p));

  // 建立历史消息索引 (nodeId -> history)
  const historyMap = new Map<string, (typeof chatHistory)[0]>();
  chatHistory.forEach((h) => historyMap.set(h.nodeId, h));

  return finalMessages.map((finalMsg, i) => {
    // 基础信息
    const baseMsg: UnifiedMessage = {
      key: `msg-${i}`,
      role: finalMsg.role,
      content: finalMsg.content,
      charCount: 0, // 稍后计算
      source: "unknown",
    };

    // 计算字符数
    const contentStr =
      typeof finalMsg.content === "string" ? finalMsg.content : JSON.stringify(finalMsg.content);
    baseMsg.charCount = contentStr.length;

    // 根据来源元数据进行匹配
    // 新增：处理合并后的消息
    if (finalMsg.sourceType === "merged" && finalMsg._mergedSources) {
      let totalTokenCount = 0;
      let source: UnifiedMessage["source"] = "unknown";
      let userName: string | undefined;
      let userIcon: string | undefined;
      let agentName: string | undefined;
      let agentIcon: string | undefined;

      const mergedRole = finalMsg.role;

      for (const sourceMsg of finalMsg._mergedSources) {
        // 获取源数据对象 (Preset 或 History)
        let sourceData: any = null;

        if (sourceMsg.sourceType === "agent_preset" && sourceMsg.sourceIndex !== undefined) {
          sourceData = presetMap.get(sourceMsg.sourceIndex);
          source = "agent_preset"; // 只要含预设，整体即为预设来源（优先级更高）
        } else if (sourceMsg.sourceType === "session_history" && sourceMsg.sourceId) {
          sourceData = historyMap.get(String(sourceMsg.sourceId));
          if (source !== "agent_preset") source = "session_history";
        }

        if (sourceData) {
          // 1. 累加 Token
          if (sourceData.tokenCount) totalTokenCount += sourceData.tokenCount;

          // 2. 提取身份信息 (仅当尚未提取到时，优先取第一个非空的)
          if (mergedRole === "user") {
            if (!userName && sourceData.userName) userName = sourceData.userName;
            if (!userIcon && sourceData.userIcon) userIcon = sourceData.userIcon;
          } else if (mergedRole === "assistant") {
            // 注意：preset 数据结构中通常没有 agentName/Icon，访问 undefined 也没关系
            if (!agentName && sourceData.agentName) agentName = sourceData.agentName;
            if (!agentIcon && sourceData.agentIcon) agentIcon = sourceData.agentIcon;
          }
          // system 角色不需要提取名字头像
        }
      }

      return {
        ...baseMsg,
        key: `merged-${i}`,
        tokenCount: totalTokenCount > 0 ? totalTokenCount : undefined,
        source: source,
        userName,
        userIcon,
        agentName,
        agentIcon,
        _mergedSources: finalMsg._mergedSources, // 传递下去用于调试或未来扩展
      };
    } else if (finalMsg.sourceType === "agent_preset" && finalMsg.sourceIndex !== undefined) {
      const preset = presetMap.get(finalMsg.sourceIndex);
      if (preset) {
        return {
          ...baseMsg,
          key: `preset-${preset.index}-${i}`,
          tokenCount: preset.tokenCount,
          source: "agent_preset",
          userName: preset.userName,
          userIcon: preset.userIcon,
        };
      }
    } else if (finalMsg.sourceType === "session_history" && finalMsg.sourceId) {
      const history = historyMap.get(String(finalMsg.sourceId));
      if (history) {
        return {
          ...baseMsg,
          key: `history-${history.nodeId}-${i}`,
          tokenCount: history.tokenCount,
          source: "session_history",
          userName: history.userName,
          userIcon: history.userIcon,
          agentName: history.agentName,
          agentIcon: history.agentIcon,
          attachments: history.attachments,
        };
      }
    } else if (finalMsg.sourceType === "user_profile" && finalMsg.sourceIndex !== undefined) {
      // 系统预设（如用户档案），同样从 presetMap 获取详细信息
      const preset = presetMap.get(finalMsg.sourceIndex);
      if (preset) {
        return {
          ...baseMsg,
          key: `system-preset-${preset.index}-${i}`,
          tokenCount: preset.tokenCount,
          source: "agent_preset", // 归类为预设
          userName: preset.userName,
          userIcon: preset.userIcon,
        };
      }
    } else if (
      (finalMsg.sourceType === "depth_injection" || finalMsg.sourceType === "anchor_injection") &&
      finalMsg.sourceIndex !== undefined
    ) {
      // 注入消息（归类为预设）
      const preset = presetMap.get(finalMsg.sourceIndex);
      if (preset) {
        return {
          ...baseMsg,
          key: `injection-${preset.index}-${i}`,
          tokenCount: preset.tokenCount,
          source: "agent_preset",
          userName: preset.userName,
          userIcon: preset.userIcon,
        };
      }
    }

    // 如果没有明确来源或匹配失败，保持基本信息
    return baseMsg;
  });
});

/**
 * 获取角色显示名称
 */
function getRoleName(msg: UnifiedMessage): string {
  if (msg.role === "system") {
    return "系统";
  }
  if (msg.role === "user") {
    return msg.userName || "用户";
  }
  if (msg.role === "assistant") {
    return msg.agentName || props.contextData.agentInfo.name || "助手";
  }
  return msg.role;
}

/**
 * 获取来源标签类型
 */
function getSourceTagType(source: UnifiedMessage["source"]): "warning" | "success" | "info" {
  switch (source) {
    case "agent_preset":
      return "warning";
    case "session_history":
      return "success";
    default:
      return "info";
  }
}

/**
 * 获取来源标签文本
 */
function getSourceLabel(msg: UnifiedMessage): string {
  if (msg.source === "agent_preset" && msg._mergedSources && msg._mergedSources.length > 1) {
    return `预设 (合并 x${msg._mergedSources.length})`;
  }

  switch (msg.source) {
    case "agent_preset":
      return "预设";
    case "session_history":
      return "历史";
    default:
      return "未知";
  }
}

/**
 * 获取显示内容（处理多模态内容）
 */
function getDisplayContent(content: string | LlmMessageContent[]): string {
  if (typeof content === "string") {
    return content;
  }
  // 多模态内容，提取文本部分
  const textParts = content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => (part as { type: "text"; text: string }).text);
  const otherParts = content.filter((part) => part.type !== "text");

  let result = textParts.join("\n");
  if (otherParts.length > 0) {
    result += `\n[+ ${otherParts.length} 个非文本内容]`;
  }
  return result;
}

// 辅助函数：解决 template 中直接使用 as unknown as 导致的高亮错乱问题
const castToAsset = (val: any): Asset => val as Asset;
const castToAssetArray = (val: any): Asset[] => val as Asset[];
</script>

<style scoped>
.structured-view {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-header {
  font-weight: bold;
  color: var(--el-text-color-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.header-tags {
  display: flex;
  gap: 8px;
  align-items: center;
}

.agent-info {
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: stretch;
}

.agent-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-weight: 500;
  color: var(--el-text-color-secondary);
  min-width: 80px;
}

.value {
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.agent-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 4px;
}

.icon-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-emoji {
  font-size: 18px;
  line-height: 1;
}

.stats-card {
  margin-bottom: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--el-color-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-item.primary .stat-value {
  color: var(--el-color-success);
}

.char-count {
  font-size: 12px;
  font-weight: normal;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  padding-bottom: 8px;
  border-bottom: 2px solid var(--el-border-color);
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.message-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-role-name {
  font-size: 14px;
}

.system-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-fill-color);
  border-radius: 4px;
  color: var(--el-text-color-secondary);
}

.source-tag {
  margin-left: 4px;
}

.message-content {
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--el-text-color-primary);
  max-height: 400px;
  overflow-y: auto;
  line-height: 1.6;
}

.attachments-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.attachments-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.attachments-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
</style>
