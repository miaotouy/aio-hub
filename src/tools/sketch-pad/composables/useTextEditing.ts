import { ref } from "vue";
import Konva from "konva";

export function useTextEditing() {
  const isEditing = ref(false);
  const textValue = ref("");
  const textareaStyle = ref<Record<string, string>>({});

  let editingNode: Konva.Text | null = null;

  function startEditing(node: Konva.Text, stage: Konva.Stage) {
    isEditing.value = true;
    editingNode = node;
    textValue.value = node.text();

    // 隐藏正在编辑的 Konva 节点
    node.hide();
    node.getLayer()?.batchDraw();

    // 计算 textarea 的绝对定位和样式
    const textPosition = node.getAbsolutePosition();
    const stageBox = stage.container().getBoundingClientRect();

    const areaPosition = {
      x: stageBox.left + textPosition.x,
      y: stageBox.top + textPosition.y,
    };

    // 获取缩放比例
    const scale = stage.scaleX();

    textareaStyle.value = {
      position: "absolute",
      top: `${areaPosition.y}px`,
      left: `${areaPosition.x}px`,
      width: `${node.width() * scale}px`,
      height: `${node.height() * scale}px`,
      fontSize: `${node.fontSize() * scale}px`,
      fontFamily: node.fontFamily(),
      fontStyle: node.fontStyle(),
      lineHeight: node.lineHeight().toString(),
      color: node.fill() as string,
      border: "1px solid #4a90d9",
      padding: "0px",
      margin: "0px",
      background: "none",
      outline: "none",
      resize: "none",
      overflow: "hidden",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      zIndex: "1000",
    };
  }

  function stopEditing() {
    if (!isEditing.value || !editingNode) return;

    editingNode.text(textValue.value);
    editingNode.show();
    editingNode.getLayer()?.batchDraw();

    isEditing.value = false;
    editingNode = null;
  }

  return {
    isEditing,
    textValue,
    textareaStyle,
    startEditing,
    stopEditing,
  };
}
