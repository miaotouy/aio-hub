<template>
  <div class="token-calculator-container">
    <div class="main-wrapper">
      <!-- 顶部工具栏 -->
      <ToolBar
        v-model:calculation-mode="calculationMode"
        v-model:selected-model-id="selectedModelId"
        v-model:max-display-tokens="maxDisplayTokens"
        :available-models="availableModels"
        @paste="pasteText"
        @copy="copyText"
        @clear="clearAll"
      />

      <!-- 主内容区域 -->
      <div class="content-container" ref="contentContainer">
        <!-- 左侧输入区 -->
        <InputPanel
          ref="inputPanel"
          v-model:input-text="inputText"
          :sanitized-character-count="sanitizedCharacterCount"
          @update:input-text="handleInputChange"
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
          :is-calculating="isCalculating"
          :calculation-result="calculationResult"
          :tokenized-text="tokenizedText"
          :character-count="sanitizedCharacterCount"
          :get-token-color="getTokenColor"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import { customMessage } from '@/utils/customMessage';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useTokenCalculator } from '@/tools/token-calculator/composables/useTokenCalculatorState';
import { usePanelResize } from './composables/usePanelResize';
import ToolBar from './components/ToolBar.vue';
import InputPanel from './components/InputPanel.vue';
import ResultPanel from './components/ResultPanel.vue';

// 使用 composable
const {
  inputText,
  calculationMode,
  selectedModelId,
  isCalculating,
  calculationResult,
  tokenizedText,
  maxDisplayTokens,
  availableModels,
  sanitizedCharacterCount,
  handleInputChange,
  setInputText,
  clearAll,
  getTokenColor,
  initializeDefaultModel,
} = useTokenCalculator();

// DOM 引用
const contentContainer = ref<HTMLElement | null>(null);
const inputPanel = ref<InstanceType<typeof InputPanel> | null>(null);
const resultPanel = ref<InstanceType<typeof ResultPanel> | null>(null);

// 使用面板调整大小 composable
const { startResize, cleanup, isDragging, initializePanelWidth } = usePanelResize({
  contentContainer,
  inputPanel: inputPanel as Ref<{ rootEl: HTMLElement | null } | null>,
  resultPanel: resultPanel as Ref<{ rootEl: HTMLElement | null } | null>,
});

// 初始化
onMounted(async () => {
  await initializeDefaultModel();
  // 初始化面板宽度需要在下一个 tick，确保 DOM 已挂载
  setTimeout(() => {
    initializePanelWidth();
  }, 0);
});

onUnmounted(() => {
  cleanup();
});

// 粘贴文本
const pasteText = async () => {
  try {
    const text = await readText();
    setInputText(text);
    customMessage.success('已从剪贴板粘贴内容');
  } catch (error: any) {
    customMessage.error(`粘贴失败: ${error.message}`);
  }
};

// 复制文本
const copyText = async () => {
  if (!inputText.value) {
    customMessage.warning('没有可复制的内容');
    return;
  }
  try {
    await writeText(inputText.value);
    customMessage.success('已复制到剪贴板');
  } catch (error: any) {
    customMessage.error(`复制失败: ${error.message}`);
  }
};
</script>

<style scoped>
.token-calculator-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  padding: 6px;
  box-sizing: border-box;
}

/* 主包裹容器 - 统一的圆角大框 */
.main-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  background-color: var(--card-bg);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-sizing: border-box;
  backdrop-filter: blur(var(--ui-blur));
}

/* 主内容区域 */
.content-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  box-sizing: border-box;
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
  content: '';
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

/* 响应式布局 */
@media (max-width: 768px) {
  .token-calculator-container {
    padding: 8px;
  }

  .main-wrapper {
    border-radius: 8px;
  }

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