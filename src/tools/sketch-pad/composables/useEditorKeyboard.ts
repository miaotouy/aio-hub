import { onMounted, onUnmounted } from "vue";
import type { EditorSession } from "./useEditorSession";
import type { useEditorExport } from "./useEditorExport";
import type { useHistoryApplicator } from "./useHistoryApplicator";

/**
 * 编辑器快捷键系统
 * 从 session 读状态，调 actions 和 capabilities
 */
export function useEditorKeyboard(
  session: EditorSession,
  exportActions: ReturnType<typeof useEditorExport>,
  historyApplicator: ReturnType<typeof useHistoryApplicator>,
) {
  const { state, runtime, actions } = session;

  function handleGlobalKeyDown(e: KeyboardEvent): void {
    // 文本编辑状态下，只保留带修饰键的快捷键
    const isTextEditing =
      document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT";

    // 带修饰键的快捷键（始终生效）
    if (e.ctrlKey || e.metaKey) {
      handleModifierShortcuts(e, isTextEditing);
      return;
    }

    // 单字母快捷键（文本编辑时不生效）
    if (isTextEditing) return;
    if (state.currentView.value !== "editor") return;

    handleSingleKeyShortcuts(e);
  }

  function handleModifierShortcuts(e: KeyboardEvent, isTextEditing: boolean): void {
    switch (e.key.toLowerCase()) {
      case "s":
        e.preventDefault();
        if (e.shiftKey) {
          exportActions.handleIncrementalSave();
        } else {
          exportActions.handleSave();
        }
        return;

      case "z":
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;

      case "y":
        e.preventDefault();
        handleRedo();
        return;

      case "a":
        if (state.currentView.value === "editor" && !isTextEditing) {
          e.preventDefault();
          runtime.capabilities.selectAll();
        }
        return;

      case "0":
        e.preventDefault();
        runtime.capabilities.resetView();
        return;

      case "=":
      case "+":
        e.preventDefault();
        handleZoomStep(0.1);
        return;

      case "-":
        e.preventDefault();
        handleZoomStep(-0.1);
        return;

      case "]":
        e.preventDefault();
        if (e.shiftKey) {
          runtime.capabilities.reorderSelectedObject("top");
        } else {
          runtime.capabilities.reorderSelectedObject("up");
        }
        return;

      case "[":
        e.preventDefault();
        if (e.shiftKey) {
          runtime.capabilities.reorderSelectedObject("bottom");
        } else {
          runtime.capabilities.reorderSelectedObject("down");
        }
        return;
    }
  }

  function handleSingleKeyShortcuts(e: KeyboardEvent): void {
    switch (e.key.toLowerCase()) {
      case "v":
        state.activeTool.value = "select";
        break;
      case "h":
        state.activeTool.value = "hand";
        break;
      case "b":
        state.activeTool.value = "pencil";
        break;
      case "m":
        state.activeTool.value = "marker";
        break;
      case "e":
        state.activeTool.value = "eraser";
        break;
      case "r":
        state.activeTool.value = "rect";
        break;
      case "o":
        state.activeTool.value = "ellipse";
        break;
      case "l":
        state.activeTool.value = "line";
        break;
      case "a":
        state.activeTool.value = "arrow";
        break;
      case "t":
        state.activeTool.value = "text";
        break;
      case "delete":
      case "backspace":
        actions.deleteSelected();
        break;
    }
  }

  function handleZoomStep(delta: number): void {
    const currentZoom = runtime.capabilities.getZoom();
    const newZoom = Math.max(0.1, Math.min(30, currentZoom + delta));
    const stage = runtime.capabilities.getStage();
    if (stage) {
      stage.scale({ x: newZoom, y: newZoom });
      stage.batchDraw();
    }
  }

  function handleUndo(): void {
    if (state.undoStack.value.length === 0) return;

    const entry = state.undoStack.value.pop()!;
    state.redoStack.value.push(entry);

    historyApplicator.applyHistoryEntry(entry, "undo");
    state.isDirty.value = true;
  }

  function handleRedo(): void {
    if (state.redoStack.value.length === 0) return;

    const entry = state.redoStack.value.pop()!;
    state.undoStack.value.push(entry);

    historyApplicator.applyHistoryEntry(entry, "redo");
    state.isDirty.value = true;
  }

  // 生命周期绑定
  onMounted(() => {
    window.addEventListener("keydown", handleGlobalKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", handleGlobalKeyDown);
  });

  return {
    handleUndo,
    handleRedo,
  };
}