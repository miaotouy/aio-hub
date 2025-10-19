import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useEventListener } from '@vueuse/core';

/**
 * 统一窗口分离的配置，与 Rust 端的 `DetachableConfig` 对应。
 */
export interface DetachableConfig {
  /** 唯一标识符 (e.g., "json-formatter" or "chat-area") */
  id: string;
  /** 显示名称 (e.g., "JSON Formatter" or "对话区域") */
  displayName: string;
  /** 窗口类型: 'tool' 或 'component' */
  type: 'tool' | 'component';
  /** 初始宽度 */
  width: number;
  /** 初始高度 */
  height: number;
  /** 鼠标起始X坐标 */
  mouseX: number;
  /** 鼠标起始Y坐标 */
  mouseY: number;
}

const isDragging = ref(false);
const sessionId = ref<string | null>(null);

/**
 * 统一处理可分离组件/工具拖拽逻辑的 Composable。
 */
export function useDetachable() {
  const startDragging = async (config: DetachableConfig) => {
    if (isDragging.value) return;

    try {
      isDragging.value = true;
      const currentSessionId = await invoke<string>('begin_detach_session', { config });
      sessionId.value = currentSessionId;
      console.log(`[DETACH] 开始拖拽会话: ${currentSessionId}`);
    } catch (error) {
      console.error('开始分离会话失败:', error);
      isDragging.value = false;
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging.value || !sessionId.value) return;

    invoke('update_detach_session_position', {
      sessionId: sessionId.value,
      x: event.screenX,
      y: event.screenY,
    }).catch(error => {
      console.error('更新预览窗口位置失败:', error);
      // 如果会话ID无效，可能意味着窗口已在另一端被关闭
      if (error.includes('不存在')) {
        stopDragging(false); // 强制停止
      }
    });
  };

  const stopDragging = (shouldDetach: boolean) => {
    if (!isDragging.value || !sessionId.value) return;
    
    console.log(`[DETACH] 结束拖拽会话: ${sessionId.value}, 是否固化: ${shouldDetach}`);

    invoke('finalize_detach_session', {
      sessionId: sessionId.value,
      shouldDetach,
    }).catch(error => {
      console.error('结束分离会话失败:', error);
    }).finally(() => {
      isDragging.value = false;
      sessionId.value = null;
    });
  };

  const handleMouseUp = (_event: MouseEvent) => {
    // [TODO]
    // 在这里可以添加逻辑，例如判断拖拽距离是否足够远
    // 为了简化，我们暂时总是认为拖拽结束就意味着要分离
    stopDragging(true);
  };

  // 只有在拖拽开始后才监听全局事件
  useEventListener(window, 'mousemove', (event) => {
    if (isDragging.value) {
      handleMouseMove(event);
    }
  });

  useEventListener(window, 'mouseup', (event) => {
    if (isDragging.value) {
      handleMouseUp(event);
    }
  });

  return {
    isDetaching: isDragging,
    startDetaching: startDragging,
  };
}