import Konva from "konva";
import { nanoid } from "nanoid";
import type { EditorSession } from "./useEditorSession";
import type { RasterLayer, ObjectLayer } from "../types";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SketchPad/LayerOperations");

/**
 * 高级图层操作
 * 负责栅格化、向下合并等需要操作 Konva 运行时的图层操作
 */
export function useLayerOperations(session: EditorSession) {
  const { state, runtime, actions } = session;

  /**
   * 栅格化对象图层为位图图层
   */
  async function rasterizeLayer(id: string): Promise<void> {
    const stage = runtime.capabilities.getStage();
    if (!stage) return;

    const layerIndex = state.layers.value.findIndex((l) => l.id === id);
    if (layerIndex === -1) return;

    const oldLayer = state.layers.value[layerIndex];
    if (oldLayer.type !== "object") return;

    const konvaLayer = stage.findOne(`#${id}`) as Konva.Layer;
    if (!konvaLayer) return;

    // 1. 导出当前图层为 DataURL
    const dataUrl = konvaLayer.toDataURL({ pixelRatio: 1 });

    // 2. 创建新的位图图层
    const newLayer: RasterLayer = {
      id: nanoid(),
      type: "raster",
      name: `${oldLayer.name} (栅格化)`,
      visible: oldLayer.visible,
      locked: oldLayer.locked,
      opacity: oldLayer.opacity,
      blendMode: oldLayer.blendMode,
      imagePath: `layers/${nanoid()}.png`,
      imageFormat: "png",
    };

    // 3. 替换图层
    actions.replaceLayer(id, newLayer);

    // 4. 将导出的图片绘制到新创建的 Canvas 上，并记录历史
    setTimeout(() => {
      const canvases = runtime.capabilities.getCanvases();
      const canvas = canvases.get(newLayer.id);
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0);
            stage.batchDraw();

            // 获取 ImageData 用于撤销/重做
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // 5. 记录历史
            actions.pushHistory({
              type: "layer-rasterize",
              layerId: id,
              beforeLayer: oldLayer as ObjectLayer,
              afterLayer: newLayer,
              imageData: imgData,
            });
          };
          img.src = dataUrl;
        }
      }
    }, 50);

    customMessage.success("图层栅格化成功");
    logger.info("图层已栅格化", { oldId: id, newId: newLayer.id });
  }

  /**
   * 向下合并图层
   * 将指定图层合并到其下方的图层
   */
  async function mergeDown(id: string): Promise<void> {
    const stage = runtime.capabilities.getStage();
    if (!stage) return;

    const upperIndex = state.layers.value.findIndex((l) => l.id === id);
    if (upperIndex === -1 || upperIndex === state.layers.value.length - 1)
      return;

    const lowerIndex = upperIndex + 1;
    const upperLayer = state.layers.value[upperIndex];
    const lowerLayer = state.layers.value[lowerIndex];

    if (upperLayer.type === "background" || lowerLayer.type === "background") {
      customMessage.warning("填充图层不参与合并");
      return;
    }

    const upperKonvaLayer = stage.findOne(`#${upperLayer.id}`) as Konva.Layer;
    const lowerKonvaLayer = stage.findOne(`#${lowerLayer.id}`) as Konva.Layer;

    if (!upperKonvaLayer || !lowerKonvaLayer) return;

    // 1. Raster + Raster
    if (upperLayer.type === "raster" && lowerLayer.type === "raster") {
      mergeRasterToRaster(upperLayer, lowerLayer, stage);
    }
    // 2. Object + Raster
    else if (upperLayer.type === "object" && lowerLayer.type === "raster") {
      mergeObjectToRaster(upperLayer, lowerLayer, upperKonvaLayer, stage);
    }
    // 3. Raster + Object (不支持)
    else if (upperLayer.type === "raster" && lowerLayer.type === "object") {
      customMessage.warning(
        "不支持将位图图层合并到对象图层，请先将对象图层栅格化，或者调整图层顺序"
      );
    }
    // 4. Object + Object
    else if (upperLayer.type === "object" && lowerLayer.type === "object") {
      mergeObjectToObject(
        upperLayer as ObjectLayer,
        lowerLayer as ObjectLayer,
        upperKonvaLayer,
        lowerKonvaLayer,
        stage
      );
    }
  }

  // ─── 合并子逻辑 ───

  function mergeRasterToRaster(
    upperLayer: RasterLayer,
    lowerLayer: RasterLayer,
    stage: Konva.Stage
  ): void {
    const canvases = runtime.capabilities.getCanvases();
    const upperCanvas = canvases.get(upperLayer.id);
    const lowerCanvas = canvases.get(lowerLayer.id);

    if (upperCanvas && lowerCanvas) {
      const lowerCtx = lowerCanvas.getContext("2d");
      if (lowerCtx) {
        lowerCtx.save();
        lowerCtx.globalAlpha = upperLayer.opacity;
        lowerCtx.globalCompositeOperation = upperLayer.blendMode;
        lowerCtx.drawImage(upperCanvas, 0, 0);
        lowerCtx.restore();

        // 删除上层
        actions.deleteLayer(upperLayer.id);
        stage.batchDraw();
        customMessage.success("图层合并成功");
      }
    }
  }

  function mergeObjectToRaster(
    upperLayer: ObjectLayer,
    lowerLayer: RasterLayer,
    upperKonvaLayer: Konva.Layer,
    stage: Konva.Stage
  ): void {
    const canvases = runtime.capabilities.getCanvases();
    const lowerCanvas = canvases.get(lowerLayer.id);

    if (lowerCanvas) {
      const lowerCtx = lowerCanvas.getContext("2d");
      if (lowerCtx) {
        const dataUrl = upperKonvaLayer.toDataURL({ pixelRatio: 1 });
        const img = new Image();
        img.onload = () => {
          lowerCtx.save();
          lowerCtx.globalAlpha = upperLayer.opacity;
          lowerCtx.globalCompositeOperation = upperLayer.blendMode;
          lowerCtx.drawImage(img, 0, 0);
          lowerCtx.restore();

          // 删除上层
          actions.deleteLayer(upperLayer.id);
          stage.batchDraw();
          customMessage.success("图层合并成功");
        };
        img.src = dataUrl;
      }
    }
  }

  function mergeObjectToObject(
    upperLayer: ObjectLayer,
    lowerLayer: ObjectLayer,
    upperKonvaLayer: Konva.Layer,
    lowerKonvaLayer: Konva.Layer,
    stage: Konva.Stage
  ): void {
    // 将上层的所有 Konva 节点移动到下层
    const children = [...upperKonvaLayer.getChildren()];
    children.forEach((node) => {
      if (node.name() === "object-node") {
        node.moveTo(lowerKonvaLayer);
      }
    });

    // 合并两者的 objects 数据
    const mergedObjects = [...lowerLayer.objects, ...upperLayer.objects];
    actions.updateLayerObjects(lowerLayer.id, mergedObjects);

    // 删除上层
    actions.deleteLayer(upperLayer.id);
    stage.batchDraw();
    customMessage.success("图层合并成功");
  }

  return {
    rasterizeLayer,
    mergeDown,
  };
}
