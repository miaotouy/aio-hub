<template>
  <div class="editor-row injection-row">
    <span class="field-label">注入</span>
    <div class="injection-config">
      <el-radio-group v-model="injectionMode" size="small">
        <el-radio-button value="default">
          <el-tooltip content="按预设列表顺序排列" placement="top">
            <span>跟随列表</span>
          </el-tooltip>
        </el-radio-button>
        <el-radio-button value="depth">
          <el-tooltip content="插入到会话历史的特定深度" placement="top">
            <span>📍 深度</span>
          </el-tooltip>
        </el-radio-button>
        <el-radio-button value="advanced_depth">
          <el-tooltip content="高级深度注入 (循环/条件)" placement="top">
            <span>🔩 高级</span>
          </el-tooltip>
        </el-radio-button>
        <el-radio-button value="anchor">
          <el-tooltip content="吸附到特定锚点位置" placement="top">
            <span>⚓ 锚点</span>
          </el-tooltip>
        </el-radio-button>
      </el-radio-group>

      <div v-if="injectionMode === 'depth'" class="injection-params">
        <el-input-number
          v-model="depthValue"
          :min="0"
          :max="99"
          size="small"
          controls-position="right"
        />
        <span class="param-hint">0 = 紧跟最新消息</span>
      </div>

      <div v-if="injectionMode === 'advanced_depth'" class="injection-params">
        <el-input
          v-model="depthConfigValue"
          placeholder="如 3, 10~5"
          size="small"
          style="width: 160px"
        />
        <el-tooltip placement="top">
          <template #content>
            <div style="max-width: 280px; line-height: 1.5">
              <p style="margin: 0 0 8px 0"><strong>混合深度语法</strong></p>
              <ul style="padding-left: 16px; margin: 0">
                <li><strong>5</strong> → 仅在深度 5 注入</li>
                <li><strong>3, 10, 15</strong> → 在多个深度各注入一次</li>
                <li><strong>10~5</strong> → 从深度 10 开始，每 5 条注入</li>
                <li>
                  <strong>3, 10~5</strong> → 混合：深度 3 一次 + 从 10 起每 5
                  条注入一次
                </li>
              </ul>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #909399">
                注意：历史消息数不足时，对应深度点会被跳过
              </p>
            </div>
          </template>
          <el-icon class="info-icon"><InfoFilled /></el-icon>
        </el-tooltip>
      </div>

      <div v-if="injectionMode === 'anchor'" class="injection-params">
        <el-select v-model="anchorTarget" size="small" style="width: 120px">
          <el-option
            v-for="anchor in availableAnchors"
            :key="anchor.id"
            :label="anchor.name"
            :value="anchor.id"
          />
        </el-select>
        <el-radio-group v-model="anchorPosition" size="small">
          <el-radio-button value="before">之前</el-radio-button>
          <el-radio-button value="after">之后</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="injectionMode !== 'default'" class="order-input">
        <span class="order-label">优先级:</span>
        <el-input-number
          v-model="orderValue"
          :min="0"
          :max="1000"
          :step="10"
          size="small"
          controls-position="right"
          style="width: 100px"
        />
        <el-tooltip content="值越大越靠近新消息（对话末尾）" placement="top">
          <el-icon class="info-icon"><InfoFilled /></el-icon>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { InfoFilled } from "@element-plus/icons-vue";
import { useAnchorRegistry } from "../../../composables/ui/useAnchorRegistry";
import type { InjectionStrategy } from "../../../types";

type InjectionMode = "default" | "depth" | "advanced_depth" | "anchor";

const props = defineProps<{ modelValue: InjectionStrategy | undefined }>();
const emit = defineEmits<{ "update:modelValue": [value: InjectionStrategy] }>();

const { getAvailableAnchors } = useAnchorRegistry();
const availableAnchors = computed(() => getAvailableAnchors());

const injectionMode = ref<InjectionMode>("default");
const depthValue = ref(0);
const depthConfigValue = ref("");
const anchorTarget = ref("chat_history");
const anchorPosition = ref<"before" | "after">("after");
const orderValue = ref(100);

function restore(strategy: InjectionStrategy | undefined) {
  if (strategy) {
    if (strategy.depth !== undefined) depthValue.value = strategy.depth;
    if (strategy.depthConfig !== undefined)
      depthConfigValue.value = strategy.depthConfig;
    if (strategy.anchorTarget !== undefined)
      anchorTarget.value = strategy.anchorTarget;
    if (strategy.anchorPosition !== undefined)
      anchorPosition.value = strategy.anchorPosition;
    if (strategy.order !== undefined) orderValue.value = strategy.order;
  } else {
    depthValue.value = 0;
    depthConfigValue.value = "";
    anchorTarget.value = "chat_history";
    anchorPosition.value = "after";
    orderValue.value = 100;
  }
  if (!strategy) {
    injectionMode.value = "default";
    return;
  }
  if (strategy.type) {
    injectionMode.value = strategy.type;
    return;
  }
  if (strategy.depthConfig) injectionMode.value = "advanced_depth";
  else if (strategy.depth !== undefined) injectionMode.value = "depth";
  else if (strategy.anchorTarget) injectionMode.value = "anchor";
  else injectionMode.value = "default";
}

watch(() => props.modelValue, restore, { immediate: true, deep: true });

watch(
  [
    injectionMode,
    depthValue,
    depthConfigValue,
    anchorTarget,
    anchorPosition,
    orderValue,
  ],
  () => {
    emit("update:modelValue", {
      type: injectionMode.value,
      depth: depthValue.value,
      depthConfig: depthConfigValue.value,
      anchorTarget: anchorTarget.value,
      anchorPosition: anchorPosition.value,
      order: orderValue.value,
    });
  }
);
</script>

<style scoped>
.editor-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.field-label {
  width: 60px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.injection-row {
  flex-wrap: wrap;
  gap: 12px;
}

.injection-config {
  flex: 1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.injection-params {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.order-input {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.order-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.info-icon {
  color: var(--el-text-color-secondary);
  cursor: help;
}
</style>
