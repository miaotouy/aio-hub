<script setup lang="ts">
import { MousePointer2, Crosshair, Ban, Zap } from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";

const store = useWebDistilleryStore();
</script>

<template>
  <div class="picker-status-bar" :class="`mode-${store.pickerMode}`">
    <div class="status-left">
      <div class="mode-indicator">
        <el-icon v-if="store.pickerMode === 'idle'"><MousePointer2 /></el-icon>
        <el-icon v-else-if="store.pickerMode === 'include'"><Crosshair /></el-icon>
        <el-icon v-else-if="store.pickerMode === 'exclude'"><Ban /></el-icon>
        <el-icon v-else-if="store.pickerMode === 'action'"><Zap /></el-icon>

        <span class="mode-text">
          {{
            store.pickerMode === "idle"
              ? "浏览模式"
              : store.pickerMode === "include"
                ? "拾取包含元素"
                : store.pickerMode === "exclude"
                  ? "拾取排除元素"
                  : "拾取动作目标"
          }}
        </span>
      </div>

      <div v-if="store.hoveredElement" class="element-info">
        <span class="tag-name">{{ store.hoveredElement.tagName.toLowerCase() }}</span>
        <span class="selector">{{ store.hoveredElement.selector }}</span>
      </div>
    </div>

    <div class="status-right">
      <div class="stats">
        <span
          >已选: {{ store.recipeDraft?.extractSelectors?.length || 0 }} 包含 /
          {{ store.recipeDraft?.excludeSelectors?.length || 0 }} 排除</span
        >
      </div>
      <div class="hint" v-if="store.pickerMode !== 'idle'">按 <kbd>Esc</kbd> 退出拾取</div>
    </div>
  </div>
</template>

<style scoped>
.picker-status-bar {
  height: 32px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--sidebar-bg);
  border-top: var(--border-width) solid var(--border-color);
  font-size: 12px;
  color: var(--el-text-color-regular);
  transition: all 0.3s ease;
}

.mode-include {
  border-top-color: #409eff;
}
.mode-exclude {
  border-top-color: #f56c6c;
}
.mode-action {
  border-top-color: #67c23a;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.mode-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: bold;
}

.mode-include .mode-indicator {
  color: #409eff;
}
.mode-exclude .mode-indicator {
  color: #f56c6c;
}
.mode-action .mode-indicator {
  color: #67c23a;
}

.element-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
}

.tag-name {
  color: #e67e22;
  font-family: monospace;
}

.selector {
  font-family: monospace;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint kbd {
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 0 4px;
  font-family: sans-serif;
}

.stats {
  color: var(--el-text-color-secondary);
}
</style>
