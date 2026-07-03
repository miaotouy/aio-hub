// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
        "middle-left",
        "middle-right",
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

  function isTransformerNode(target: Konva.Node): boolean {
    let node: Konva.Node | null = target;
    while (node) {
      if (node.getClassName() === "Transformer") return true;
      node = node.getParent();
    }
    return false;
  }

  function handleStageClick(
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ) {
    if (!transformer.value) return;

    // 点击 Transformer 自身或其子节点（锚点、边框）时，不做任何处理
    if (isTransformerNode(e.target as Konva.Node)) {
      return;
    }

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
