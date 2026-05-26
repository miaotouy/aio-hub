import { nextTick } from "vue";
import { nanoid } from "nanoid";
import type { EditorSession } from "./useEditorSession";
import { useSketchPadStore } from "../stores/sketchPadStore";
import { useSketchStorage } from "./useSketchStorage";
import { unpackageSketch } from "../core/sketch-packager";
import type { SketchProject } from "../types";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("SketchPad/ProjectLifecycle");

/**
 * 项目生命周期管理
 * 负责项目的打开、创建、导入、返回画廊等编排逻辑
 */
export function useProjectLifecycle(session: EditorSession) {
  const { state, runtime, actions } = session;
  const store = useSketchPadStore();
  const storage = useSketchStorage();

  /**
   * 打开已有项目
   */
  async function openProject(id: string): Promise<boolean> {
    const manifest = await storage.loadProject(id);
    if (!manifest) return false;

    state.isInitializing.value = true;

    state.project.value = manifest.project;
    state.layers.value = manifest.layers;
    state.assetRefs.value = manifest.assetRefs || [];

    if (manifest.layers.length > 0) {
      state.activeLayerId.value = manifest.layers[0].id;
    }

    actions.clearHistory();
    actions.resetSelection();
    state.currentView.value = "editor";

    // 等待 DOM 更新和 watch 回调执行完毕后解除初始化守卫
    await nextTick();
    state.isInitializing.value = false;
    state.isDirty.value = false;

    // 加载位图图层的像素数据并绘制到 canvas 上
    const rasterData = await storage.loadRasterLayers(id, manifest.layers);
    if (rasterData.size > 0) {
      // 等待 canvas 创建完成（syncLayers 由 watch 触发）
      setTimeout(() => {
        const canvases = runtime.capabilities.getCanvases();
        rasterData.forEach((data, layerId) => {
          const canvas = canvases.get(layerId);
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              const blob = new Blob([data], { type: "image/png" });
              const url = URL.createObjectURL(blob);
              const img = new Image();
              img.onload = () => {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                runtime.capabilities.getStage()?.batchDraw();
              };
              img.src = url;
            }
          }
        });
      }, 100);
    }

    logger.info("项目已打开", { id, name: manifest.project.name });
    return true;
  }

  /**
   * 创建新项目
   */
  async function createProject(data: {
    name: string;
    width: number;
    height: number;
    createBackgroundLayer: boolean;
    backgroundLayerColor: string | null;
  }): Promise<void> {
    state.isInitializing.value = true;

    const newProj: SketchProject = {
      id: nanoid(),
      name: data.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      width: data.width,
      height: data.height,
    };

    state.project.value = newProj;
    actions.clearLayers();
    actions.clearHistory();
    actions.resetSelection();
    state.assetRefs.value = [];

    // 根据弹窗设定 + 全局设置创建默认图层
    const s = store.settings;
    let firstLayerId = "";

    if (data.createBackgroundLayer) {
      const raster = actions.addLayer("raster", s.backgroundLayerName || "背景涂鸦");
      firstLayerId = raster.id;
    }
    if (s.createObjectLayer) {
      const obj = actions.addLayer("object", s.objectLayerName || "矢量标注");
      if (!firstLayerId) firstLayerId = obj.id;
    }

    // 如果两个都没创建，至少创建一个位图图层
    if (!firstLayerId) {
      const fallback = actions.addLayer("raster", "图层 1");
      firstLayerId = fallback.id;
    }

    state.activeLayerId.value = firstLayerId;
    state.currentView.value = "editor";

    // 等待 DOM 更新和 watch 回调执行完毕后解除初始化守卫
    await nextTick();
    state.isInitializing.value = false;
    state.isDirty.value = false;

    // 如果创建了背景图层且设置了背景色，在 canvas 就绪后填充
    if (data.createBackgroundLayer && data.backgroundLayerColor) {
      const bgLayerId = firstLayerId;
      const bgColor = data.backgroundLayerColor;
      setTimeout(() => {
        fillBackgroundLayer(bgLayerId, bgColor);
      }, 100);
    }

    logger.info("新项目已创建", { id: newProj.id, name: newProj.name });
  }

  /**
   * 导入 .aiosk 项目文件
   */
  async function importProject(bytes: Uint8Array): Promise<boolean> {
    const unpacked = await unpackageSketch(bytes);
    if (!unpacked) return false;

    state.isInitializing.value = true;
    const { manifest, rasterLayers } = unpacked;

    // 生成新 ID 避免冲突
    manifest.project.id = nanoid();
    manifest.project.name = `${manifest.project.name} (导入)`;
    manifest.project.createdAt = new Date().toISOString();
    manifest.project.updatedAt = new Date().toISOString();

    state.project.value = manifest.project;
    state.layers.value = manifest.layers;
    state.assetRefs.value = manifest.assetRefs || [];

    if (manifest.layers.length > 0) {
      state.activeLayerId.value = manifest.layers[0].id;
    }

    actions.clearHistory();
    actions.resetSelection();
    state.currentView.value = "editor";

    // 解除初始化守卫
    await nextTick();
    state.isInitializing.value = false;
    state.isDirty.value = false;

    // 写入解包后的位图数据到 Canvas
    setTimeout(() => {
      const canvases = runtime.capabilities.getCanvases();
      rasterLayers.forEach((data, layerId) => {
        const canvas = canvases.get(layerId);
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const blob = new Blob([data], { type: "image/png" });
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              runtime.capabilities.getStage()?.batchDraw();
            };
            img.src = URL.createObjectURL(blob);
          }
        }
      });
    }, 100);

    customMessage.success("导入成功");
    logger.info("项目已导入", { id: manifest.project.id, name: manifest.project.name });
    return true;
  }

  /**
   * 返回画廊（带未保存提示）
   * @param saveCallback 保存回调（由 useEditorExport 提供）
   */
  async function goBack(saveCallback: () => Promise<void>): Promise<void> {
    if (state.isDirty.value) {
      try {
        await ElMessageBox.confirm("当前草图有未保存的更改，是否保存后退出？", "提示", {
          confirmButtonText: "保存并退出",
          cancelButtonText: "直接退出",
          distinguishCancelAndClose: true,
          type: "warning",
          lockScroll: false,
        });
        await saveCallback();
      } catch (action) {
        if (action !== "cancel") {
          // 用户点击了关闭或遮罩层，留在编辑页面
          return;
        }
      }
    }

    state.currentView.value = "gallery";
    state.project.value = null;
    actions.clearLayers();
    actions.clearHistory();
    state.assetRefs.value = [];
    state.isDirty.value = false;
  }

  /**
   * 删除项目（画廊中调用）
   */
  async function deleteProject(id: string): Promise<boolean> {
    return await store.deleteProject(id);
  }

  /**
   * 重命名项目（画廊中调用）
   * 注意：如果当前正在编辑该项目，需要同步更新 state.project
   */
  async function renameProject(id: string, newName: string): Promise<boolean> {
    const success = await store.renameProject(id, newName);
    if (success && state.project.value?.id === id) {
      state.project.value.name = newName;
    }
    return success;
  }

  // ─── 辅助函数 ───

  /** 为背景位图图层填充纯色 */
  function fillBackgroundLayer(layerId: string, color: string): void {
    const canvases = runtime.capabilities.getCanvases();
    const canvas = canvases.get(layerId);
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        runtime.capabilities.getStage()?.batchDraw();
      }
    }
  }

  return {
    openProject,
    createProject,
    importProject,
    goBack,
    deleteProject,
    renameProject,
  };
}