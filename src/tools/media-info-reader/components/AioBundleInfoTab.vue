<script setup lang="ts">
import { computed } from "vue";
import { ElScrollbar } from "element-plus";
import {
  FileJson,
  Fingerprint,
  Brain,
  Wrench,
  Image as ImageIcon,
  Music,
  Clock,
  Cpu,
  Settings,
  MessageSquare,
  Box,
  ChevronRight,
} from "lucide-vue-next";
import Avatar from "@/components/common/Avatar.vue";
import yaml from "js-yaml";

interface Props {
  info: string;
  format: "json" | "yaml";
  coverUrl?: string;
}

const props = defineProps<Props>();

const parsedData = computed(() => {
  try {
    if (props.format === "json") {
      return JSON.parse(props.info);
    } else {
      return yaml.load(props.info);
    }
  } catch (e) {
    console.error("Parse error:", e);
    return null;
  }
});

const agents = computed(() => {
  if (!parsedData.value) return [];
  const data = parsedData.value as any;
  if (data.type === "AIO_Agent_Export" || data.type === "AIO_Agent_Bundle") {
    return data.agents || [];
  }
  if (data.name || data.displayName) {
    return [data];
  }
  return [];
});
const getAvatarUrl = (agent: any) => {
  const avatar = agent.avatar || agent.icon;

  // 检查是否是有效的远程 URL 或 Base64
  const isValidUrl = (url: string) => {
    if (!url) return false;
    return url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:");
  };

  if (isValidUrl(avatar)) {
    return avatar;
  }

  // 如果 avatar 无效（本地路径或缺失），尝试使用传入的 coverUrl（外壳图）
  if (props.coverUrl) {
    return props.coverUrl;
  }

  // 最后尝试 bundle 顶层的 cover (如果有的话)
  if (parsedData.value?.cover && isValidUrl(parsedData.value.cover)) {
    return parsedData.value.cover;
  }

  return "";
};

const getAssetIcon = (type: string) => {
  if (type === "image") return ImageIcon;
  if (type === "audio") return Music;
  return FileJson;
};

// 格式化注入策略
const formatInjection = (strategy: any) => {
  if (!strategy) return "默认";
  const pos = strategy.anchorPosition === "after" ? "后" : "前";
  const target = strategy.anchorTarget === "chat_history" ? "聊天记录" : strategy.anchorTarget;
  if (strategy.type === "depth") return `深度注入 (层级: ${strategy.depth})`;
  if (strategy.type === "advanced_depth")
    return `高级深度 (层级: ${strategy.depth}, Config: ${strategy.depthConfig})`;
  return `${target}${pos} (Order: ${strategy.order})`;
};
</script>

