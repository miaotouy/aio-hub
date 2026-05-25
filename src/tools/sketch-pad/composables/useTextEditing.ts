import { ref } from "vue";
import Konva from "konva";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SketchPad/TextEditing");

export interface TextEditSnapshot {
  content: string;
  width: number;
  height: number;
  fontSize: number;
}

export interface TextEditResult {
  node: Konva.Text;
  before: TextEditSnapshot;
  after: TextEditSnapshot;
}

export function useTextEditing() {
  const isEditing = ref(false);
  const textValue = ref("");
  const textareaStyle = ref<Record<string, string>>({});
  /** 当前编辑的文本是否为自适应宽度模式 */
  const isAutoWidth = ref(false);

  let editingNode: Konva.Text | null = null;
  let beforeSnapshot: TextEditSnapshot | null = null;
  let onFinishCallback: ((result: TextEditResult) => void) | null = null;

  /**
   * 设置编辑完成回调
   */
  function setOnFinish(cb: (result: TextEditResult) => void) {
    onFinishCallback = cb;
  }

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

    // 记录 before 快照
    beforeSnapshot = {
      content: node.text(),
      width: node.width(),
      height: node.height(),
      fontSize: node.fontSize(),
    };

    isEditing.value = true;
    editingNode = node;
    textValue.value = node.text();

    // 隐藏正在编辑的 Konva 节点
    node.hide();
    nodeLayer?.batchDraw();

    // 计算 textarea 相对于容器的定位
    const textPosition = node.getAbsolutePosition();

    const areaPosition = {
      x: textPosition.x,
      y: textPosition.y,
    };

    // 获取缩放比例
    const scale = stage.scaleX();

    // 判断是否为 autoSize 模式（Konva 节点未显式设置 width）
    const nodeIsAutoWidth = node.attrs.width === undefined || node.attrs.width === null;
    isAutoWidth.value = nodeIsAutoWidth;

    // 计算编辑器尺寸
    const nodeWidth = node.width();
    const nodeHeight = node.height();
    const editorHeight = nodeHeight > 0 ? nodeHeight * scale : 30 * scale;

    logger.debug("startEditing 计算样式", {
      textPosition,
      areaPosition,
      scale,
      nodeWidth,
      nodeHeight,
      nodeIsAutoWidth,
      editorHeight,
    });

    // autoSize 模式：宽度自适应（不设固定 width，用 minWidth + pre 不自动换行）
    // 固定模式：设固定 width，pre-wrap 自动换行
    if (nodeIsAutoWidth) {
      const minWidth = Math.max(nodeWidth * scale, 20 * scale);
      textareaStyle.value = {
        position: "absolute",
        top: `${areaPosition.y}px`,
        left: `${areaPosition.x}px`,
        minWidth: `${minWidth}px`,
        minHeight: `${editorHeight}px`,
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
        whiteSpace: "pre",
        zIndex: "1000",
      };
    } else {
      const editorWidth = nodeWidth > 0 ? nodeWidth * scale : 200 * scale;
      textareaStyle.value = {
        position: "absolute",
        top: `${areaPosition.y}px`,
        left: `${areaPosition.x}px`,
        width: `${editorWidth}px`,
        minHeight: `${editorHeight}px`,
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
  }

  function stopEditing(): TextEditResult | null {
    if (!isEditing.value || !editingNode) {
      logger.debug("stopEditing 跳过", { isEditing: isEditing.value, hasEditingNode: !!editingNode });
      return null;
    }

    logger.debug("stopEditing", {
      nodeId: editingNode.id(),
      newText: textValue.value.substring(0, 20),
    });

    editingNode.text(textValue.value);
    editingNode.show();
    editingNode.getLayer()?.batchDraw();

    // 构建 after 快照
    const afterSnapshot: TextEditSnapshot = {
      content: editingNode.text(),
      width: editingNode.width(),
      height: editingNode.height(),
      fontSize: editingNode.fontSize(),
    };

    const result: TextEditResult = {
      node: editingNode,
      before: beforeSnapshot!,
      after: afterSnapshot,
    };

    // 调用回调
    if (onFinishCallback) {
      onFinishCallback(result);
    }

    isEditing.value = false;
    editingNode = null;
    beforeSnapshot = null;

    return result;
  }

  /** 获取当前正在编辑的节点 */
  function getEditingNode(): Konva.Text | null {
    return editingNode;
  }

  return {
    isEditing,
    isAutoWidth,
    textValue,
    textareaStyle,
    startEditing,
    stopEditing,
    setOnFinish,
    getEditingNode,
  };
}
