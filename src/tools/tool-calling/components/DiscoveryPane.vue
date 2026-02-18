<script setup lang="ts">
import { ref, computed } from "vue";
import { Search, Info, ChevronRight, Package, Box } from "lucide-vue-next";

const props = defineProps<{
  groups: any[];
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "load", group: any, method: any): void;
}>();

const selectedToolId = ref<string | null>(null);

const selectedGroup = computed(() => {
  if (!selectedToolId.value) return null;
  return props.groups.find((g) => g.toolId === selectedToolId.value) || null;
});

const selectTool = (toolId: string) => {
  if (selectedToolId.value === toolId) {
    selectedToolId.value = null;
  } else {
    selectedToolId.value = toolId;
  }
};
</script>

<template>
  <div class="pane discovery-pane">
    <div class="pane-header">
      <div class="header-info">
        <Info :size="16" />
        <span>展示 AIO Hub 中所有可供 agent 调用的方法。</span>
      </div>
      <el-button :icon="Search" size="small" @click="emit('refresh')">刷新库</el-button>
    </div>

    <div class="pane-content">
      <!-- 左侧网格区域 -->
      <div class="grid-area scrollbar-styled">
        <div class="tool-grid">
          <div
            v-for="group in groups"
            :key="group.toolId"
            class="tool-card"
            :class="{ active: selectedToolId === group.toolId }"
            @click="selectTool(group.toolId)"
          >
            <div class="card-body">
              <div class="tool-icon">
                <Package :size="20" />
              </div>
              <div class="tool-info">
                <div class="tool-name">{{ group.toolName }}</div>
                <div class="tool-id">{{ group.toolId }}</div>
              </div>
              <div class="method-count">
                <el-tag size="small" effect="plain" round>{{ group.methods.length }}</el-tag>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧详情侧栏 -->
      <Transition name="slide">
        <div v-if="selectedGroup" class="detail-sidebar scrollbar-styled">
          <div class="sidebar-header">
            <div class="sidebar-title">
              <Box :size="18" />
              <span>{{ selectedGroup.toolName }}</span>
            </div>
            <div class="sidebar-id">{{ selectedGroup.toolId }}</div>
          </div>

          <div class="method-list">
            <div v-for="method in selectedGroup.methods" :key="method.name" class="method-item">
              <div class="method-header">
                <code class="method-name">{{ method.name }}</code>
                <el-button
                  class="load-btn"
                  size="small"
                  type="primary"
                  link
                  @click="emit('load', selectedGroup, method)"
                >
                  加载执行
                  <ChevronRight :size="14" />
                </el-button>
              </div>
              <div class="method-desc">{{ method.description || "暂无描述" }}</div>

              <div v-if="method.parameters?.length" class="param-section">
                <div class="param-title">参数列表</div>
                <div class="param-list">
                  <div v-for="p in method.parameters" :key="p.name" class="param-row">
                    <span class="p-name">{{ p.name }}</span>
                    <span class="p-sep">:</span>
                    <span class="p-type">{{ p.type }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-header {
  padding: 12px 20px;
  background-color: rgba(var(--text-color-rgb), 0.02);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.pane-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.grid-area {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  min-width: 0;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  align-content: start;
}

.tool-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.tool-card:hover {
  border-color: var(--el-color-primary-light-5);
  background-color: rgba(var(--el-color-primary-rgb), 0.02);
}

.tool-card.active {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}

.card-body {
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background-color: var(--input-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-id {
  font-size: 11px;
  color: var(--text-color-secondary);
  font-family: var(--el-font-family-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 详情侧栏 */
.detail-sidebar {
  width: 340px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  background-color: var(--card-bg);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  z-index: 10;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(var(--text-color-rgb), 0.01);
}

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 16px;
  color: var(--el-color-primary);
  margin-bottom: 4px;
}

.sidebar-id {
  font-size: 12px;
  color: var(--text-color-secondary);
  font-family: var(--el-font-family-mono);
}

.method-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.method-item {
  padding: 12px;
  border-radius: 8px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
}

.method-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.method-name {
  font-weight: 700;
  font-size: 13px;
  color: var(--text-color);
  font-family: var(--el-font-family-mono);
}

.method-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.5;
  margin-bottom: 12px;
}

.param-section {
  border-top: 1px dashed var(--border-color);
  padding-top: 10px;
}

.param-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 12px;
  font-family: var(--el-font-family-mono);
}

.p-name {
  color: var(--el-color-primary);
  font-weight: 500;
}

.p-sep {
  color: var(--text-color-secondary);
  opacity: 0.5;
}

.p-type {
  color: var(--el-color-info);
}

/* 动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  width: 0;
  opacity: 0;
}

.scrollbar-styled::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-styled::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}
</style>
