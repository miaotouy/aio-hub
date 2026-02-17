<script setup lang="ts">
import { Search, Info, ChevronRight } from "lucide-vue-next";

defineProps<{
  groups: any[];
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "load", group: any, method: any): void;
}>();
</script>

<template>
  <div class="pane discovery-pane scrollbar-styled">
    <div class="pane-header">
      <div class="header-info">
        <Info :size="16" />
        <span>展示 AIO Hub 中所有可供 agent 调用的方法。</span>
      </div>
      <el-button :icon="Search" size="small" @click="emit('refresh')">刷新库</el-button>
    </div>

    <div class="tool-grid">
      <div v-for="group in groups" :key="group.toolId" class="tool-card">
        <div class="card-head">
          <div class="tool-info">
            <span class="tool-name">{{ group.toolName }}</span>
            <span class="tool-id">{{ group.toolId }}</span>
          </div>
        </div>
        
        <div class="method-list">
          <div v-for="method in group.methods" :key="method.name" class="method-row">
            <div class="method-meta">
              <div class="method-name-line">
                <code class="name">{{ method.name }}</code>
                <el-tag size="small" effect="plain" type="success">可调用</el-tag>
              </div>
              <div class="method-desc">{{ method.description || '暂无描述' }}</div>
              <div class="param-preview">
                <span v-for="p in method.parameters" :key="p.name" class="p-chip">
                  {{ p.name }}<span class="p-type">:{{ p.type }}</span>
                </span>
              </div>
            </div>
            <el-button 
              class="load-btn"
              size="small" 
              type="primary" 
              plain
              @click="emit('load', group, method)"
            >
              加载执行
              <ChevronRight :size="14" />
            </el-button>
          </div>
        </div>
      </div>
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
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.tool-grid {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
  align-content: start;
}

.tool-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background-color: var(--card-bg);
  overflow: hidden;
  transition: all 0.2s ease;
}

.tool-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: var(--el-box-shadow-light);
}

.card-head {
  padding: 12px 16px;
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
  border-bottom: 1px solid var(--border-color);
}

.tool-name {
  font-weight: 700;
  font-size: 15px;
  display: block;
  color: var(--el-color-primary);
}

.tool-id {
  font-size: 11px;
  color: var(--text-color-secondary);
  font-family: var(--el-font-family-mono);
}

.method-list {
  padding: 8px;
}

.method-row {
  padding: 10px 12px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.method-row:hover {
  background-color: rgba(var(--text-color-rgb), 0.03);
}

.method-meta {
  flex: 1;
  min-width: 0;
}

.method-name-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.method-name-line .name {
  font-weight: 600;
  font-size: 13px;
  font-family: var(--el-font-family-mono);
}

.method-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.param-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.p-chip {
  font-size: 10px;
  padding: 1px 4px;
  background-color: var(--input-bg);
  border-radius: 3px;
  border: 1px solid var(--border-color);
  color: var(--text-color-secondary);
}

.p-type {
  color: var(--el-color-info);
  opacity: 0.7;
}

.scrollbar-styled::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-styled::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}
</style>