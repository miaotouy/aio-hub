import { ref, computed } from "vue";
import type {
  HybridLayer,
  BackgroundLayer,
  RasterLayer,
  ObjectLayer,
} from "../types";
import { nanoid } from "nanoid";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SketchPad/LayerStack");

export function useLayerStack() {
  const layers = ref<HybridLayer[]>([]);
  const activeLayerId = ref<string>("");

  const activeLayer = computed(() => {
    return layers.value.find((l) => l.id === activeLayerId.value) || null;
  });

  const activeLayerIndex = computed(() => {
    return layers.value.findIndex((l) => l.id === activeLayerId.value);
  });

  function createRasterLayer(name = "新建位图图层"): RasterLayer {
    const id = nanoid();
    return {
      id,
      type: "raster",
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "source-over",
      imagePath: `layers/${id}.png`,
      imageFormat: "png",
    };
  }

  function createBackgroundLayer(
    name = "填充",
    fillColor: string | null = null
  ): BackgroundLayer {
    return {
      id: nanoid(),
      type: "background",
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "source-over",
      fillColor,
    };
  }

  function createObjectLayer(name = "新建对象图层"): ObjectLayer {
    return {
      id: nanoid(),
      type: "object",
      name,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "source-over",
      objects: [],
    };
  }

  function addLayer(
    type: "background" | "raster" | "object",
    name?: string,
    options?: { fillColor?: string | null }
  ) {
    const newLayer =
      type === "background"
        ? createBackgroundLayer(name, options?.fillColor ?? null)
        : type === "raster"
          ? createRasterLayer(name)
          : createObjectLayer(name);

    const insertIndex = activeLayerIndex.value;
    const layerCountBefore = layers.value.length;
    const layerIdsBefore = layers.value.map((l) => l.id);

    logger.debug("addLayer 开始", {
      type,
      name,
      newLayerId: newLayer.id,
      insertIndex,
      layerCountBefore,
      activeLayerIdBefore: activeLayerId.value,
      layerIdsBefore,
    });

    // 插入到当前活跃图层上方，如果没有活跃图层则放到最顶层
    if (insertIndex !== -1) {
      layers.value.splice(insertIndex, 0, newLayer);
    } else {
      layers.value.unshift(newLayer);
    }

    activeLayerId.value = newLayer.id;

    logger.debug("addLayer 完成", {
      newLayerId: newLayer.id,
      layerCountAfter: layers.value.length,
      activeLayerIdAfter: activeLayerId.value,
      layerIdsAfter: layers.value.map((l) => l.id),
    });

    return newLayer;
  }

  function deleteLayer(id: string) {
    if (layers.value.length <= 1) {
      logger.debug("deleteLayer 拒绝：至少保留一个图层", { id });
      return false;
    }
    const index = layers.value.findIndex((l) => l.id === id);
    if (index !== -1) {
      logger.debug("deleteLayer", {
        id,
        index,
        layerCountBefore: layers.value.length,
        isActiveLayer: activeLayerId.value === id,
      });
      layers.value.splice(index, 1);
      // 如果删除的是活跃图层，切换活跃图层
      if (activeLayerId.value === id) {
        const nextActiveIndex = Math.min(index, layers.value.length - 1);
        activeLayerId.value = layers.value[nextActiveIndex].id;
        logger.debug("deleteLayer 切换活跃图层", {
          nextActiveIndex,
          newActiveLayerId: activeLayerId.value,
        });
      }
      return true;
    }
    return false;
  }

  function toggleVisible(id: string) {
    const layer = layers.value.find((l) => l.id === id);
    if (layer) {
      layer.visible = !layer.visible;
    }
  }

  function toggleLocked(id: string) {
    const layer = layers.value.find((l) => l.id === id);
    if (layer) {
      layer.locked = !layer.locked;
    }
  }

  function setOpacity(id: string, opacity: number) {
    const layer = layers.value.find((l) => l.id === id);
    if (layer) {
      layer.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  function reorderLayers(newOrder: string[]) {
    const map = new Map(layers.value.map((l) => [l.id, l]));
    const reordered: HybridLayer[] = [];
    for (const id of newOrder) {
      const layer = map.get(id);
      if (layer) {
        reordered.push(layer);
      }
    }
    layers.value = reordered;
  }

  function clearLayers() {
    layers.value = [];
    activeLayerId.value = "";
  }

  function updateLayerObjects(layerId: string, objects: any[]) {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer && layer.type === "object") {
      layer.objects = objects;
    }
  }

  function replaceLayer(oldId: string, newLayer: HybridLayer) {
    const index = layers.value.findIndex((l) => l.id === oldId);
    if (index !== -1) {
      layers.value.splice(index, 1, newLayer);
      if (activeLayerId.value === oldId) {
        activeLayerId.value = newLayer.id;
      }
      return true;
    }
    return false;
  }

  return {
    layers,
    activeLayerId,
    activeLayer,
    activeLayerIndex,
    addLayer,
    deleteLayer,
    toggleVisible,
    toggleLocked,
    setOpacity,
    reorderLayers,
    clearLayers,
    createRasterLayer,
    createBackgroundLayer,
    createObjectLayer,
    updateLayerObjects,
    replaceLayer,
  };
}
