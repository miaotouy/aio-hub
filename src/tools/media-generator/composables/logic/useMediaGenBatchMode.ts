import { ref, computed } from "vue";
import type { MediaMessage } from "../../types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("media-generator/batch-mode");

export function useMediaGenBatchMode(options: {
  nodes: { value: Record<string, MediaMessage> };
  messages: { value: MediaMessage[] };
}) {
  const { nodes, messages } = options;
  const isBatchMode = ref(false);

  /**
   * 进入批量模式
   */
  const enterBatchMode = () => {
    isBatchMode.value = true;
  };

  /**
   * 退出批量模式
   */
  const exitBatchMode = () => {
    isBatchMode.value = false;
    // 清除所有选中状态
    Object.values(nodes.value).forEach((node) => {
      if (node.isSelected) {
        node.isSelected = false;
      }
    });
  };

  /**
   * 切换消息选中状态
   */
  const toggleMessageSelection = (messageId: string) => {
    // 只有在批量模式下才允许切换选中
    if (!isBatchMode.value) return;

    const msg = nodes.value[messageId];
    if (msg) {
      msg.isSelected = !msg.isSelected;
      logger.debug("消息选中状态变更", { messageId, isSelected: msg.isSelected });
    }
  };

  /**
   * 获取当前选中的消息
   */
  const selectedMessages = computed(() => {
    return messages.value.filter((m) => m.isSelected);
  });

  return {
    isBatchMode,
    enterBatchMode,
    exitBatchMode,
    toggleMessageSelection,
    selectedMessages,
  };
}
