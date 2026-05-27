import { ref, onUnmounted } from "vue";

export interface ContextMenuItem {
  /** 菜单项标识 */
  id: string;
  /** 显示文本 */
  label: string;
  /** 图标组件名（可选） */
  icon?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否为分隔线 */
  separator?: boolean;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** 附加数据，用于回调时识别上下文 */
  context: Record<string, unknown>;
}

export function useContextMenu() {
  const state = ref<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    items: [],
    context: {},
  });

  function show(
    event: MouseEvent,
    items: ContextMenuItem[],
    context: Record<string, unknown> = {}
  ) {
    event.preventDefault();
    event.stopPropagation();

    // 计算位置，确保菜单不超出视口
    const x = event.clientX;
    const y = event.clientY;

    state.value = {
      visible: true,
      x,
      y,
      items,
      context,
    };
  }

  function hide() {
    state.value.visible = false;
  }

  // 点击外部关闭
  function onDocumentClick() {
    if (state.value.visible) {
      hide();
    }
  }

  // 按 Escape 关闭
  function onDocumentKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && state.value.visible) {
      hide();
    }
  }

  // 注册全局事件
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);

  onUnmounted(() => {
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onDocumentKeydown);
  });

  return {
    state,
    show,
    hide,
  };
}
