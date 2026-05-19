<script setup lang="ts">
import { computed } from "vue";
import { Delete } from "@element-plus/icons-vue";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-vue-next";
import type { AgentKnowledgeBaseBinding } from "@/tools/llm-chat/types/agent";

const props = defineProps<{
  binding: AgentKnowledgeBaseBinding;
  expanded: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle-expand"): void;
  (e: "toggle-enabled", value: boolean): void;
  (e: "remove"): void;
}>();

const modeLabel = computed(() => {
  switch (props.binding.mode) {
    case "always":
      return "总是检索";
    case "gate":
      return "标签门控";
    case "turn":
      return "轮次常驻";
    case "static":
      return "静态注入";
    default:
      return "总是检索";
  }
});

const macroRef = computed(() => `{{kb::${props.binding.kbName}}}`);
</script>

<template>
  <div class="kb-item" :class="{ expanded, disabled: !binding.enabled }">
    <div class="kb-item-header" @click="emit('toggle-expand')">
      <div class="kb-item-left">
        <el-icon class="expand-icon">
          <ChevronDown v-if="expanded" />
          <ChevronRight v-else />
        </el-icon>
        <el-icon class="kb-icon"><BookOpen /></el-icon>
        <div class="kb-info">
          <span class="kb-name">{{ binding.kbName }}</span>
          <span class="kb-mode-tag">{{ modeLabel }}</span>
        </div>
      </div>
      <div class="kb-item-right" @click.stop>
        <el-tooltip content="移除关联" placement="top" :show-after="500">
          <el-button link :icon="Delete" size="small" @click="emit('remove')" />
        </el-tooltip>
        <el-switch :model-value="binding.enabled" size="small" @change="emit('toggle-enabled', $event as boolean)" />
      </div>
    </div>

    <!-- 展开的配置面板 -->
    <transition name="el-zoom-in-top">
      <div v-if="expanded" class="kb-item-config">
        <el-form label-width="80px" label-position="left" size="small">
          <el-form-item label="激活模式">
            <el-select v-model="binding.mode" style="width: 100%">
              <el-option label="总是检索 (always)" value="always" />
              <el-option label="标签门控 (gate)" value="gate" />
              <el-option label="轮次常驻 (turn)" value="turn" />
              <el-option label="静态注入 (static)" value="static" />
            </el-select>
          </el-form-item>

          <!-- gate 模式参数 -->
          <el-form-item v-if="binding.mode === 'gate'" label="触发标签">
            <el-select
              v-model="binding.modeParams"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="输入标签并回车"
              style="width: 100%"
            />
          </el-form-item>

          <!-- turn 模式参数 -->
          <el-form-item v-if="binding.mode === 'turn'" label="轮次间隔">
            <el-input-number
              :model-value="binding.modeParams?.[0] ? parseInt(binding.modeParams[0]) : 1"
              :min="1"
              :max="100"
              controls-position="right"
              @change="binding.modeParams = [$event?.toString() || '1']"
            />
          </el-form-item>

          <el-form-item label="召回上限">
            <el-input-number
              v-model="binding.limit"
              :min="1"
              :max="50"
              placeholder="使用全局默认"
              controls-position="right"
            />
            <span class="unit-hint">留空使用全局默认</span>
          </el-form-item>

          <el-form-item label="最低分数阈值">
            <el-input-number
              v-model="binding.minScore"
              :min="0"
              :max="1"
              :step="0.05"
              :precision="2"
              placeholder="使用全局默认"
              controls-position="right"
            />
            <span class="unit-hint">留空使用全局默认</span>
          </el-form-item>

          <div class="macro-ref-hint">
            <span class="hint-label">宏引用:</span>
            <code class="hint-code">{{ macroRef }}</code>
          </div>
        </el-form>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.kb-item {
  border-bottom: var(--border-width) solid var(--border-color);
}

.kb-item:last-child {
  border-bottom: none;
}

.kb-item.disabled .kb-item-header {
  opacity: 0.6;
}

.kb-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.kb-item-header:hover {
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.06));
}

.kb-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.expand-icon {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.kb-icon {
  font-size: 16px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.kb-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.kb-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kb-mode-tag {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.kb-item-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.kb-item-config {
  padding: 12px 16px 16px 40px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.04));
  backdrop-filter: blur(var(--ui-blur));
  border-top: var(--border-width) solid var(--border-color);
}

.kb-item-config :deep(.el-form-item) {
  margin-bottom: 12px;
}

.kb-item-config :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.unit-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-left: 8px;
  white-space: nowrap;
}

.macro-ref-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.08));
  border-radius: 4px;
  margin-top: 8px;
}

.hint-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.hint-code {
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  color: var(--el-color-primary);
  user-select: all;
}
</style>
