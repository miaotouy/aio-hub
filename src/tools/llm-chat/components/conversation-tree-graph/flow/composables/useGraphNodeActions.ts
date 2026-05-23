import { ref, type Ref } from "vue";
import type { ChatSessionDetail } from "../../../../types";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import type { MenuItem } from "../../ContextMenu.vue";

const logger = createModuleLogger("llm-chat/composables/useGraphNodeActions");

/**
 * 详情悬浮窗状态
 */
export interface DetailPopupState {
  visible: boolean;
  nodeId: string | null;
  targetElement: HTMLElement | null;
  initialPosition: { x: number; y: number };
}

/**
 * 节点操作 Composable
 */
export function useGraphNodeActions(
  sessionRef: () => ChatSessionDetail | null,
  contextMenuState: Ref<{ visible: boolean; x: number; y: number; items: MenuItem[] }>,
  store: any,
  errorHandler: any,
) {
  // 详情悬浮窗状态
  const detailPopupState = ref<DetailPopupState>({
    visible: false,
    nodeId: null,
    targetElement: null,
    initialPosition: { x: 200, y: 150 },
  });

  /**
   * 处理右键菜单
   */
  function handleNodeContextMenu(event: MouseEvent, nodeId: string): void {
    event.preventDefault();

    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    const items: MenuItem[] = [];

    if (node.id !== session.activeLeafId) {
      items.push({
        label: "设为当前分支",
        icon: "el-icon-position",
        action: () => {
          logger.info("切换到分支", { nodeId: node.id });
          store.switchBranch(node.id);
        },
      });
    }

    items.push({
      label: node.isEnabled !== false ? "禁用此节点" : "启用此节点",
      icon: node.isEnabled !== false ? "el-icon-circle-close" : "el-icon-circle-check",
      action: () => {
        logger.info("切换节点启用状态", { nodeId: node.id });
        store.toggleNodeEnabled(node.id);
      },
    });

    if (node.id !== session.rootNodeId) {
      items.push({
        label: "剪掉这个分支",
        icon: "el-icon-delete",
        danger: true,
        action: () => {
          logger.info("删除分支", { nodeId: node.id });
          store.deleteMessage(node.id);
        },
      });
    }

    contextMenuState.value = {
      visible: true,
      x: event.clientX,
      y: event.clientY,
      items,
    };
  }

  /**
   * 处理节点复制事件
   */
  function handleNodeCopy(nodeId: string): void {
    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    navigator.clipboard
      .writeText(node.content)
      .then(() => {
        logger.info("节点内容已复制", { nodeId });
        customMessage.success("节点内容已复制");
      })
      .catch((error) => {
        errorHandler.error(error, "复制失败");
      });
  }

  /**
   * 处理节点启用/禁用切换
   */
  function handleNodeToggleEnabled(nodeId: string): void {
    logger.info("切换节点启用状态", { nodeId });
    store.toggleNodeEnabled(nodeId);
  }

  /**
   * 处理节点删除事件
   */
  function handleNodeDelete(nodeId: string): void {
    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    if (node.id === session.rootNodeId) {
      logger.warn("根节点不允许删除");
      return;
    }

    logger.info("删除节点", { nodeId });
    store.deleteMessage(nodeId);
  }

  /**
   * 处理重新生成事件
   */
  function handleNodeRegenerate(nodeId: string, options?: { modelId?: string; profileId?: string }): void {
    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    logger.info("重新生成", { nodeId, role: node.role, options });
    store.regenerateFromNode(nodeId, options);
  }

  /**
   * 处理创建分支事件
   */
  function handleNodeCreateBranch(nodeId: string): void {
    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    logger.info("创建分支", { nodeId, role: node.role });
    store.createBranch(nodeId);
  }

  /**
   * 处理查看详情事件
   */
  function handleNodeViewDetail(nodeId: string, event: MouseEvent): void {
    logger.info("查看节点详情", { nodeId });

    const targetElement = event.currentTarget as HTMLElement;

    const popupWidth = 400;
    const popupMaxHeight = window.innerHeight * 0.7;
    const padding = 20;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = event.clientX + 20;
    let y = event.clientY - 50;

    if (x + popupWidth + padding > viewportWidth) {
      x = event.clientX - popupWidth - 20;
      if (x < padding) {
        x = viewportWidth - popupWidth - padding;
      }
    }

    if (x < padding) {
      x = padding;
    }

    if (y + popupMaxHeight + padding > viewportHeight) {
      y = viewportHeight - popupMaxHeight - padding - 40;
    }

    if (y < padding) {
      y = padding;
    }

    detailPopupState.value = {
      visible: true,
      nodeId,
      targetElement,
      initialPosition: { x, y },
    };
  }

  /**
   * 关闭详情悬浮窗
   */
  function closeDetailPopup(): void {
    detailPopupState.value.visible = false;
  }

  return {
    detailPopupState,
    handleNodeContextMenu,
    handleNodeCopy,
    handleNodeToggleEnabled,
    handleNodeDelete,
    handleNodeRegenerate,
    handleNodeCreateBranch,
    handleNodeViewDetail,
    closeDetailPopup,
  };
}