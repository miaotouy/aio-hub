import { ref } from "vue";
import Konva from "konva";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SketchPad/TextEditing");

export function useTextEditing() {
  const isEditing = ref(false);
  const textValue = ref("");
  const textareaStyle = ref<Record<string, string>>({});

  let editingNode: Konva.Text | null = null;

  function startEditing(node: Konva.Text, stage: Konva.Stage) {
    const nodeLayer = node.getLayer();
    const stageContainer = stage.container();

    logger.debug("startEditing 调用", {
      nodeId: node.id(),
      nodeText: node.text().substring(0, 20),
      nodeLayerExists: !!nodeLayer,
      nodeLayerId: nodeLayer?.id(),
      stageContainerExists: !!stageContainer,
      stageContainerParent: !!stageContainer?.parentNode,
      isAlreadyEditing: isEditing.value,
    });

    isEditing.value = true;
    editingNode = node;
    textValue.value = node.text();

    // 隐藏正在编辑的 Konva 节点
    node.hide();
    nodeLayer?.batchDraw();

    // 计算 textarea 的绝对定位和样式
    const textPosition = node.getAbsolutePosition();
    const stageBox = stageContainer.getBoundingClientRect();

    const areaPosition = {
      x: stageBox.left + textPosition.x,
      y: stageBox.top + textPosition.y,
    };

    // 获取缩放比例
    const scale = stage.scaleX();

    logger.debug("startEditing 计算样式", {
      textPosition,
      stageBox: { left: stageBox.left, top: stageBox.top, width: stageBox.width, height: stageBox.height },
      areaPosition,
      scale,
      nodeWidth: node.width(),
      nodeHeight: node.height(),
    });

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
    if (!isEditing.value || !editingNode) {
      logger.debug("stopEditing 跳过", { isEditing: isEditing.value, hasEditingNode: !!editingNode });
      return;
    }

    logger.debug("stopEditing", {
      nodeId: editingNode.id(),
      newText: textValue.value.substring(0, 20),
    });

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