<template>
  <div class="aio-bundle-container">
    <el-scrollbar class="main-scrollbar">
      <div class="content-wrapper">
        <div v-if="agents.length > 0" class="agents-stack">
          <div v-for="(agent, index) in agents" :key="index" class="agent-view">
            <!-- Header Section -->
            <div class="agent-header">
              <div class="header-main">
                <div class="avatar-container">
                  <Avatar
                    :src="getAvatarUrl(agent)"
                    :name="agent.displayName || agent.name"
                    :size="80"
                    class="agent-avatar"
                  />
                  <div class="category-badge">{{ agent.category || "Agent" }}</div>
                </div>
                <div class="info-container">
                  <div class="name-line">
                    <h2 class="agent-display-name">{{ agent.displayName || agent.name }}</h2>
                    <span class="version-badge">v{{ agent.version || "1.0" }}</span>
                  </div>
                  <p class="agent-desc">{{ agent.description || "暂无描述" }}</p>
                  <div class="quick-meta">
                    <div class="meta-tag">
                      <Cpu :size="14" />
                      <span>{{ agent.modelId }}</span>
                    </div>
                    <div class="meta-tag">
                      <Box :size="14" />
                      <span>{{ agent.assets?.length || 0 }} Assets</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="agent-content">
              <!-- 1. 思维导向 -->
              <div class="content-section">
                <div class="section-header">
                  <Fingerprint :size="18" />
                  <span>思维导向</span>
                </div>
                <div class="section-body">
                  <div class="think-rules" v-if="agent.llmThinkRules?.length">
                    <div v-for="rule in agent.llmThinkRules" :key="rule.id" class="rule-pill">
                      <Brain :size="14" />
                      <span class="rule-name">{{ rule.displayName }}</span>
                      <span class="rule-tag">{{ rule.tagName }}</span>
                    </div>
                  </div>
                  <div v-if="agent.persona" class="persona-card">
                    <div class="card-label">Persona / System Prompt</div>
                    <div class="card-text">{{ agent.persona }}</div>
                  </div>
                </div>
              </div>

              <!-- 2. 预设消息流 -->
              <div class="content-section">
                <div class="section-header">
                  <MessageSquare :size="18" />
                  <span>预设消息流</span>
                </div>
                <div class="section-body">
                  <div class="message-timeline">
                    <div
                      v-for="(msg, mIdx) in agent.presetMessages"
                      :key="msg.id"
                      class="timeline-item"
                      :class="{ disabled: !msg.isEnabled }"
                    >
                      <div class="item-connector">
                        <div class="dot"></div>
                        <div
                          v-if="Number(mIdx) < agent.presetMessages.length - 1"
                          class="line"
                        ></div>
                      </div>
                      <div class="message-card">
                        <div class="card-header">
                          <div class="role-badge" :class="msg.role">
                            {{ msg.role.toUpperCase() }}
                          </div>
                          <span class="msg-name">{{ msg.name }}</span>
                          <div class="spacer"></div>
                          <div class="injection-info">
                            <Clock :size="12" />
                            <span>{{ formatInjection(msg.injectionStrategy) }}</span>
                          </div>
                        </div>
                        <div class="card-body">{{ msg.content }}</div>
                        <div v-if="msg.modelMatch?.enabled" class="card-footer">
                          <Wrench :size="12" />
                          <span>匹配模式: {{ msg.modelMatch.patterns.join(", ") }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 3. 运行参数 -->
              <div class="content-section">
                <div class="section-header">
                  <Settings :size="18" />
                  <span>运行参数</span>
                </div>
                <div class="section-body">
                  <div class="params-grid">
                    <div class="param-card">
                      <div class="card-label">采样控制</div>
                      <div class="param-list">
                        <div class="param-entry">
                          <span class="label">Temperature</span>
                          <span class="value">{{
                            agent.parameters?.temperature ?? agent.temperature
                          }}</span>
                        </div>
                        <div class="param-entry">
                          <span class="label">Top P</span>
                          <span class="value">{{ agent.parameters?.topP ?? agent.topP }}</span>
                        </div>
                        <div class="param-entry" v-if="agent.parameters?.reasoningEffort">
                          <span class="label">Reasoning</span>
                          <span class="value">{{ agent.parameters?.reasoningEffort }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="param-card">
                      <div class="card-label">上下文压缩</div>
                      <div class="param-list">
                        <div class="param-entry">
                          <span class="label">状态</span>
                          <span class="value">{{
                            agent.parameters?.contextCompression?.enabled ? "已开启" : "未启用"
                          }}</span>
                        </div>
                        <template v-if="agent.parameters?.contextCompression?.enabled">
                          <div class="param-entry">
                            <span class="label">触发阈值</span>
                            <span class="value"
                              >{{
                                agent.parameters?.contextCompression?.tokenThreshold
                              }}
                              tokens</span
                            >
                          </div>
                          <div class="param-entry">
                            <span class="label">保留最近</span>
                            <span class="value"
                              >{{
                                agent.parameters?.contextCompression?.protectRecentCount
                              }}
                              条</span
                            >
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 4. 资产 -->
              <div class="content-section" v-if="agent.assetGroups?.length">
                <div class="section-header">
                  <ImageIcon :size="18" />
                  <span>关联资产</span>
                </div>
                <div class="section-body">
                  <div v-for="group in agent.assetGroups" :key="group.id" class="asset-group">
                    <div class="group-title">
                      <ChevronRight :size="14" />
                      <span>{{ group.icon }} {{ group.displayName }}</span>
                    </div>
                    <div class="asset-items">
                      <div
                        v-for="asset in (agent.assets as any[]).filter((a) => a.group === group.id)"
                        :key="asset.id"
                        class="asset-item-mini"
                      >
                        <component :is="getAssetIcon(asset.type)" :size="16" />
                        <span class="asset-id">{{ asset.id }}</span>
                        <span class="asset-size">{{ (asset.size / 1024).toFixed(1) }} KB</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.aio-bundle-container {
  height: 100%;
  position: relative;
  background-color: var(--el-bg-color);
}

.content-wrapper {
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.agent-view {
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 32px;
}

/* Header */
.agent-header {
  padding: 32px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--border-color);
}

.header-main {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.avatar-container {
  position: relative;
}

.agent-avatar {
  border: 2px solid var(--border-color);
  background: var(--el-bg-color);
}

.category-badge {
  position: absolute;
  bottom: -16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--el-color-primary);
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: bold;
  white-space: nowrap;
}

.info-container {
  flex: 1;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.agent-display-name {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.version-badge {
  font-size: 11px;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-secondary);
  padding: 1px 6px;
  border-radius: 4px;
}

.agent-desc {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
}

.quick-meta {
  display: flex;
  gap: 12px;
}

.meta-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 4px 10px;
  border-radius: 6px;
}

/* Content Sections */
.agent-content {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
}

/* Think Rules */
.think-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.rule-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.2);
  padding: 4px 12px;
  border-radius: 20px;
  color: var(--el-color-primary);
}

