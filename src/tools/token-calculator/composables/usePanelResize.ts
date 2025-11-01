/**
 * 面板调整大小 Composable
 * 处理分割线拖拽逻辑
 */

import type { Ref } from 'vue';

interface PanelResizeOptions {
  contentContainer: Ref<HTMLElement | null>;
  inputPanel: Ref<HTMLElement | null>;
  resultPanel: Ref<HTMLElement | null>;
}

export function usePanelResize(options: PanelResizeOptions) {
  const { contentContainer, inputPanel, resultPanel } = options;

  let isResizing = false;
  let startX = 0;
  let initialInputWidth = 0;
  let initialResultWidth = 0;

  /**
   * 开始调整大小
   */
  const startResize = (e: MouseEvent) => {
    isResizing = true;
    startX = e.clientX;
    if (inputPanel.value && resultPanel.value) {
      initialInputWidth = inputPanel.value.offsetWidth;
      initialResultWidth = resultPanel.value.offsetWidth;
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  /**
   * 鼠标移动处理
   */
  const onMouseMove = (e: MouseEvent) => {
    if (!isResizing || !contentContainer.value || !inputPanel.value || !resultPanel.value) return;

    const dx = e.clientX - startX;
    const containerWidth = contentContainer.value.offsetWidth;

    let newInputWidth = initialInputWidth + dx;
    let newResultWidth = initialResultWidth - dx;

    const minWidth = 100;
    if (newInputWidth < minWidth) {
      newInputWidth = minWidth;
      newResultWidth = containerWidth - minWidth;
    }
    if (newResultWidth < minWidth) {
      newResultWidth = minWidth;
      newInputWidth = containerWidth - minWidth;
    }

    inputPanel.value.style.flexBasis = `${newInputWidth}px`;
    inputPanel.value.style.flexGrow = '0';
    resultPanel.value.style.flexBasis = `${newResultWidth}px`;
    resultPanel.value.style.flexGrow = '0';
  };

  /**
   * 鼠标释放处理
   */
  const onMouseUp = () => {
    isResizing = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
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
  };
}