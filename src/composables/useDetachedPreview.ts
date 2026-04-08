import { ref, onMounted, onUnmounted } from "vue";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("composables/useDetachedPreview");

/**
 * 封装分离窗口容器通用的预览/固定模式逻辑
 */
export function useDetachedPreview() {
  const isPreview = ref(true);

  async function checkIfFinalized() {
    try {
      const currentWindow = getCurrentWebviewWindow();
      const label = currentWindow.label;
      const windows = await invoke<Array<{ id: string; label: string }>>("get_all_detached_windows");

      // 如果当前窗口标签不在已记录的 windows 列表中，说明它还是预览模式（未持久化）
      isPreview.value = !windows.some((w) => w.label === label);

      logger.debug("检查窗口状态", { label, isPreview: isPreview.value });
    } catch (error) {
      logger.error("检查窗口状态失败", error);
    }
  }

  onMounted(async () => {
    await checkIfFinalized();

    // 监听窗口被固定的事件
    const unlisten = await listen("finalize-component-view", () => {
      logger.info("收到固定窗口事件，切换预览模式");
      isPreview.value = false;
    });

    onUnmounted(() => {
      unlisten();
    });
  });

  return { isPreview, checkIfFinalized };
}
