<script setup lang="ts">
import { computed } from "vue";
import { InfoFilled, Warning, CircleCheck, Timer } from "@element-plus/icons-vue";
import { toolRegistryManager } from "@/services/registry";
import { startupManager } from "@/services/startup-manager";
import type { StartupTaskState } from "@/utils/appSettings";

const props = defineProps<{
  startupTasks?: Record<string, StartupTaskState>;
}>();

const emit = defineEmits(["update:startupTasks"]);

const startupTasks = computed({
  get: () => props.startupTasks || {},
  set: (value) => emit("update:startupTasks", value),
});

// 获取所有支持启动项的工具
const toolsWithStartup = computed(() => {
  return toolRegistryManager
    .getAllTools()
    .filter((tool) => !!tool.startupConfig)
    .map((tool) => ({
      id: tool.id,
      config: tool.startupConfig!,
      state: startupTasks.value[tool.id] || {
        enabled: tool.startupConfig!.defaultEnabled ?? false,
        consecutiveFailures: 0,
      },
    }));
});

// 获取上次执行结果（响应式，startupManager.results 是 readonly ref）
const executionResults = computed(() => {
  const resultMap = new Map();
  startupManager.results.value.forEach((r) => resultMap.set(r.toolId, r));
  return resultMap;
});

const toggleTask = (toolId: string, enabled: boolean) => {
  const newTasks = { ...startupTasks.value };
  if (!newTasks[toolId]) {
    newTasks[toolId] = {
      enabled,
      consecutiveFailures: 0,
    };
  } else {
    newTasks[toolId] = {
      ...newTasks[toolId],
      enabled,
      // 如果手动启用，重置熔断状态
      autoDisabled: enabled ? false : newTasks[toolId].autoDisabled,
      consecutiveFailures: enabled ? 0 : newTasks[toolId].consecutiveFailures,
    };
  }
  startupTasks.value = newTasks;
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};
</script>

<template>
  <div class="startup-settings">
    <div v-if="toolsWithStartup.length === 0" class="no-tasks">
      <el-empty description="暂无支持自启动的模块" :image-size="60" />
    </div>

    <div
      v-for="item in toolsWithStartup"
      :key="item.id"
      class="startup-item"
      :class="{ 'is-disabled': item.state.autoDisabled }"
    >
      <div class="item-main">
        <div class="item-info">
          <div class="item-header">
            <span class="item-label">{{ item.config.label }}</span>
            <el-tag v-if="item.state.autoDisabled" type="danger" size="small" effect="plain" class="status-tag">
              <el-icon><Warning /></el-icon> 已自动禁用
            </el-tag>
          </div>
          <div class="item-desc">{{ item.config.description }}</div>
        </div>
        <div class="item-action">
          <el-switch
            :model-value="item.state.enabled"
            @update:model-value="(val: any) => toggleTask(item.id, val as boolean)"
          />
        </div>
      </div>

      <!-- 执行状态展示 -->
      <div v-if="executionResults.has(item.id)" class="item-status">
        <div class="status-detail" :class="executionResults.get(item.id)!.success ? 'success' : 'error'">
          <el-icon v-if="executionResults.get(item.id)!.success"><CircleCheck /></el-icon>
          <el-icon v-else><Warning /></el-icon>
          <span>{{
            executionResults.get(item.id)!.success ? "启动成功" : executionResults.get(item.id)!.error || "启动失败"
          }}</span>
          <span class="duration" v-if="executionResults.get(item.id)!.duration > 0">
            <el-icon><Timer /></el-icon>
            {{ formatDuration(executionResults.get(item.id)!.duration) }}
          </span>
        </div>
      </div>

      <!-- 熔断信息提示 -->
      <div v-if="item.state.autoDisabled" class="breaker-info">
        <el-alert
          :title="`由于连续 ${item.state.consecutiveFailures} 次启动失败，该项已被熔断。`"
          type="error"
          :description="item.state.lastError ? `错误信息: ${item.state.lastError}` : ''"
          show-icon
          :closable="false"
        />
      </div>
    </div>

    <div class="startup-tips">
      <el-icon><InfoFilled /></el-icon>
      <span>自启动任务在应用启动时异步并行执行，若某项任务连续多次失败将触发熔断机制以保护应用。</span>
    </div>
  </div>
</template>

<style scoped>
.startup-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.startup-item {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s ease;
}

.startup-item:hover {
  border-color: var(--primary-color);
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
}

.startup-item.is-disabled {
  border-color: var(--el-color-danger-light-5);
  background: rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.02));
}

.item-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.item-info {
  flex: 1;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.item-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}

.item-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
}

.status-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.item-status {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color);
}

.status-detail {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.status-detail.success {
  color: var(--el-color-success);
}

.status-detail.error {
  color: var(--el-color-danger);
}

.duration {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-color-secondary);
}

.breaker-info {
  margin-top: 12px;
}

.startup-tips {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--bg-color-soft);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
}

.no-tasks {
  padding: 20px 0;
}

:deep(.el-alert__title) {
  font-size: 12px;
}
:deep(.el-alert__description) {
  font-size: 11px;
  margin-top: 4px;
}
</style>
