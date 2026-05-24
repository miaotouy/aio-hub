import { ref } from "vue";
import Konva from "konva";

export function useTransformer() {
  const transformer = ref<Konva.Transformer | null>(null);
  const selectedNodes = ref<any[]>([]);

  function initTransformer(overlayLayer: Konva.Layer) {
    const tr = new Konva.Transformer({
      rotateEnabled: true,
      borderStroke: "#4a90d9",
      anchorSize: 8,
      keepRatio: false,
      enabledAnchors: [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
        "top-center",
        "bottom-center",
        "left-center",
        "right-center",
      ],
    });

    overlayLayer.add(tr);
    transformer.value = tr;
    return tr;
  }

  function selectNodes(nodes: any[]) {
    selectedNodes.value = nodes;
    if (transformer.value) {
      transformer.value.nodes(nodes);
      transformer.value.getLayer()?.batchDraw();
    }
  }

  function clearSelection() {
    selectedNodes.value = [];
    if (transformer.value) {
      transformer.value.nodes([]);
      transformer.value.getLayer()?.batchDraw();
    }
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!transformer.value) return;

    // 点击空白区域清空选择
    if (e.target === e.target.getStage()) {
      clearSelection();
      return;
    }

    // 如果点击的不是 object-node，清空选择
    if (!e.target.hasName("object-node")) {
      clearSelection();
      return;
    }

    const node = e.target;
    const isShift = e.evt.shiftKey;

    if (isShift) {
      // 多选
      const nodes = [...selectedNodes.value];
      const index = nodes.indexOf(node);
      if (index > -1) {
        nodes.splice(index, 1);
      } else {
        nodes.push(node);
      }
      selectNodes(nodes);
    } else {
      // 单选
      selectNodes([node]);
    }
  }

  return {
    transformer,
    selectedNodes,
    initTransformer,
    selectNodes,
    clearSelection,
    handleStageClick,
  };
}