.rule-name {
  font-size: 13px;
  font-weight: 500;
}

.rule-tag {
  font-size: 11px;
  opacity: 0.6;
  font-family: var(--el-font-family-mono);
}

.persona-card {
  background: var(--el-fill-color-blank);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
}

.card-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  margin-bottom: 8px;
  letter-spacing: 0.05em;
}

.card-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}

/* Timeline Message */
.message-timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  gap: 16px;
}

.item-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 12px;
}

.item-connector .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-primary);
  margin-top: 24px;
}

.timeline-item.disabled .dot {
  background: var(--el-text-color-placeholder);
}

.item-connector .line {
  flex: 1;
  width: 2px;
  background: var(--el-border-color-lighter);
}

.message-card {
  flex: 1;
  background: var(--el-fill-color-light);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-bottom: 16px;
  padding: 16px;
}

.timeline-item.disabled .message-card {
  opacity: 0.6;
}

.message-card .card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.role-badge {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
}

.role-badge.system {
  background: var(--el-color-danger-light-8);
  color: var(--el-color-danger);
}
.role-badge.user {
  background: var(--el-color-info-light-8);
  color: var(--el-color-info);
}
.role-badge.assistant {
  background: var(--el-color-success-light-8);
  color: var(--el-color-success);
}

.msg-name {
  font-size: 13px;
  font-weight: 600;
}

.injection-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.message-card .card-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  max-height: 240px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.message-card .card-body::-webkit-scrollbar {
  width: 4px;
}

.message-card .card-body::-webkit-scrollbar-thumb {
  background: var(--el-border-color-lighter);
  border-radius: 4px;
}

.message-card .card-body::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-placeholder);
}

.message-card .card-footer {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--el-color-primary);
}

/* Params */
.params-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.param-card {
  background: var(--el-fill-color-blank);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-entry {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.param-entry .label {
  color: var(--el-text-color-secondary);
}
.param-entry .value {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* Assets */
.asset-group {
  margin-bottom: 16px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-regular);
}

.asset-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.asset-item-mini {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--el-fill-color-light);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.asset-id {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-size {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.spacer {
  flex: 1;
}

@media (max-width: 768px) {
  .params-grid {
    grid-template-columns: 1fr;
  }
  .header-main {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .quick-meta {
    justify-content: center;
  }
}
</style>
