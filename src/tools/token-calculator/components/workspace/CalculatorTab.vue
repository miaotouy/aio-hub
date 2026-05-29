<template>
  <div class="calculator-tab">
    <!-- 顶部工具栏 -->
    <ToolBar
      v-model:calculation-mode="state.calculationMode.value"
      v-model:selected-model-id="state.selectedModelId.value"
      v-model:max-display-tokens="state.maxDisplayTokens.value"
      :available-models="state.availableModels.value"
      @paste="onPaste"
      @copy="onCopy"
      @clear="state.clearAll"
    />

    <!-- 主内容区域 -->
    <div class="content-container" ref="contentContainer">
      <!-- 左侧输入区 -->
      <InputPanel
        ref="inputPanel"
        v-model:input-text="state.inputText.value"
        :sanitized-character-count="state.sanitizedCharacterCount.value"
        :media-items="state.mediaItems.value"
        @update:input-text="state.handleInputChange"
        @add-media="state.addMediaItem"
        @remove-media="state.removeMediaItem"
      />

      <!-- 分割线 -->
      <div
        class="divider"
        @mousedown="startResize"
        :class="{ dragging: isDragging }"
      ></div>

      <!-- 右侧结果区 -->
      <ResultPanel
        ref="resultPanel"
        :is-calculating="state.isCalculating.value"
        :calculation-result="state.calculationResult.value"
        :tokenized-text="state.tokenizedText.value"
        :character-count="state.sanitizedCharacterCount.value"
        :get-token-color="state.getTokenColor"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, type Ref } from "vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { useTokenCalculator } from "../../composables/useTokenCalculatorState";
import { usePanelResize } from "../../composables/usePanelResize";
import ToolBar from "../ToolBar.vue";
import InputPanel from "../InputPanel.vue";
import ResultPanel from "../ResultPanel.vue";

type CalculatorState = ReturnType<typeof useTokenCalculator>;

interface Props {
  state: CalculatorState;
}

const props = defineProps<Props>();
const errorHandler = createModuleErrorHandler("CalculatorTab");

// DOM 引用
const contentContainer = ref<HTMLElement | null>(null);
const inputPanel = ref<InstanceType<typeof InputPanel> | null>(null);
const resultPanel = ref<InstanceType<typeof ResultPanel> | null>(null);

const { startResize, cleanup, isDragging, initializePanelWidth } =
  usePanelResize({
    contentContainer,
    inputPanel: inputPanel as Ref<{ rootEl: HTMLElement | null } | null>,
    resultPanel: resultPanel as Ref<{ rootEl: HTMLElement | null } | null>,
  });

onMounted(() => {
  setTimeout(() => initializePanelWidth(), 0);
});

onUnmounted(() => {
  cleanup();
});

const onPaste = async () => {
  try {
    const text = await readText();
    props.state.setInputText(text);
    customMessage.success("已从剪贴板粘贴内容");
  } catch (error: any) {
    errorHandler.error(error, "粘贴失败");
  }
};

const onCopy = async () => {
  if (!props.state.inputText.value) {
    customMessage.warning("没有可复制的内容");
    return;
  }
  try {
    await writeText(props.state.inputText.value);
    customMessage.success("已复制到剪贴板");
  } catch (error: any) {
    errorHandler.error(error, "复制失败");
  }
};
</script>

<style scoped>
.calculator-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.content-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  box-sizing: border-box;
  min-height: 0;
}

/* 分割线 */
.divider {
  width: 4px;
  background-color: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  transition: background-color 0.2s;
  position: relative;
}

.divider::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background-color: var(--border-color);
  transform: translateX(-50%);
  transition: background-color 0.2s;
}

.divider:hover::before,
.divider.dragging::before {
  background-color: var(--primary-color);
  width: 2px;
}

@media (max-width: 768px) {
  .content-container {
    flex-direction: column;
  }
  .divider {
    width: 100%;
    height: 4px;
    cursor: row-resize;
  }
}
</style>
