/**
 * 面板调整大小 Composable
 * 处理分割线拖拽逻辑
 */

import { ref, onMounted, type Ref } from 'vue';
import { loadTokenCalculatorConfig, updateTokenCalculatorConfig } from '../config';

interface PanelResizeOptions {
  contentContainer: Ref<HTMLElement | null>;
  inputPanel: Ref<{ rootEl: HTMLElement | null } | null>;
  resultPanel: Ref<{ rootEl: HTMLElement | null } | null>;
}

export function usePanelResize(options: PanelResizeOptions) {
  const { contentContainer, inputPanel, resultPanel } = options;

  // 面板宽度（百分比）
  const inputPanelWidthPercent = ref(50);

  // 拖拽状态
  const isDragging = ref(false);
  const dragStartX = ref(0);
  const dragStartPercent = ref(0);

  /**
   * 初始化面板宽度
   */
  const initializePanelWidth = () => {
    const inputEl = inputPanel.value?.rootEl;
    const resultEl = resultPanel.value?.rootEl;
    if (inputEl && resultEl) {
      const resultPercent = 100 - inputPanelWidthPercent.value;
      inputEl.style.flexBasis = `${inputPanelWidthPercent.value}%`;
      inputEl.style.flexGrow = '0';
      inputEl.style.flexShrink = '0';
      resultEl.style.flexBasis = `${resultPercent}%`;
      resultEl.style.flexGrow = '0';
      resultEl.style.flexShrink = '0';
    }
  };

  // 加载配置
  onMounted(async () => {
    const config = await loadTokenCalculatorConfig();
    inputPanelWidthPercent.value = config.inputPanelWidthPercent;
    initializePanelWidth();
  });

  /**
   * 开始调整大小
   */
  const startResize = (e: MouseEvent) => {
    if (!contentContainer.value) return;

    isDragging.value = true;
    dragStartX.value = e.clientX;
    dragStartPercent.value = inputPanelWidthPercent.value;
    
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  /**
   * 鼠标移动处理
   */
  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging.value || !contentContainer.value) return;

    const delta = e.clientX - dragStartX.value;
    // 将像素差值转换为百分比差值
    const deltaPercent = (delta / contentContainer.value.offsetWidth) * 100;
    const newPercent = dragStartPercent.value + deltaPercent;

    // 限制最小和最大百分比
    const minPercent = 20;
    const maxPercent = 80;

    if (newPercent >= minPercent && newPercent <= maxPercent) {
      inputPanelWidthPercent.value = newPercent;
      
      // 应用新宽度
      const inputEl = inputPanel.value?.rootEl;
      const resultEl = resultPanel.value?.rootEl;
      if (inputEl && resultEl) {
        const resultPercent = 100 - newPercent;
        inputEl.style.flexBasis = `${newPercent}%`;
        inputEl.style.flexGrow = '0';
        inputEl.style.flexShrink = '0';
        resultEl.style.flexBasis = `${resultPercent}%`;
        resultEl.style.flexGrow = '0';
        resultEl.style.flexShrink = '0';
      }
    }
  };

  /**
   * 鼠标释放处理
   */
  const onMouseUp = () => {
    isDragging.value = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    // 拖拽结束时保存配置
    updateTokenCalculatorConfig({ inputPanelWidthPercent: inputPanelWidthPercent.value });
  };

  /**
   * 清理事件监听器
   */
  const cleanup = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  return {
    startResize,
    cleanup,
    initializePanelWidth,
    isDragging,
  };
}