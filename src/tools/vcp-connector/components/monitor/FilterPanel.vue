<template>
  <div class="filter-panel">
    <div class="panel-section">
      <h4 class="section-title">消息过滤</h4>

      <div class="filter-group">
        <label class="filter-label">消息类型</label>
        <div class="type-filters">
          <div
            v-for="type in typeOptions"
            :key="type.value"
            class="type-filter-item"
            :class="[type.class, { active: selectedTypes.includes(type.value) }]"
            @click="toggleType(type.value)"
          >
            <div class="type-indicator"></div>
            <span class="type-name">{{ type.label }}</span>
            <span class="type-desc">{{ type.desc }}</span>
          </div>
        </div>
      </div>

      <div class="filter-group">
        <label class="filter-label">记录限制</label>
        <div class="limit-setting">
          <el-input-number
            v-model="maxHistory"
            :min="50"
            :max="600"
            :step="50"
            size="small"
            controls-position="right"
            @change="updateMaxHistory"
          />
          <span class="limit-unit">条</span>
        </div>
        <div class="limit-tip">减少数量可缓解高频消息下的 IO 压力</div>
      </div>
    </div>

    <div class="panel-section stats-section">
      <h4 class="section-title">统计信息</h4>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value rag">{{ stats.ragCount }}</span>
          <span class="stat-label">RAG</span>
        </div>
        <div class="stat-item">
          <span class="stat-value chain">{{ stats.chainCount }}</span>
          <span class="stat-label">Chain</span>
        </div>
        <div class="stat-item">
          <span class="stat-value agent">{{ stats.agentCount }}</span>
          <span class="stat-label">Agent</span>
        </div>
        <div class="stat-item">
          <span class="stat-value memo">{{ stats.memoCount }}</span>
          <span class="stat-label">Memo</span>
        </div>
        <div class="stat-item">
          <span class="stat-value plugin">{{ stats.pluginCount || 0 }}</span>
          <span class="stat-label">Plugin</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useVcpStore } from "../../stores/vcpConnectorStore";
import type { VcpMessageType } from "../../types/protocol";

const store = useVcpStore();

const selectedTypes = ref<VcpMessageType[]>([...store.filter.types]);
const maxHistory = ref(store.config.maxHistory);

const stats = computed(() => store.stats);

const typeOptions = [
  { value: "RAG_RETRIEVAL_DETAILS", label: "RAG", desc: "检索详情", class: "rag" },
  { value: "META_THINKING_CHAIN", label: "Chain", desc: "思考链", class: "chain" },
  { value: "AGENT_PRIVATE_CHAT_PREVIEW", label: "Agent", desc: "私聊预览", class: "agent" },
  { value: "AI_MEMO_RETRIEVAL", label: "Memo", desc: "记忆回溯", class: "memo" },
  { value: "PLUGIN_STEP_STATUS", label: "Plugin", desc: "插件步骤", class: "plugin" },
] as const;

function toggleType(type: VcpMessageType) {
  const index = selectedTypes.value.indexOf(type);
  if (index > -1) {
    selectedTypes.value.splice(index, 1);
  } else {
    selectedTypes.value.push(type);
  }
  store.setFilter({ types: [...selectedTypes.value] });
}

function updateMaxHistory(val: number | undefined) {
  if (val) {
    store.updateConfig({ maxHistory: val });
  }
}

watch(
  () => store.filter.types,
  (types) => {
    selectedTypes.value = [...types];
  }
);

watch(
  () => store.config.maxHistory,
  (val) => {
    maxHistory.value = val;
  }
);
</script>

<style scoped lang="css">
.filter-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
}

.panel-section {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.filter-group {
  margin-bottom: 16px;
}

.filter-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.type-filters {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.type-filter-item {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  backdrop-filter: blur(var(--ui-blur));
}

.type-filter-item:hover {
  background: var(--el-fill-color-light);
  transform: translateX(2px);
}

.type-indicator {
  width: 4px;
  height: 14px;
  border-radius: 2px;
  margin-right: 8px;
  background: var(--el-text-color-placeholder);
  transition: all 0.2s;
}

.type-name {
  font-size: 11px;
  font-weight: 700;
  margin-right: 8px;
  min-width: 40px;
  color: var(--el-text-color-regular);
}

.type-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 激活状态样式 */
.type-filter-item.active {
  background: var(--el-fill-color-light);
  border-color: var(--border-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.type-filter-item.active .type-name {
  color: var(--el-text-color-primary);
}

/* 颜色定义 - 统一使用透明度 HEX 以确保通透感 */
.type-filter-item.rag .type-indicator {
  background: #3b82f6;
}
.type-filter-item.rag.active {
  border-color: #3b82f680;
  background: #3b82f620;
}

.type-filter-item.chain .type-indicator {
  background: #a855f7;
}
.type-filter-item.chain.active {
  border-color: #a855f780;
  background: #a855f720;
}

.type-filter-item.agent .type-indicator {
  background: #f59e0b;
}
.type-filter-item.agent.active {
  border-color: #f59e0b80;
  background: #f59e0b20;
}

.type-filter-item.memo .type-indicator {
  background: #10b981;
}
.type-filter-item.memo.active {
  border-color: #10b98180;
  background: #10b98120;
}

.type-filter-item.plugin .type-indicator {
  background: #71717a;
}
.type-filter-item.plugin.active {
  border-color: #71717a80;
  background: #71717a20;
}

.stats-section {
  flex: 1;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border-radius: 8px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  transition: all 0.3s ease;
}

.stat-item:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-value.rag {
  color: #3b82f6;
}
.stat-value.chain {
  color: #a855f7;
}
.stat-value.agent {
  color: #f59e0b;
}
.stat-value.memo {
  color: #10b981;
}
.stat-value.plugin {
  color: #71717a;
}

.stat-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>
