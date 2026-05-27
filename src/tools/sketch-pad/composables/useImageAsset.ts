import { ref } from "vue";
import Konva from "konva";
import { nanoid } from "nanoid";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { Asset } from "@/types/asset-management";
import type { ImageObject, AssetRef } from "../types";

const logger = createModuleLogger("SketchPad/ImageAsset");
const errorHandler = createModuleErrorHandler("SketchPad/ImageAsset");

/** 断链占位图的 Data URL（灰色背景 + 图片丢失图标） */
const BROKEN_IMAGE_PLACEHOLDER = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!;
  // 灰色棋盘格背景
  ctx.fillStyle = "#e0e0e0";
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = "#bdbdbd";
  for (let y = 0; y < 200; y += 20) {
    for (let x = 0; x < 200; x += 20) {
      if ((x / 20 + y / 20) % 2 === 0) {
        ctx.fillRect(x, y, 20, 20);
      }
    }
  }
  // 中心 X 标记
  ctx.strokeStyle = "#f44336";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, 70);
  ctx.lineTo(130, 130);
  ctx.moveTo(130, 70);
  ctx.lineTo(70, 130);
  ctx.stroke();
  // 文字
  ctx.fillStyle = "#757575";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("图片丢失", 100, 160);
  return canvas.toDataURL("image/png");
})();

export interface ImageAssetContext {
  /** 当前工程的 assetRefs 引用表 */
  assetRefs: AssetRef[];
}

export function useImageAsset() {
  const isImporting = ref(false);

  /**
   * 通过文件选择对话框导入图片
   * @returns 导入成功的 ImageObject 数据，或 null
   */
  async function importImageFromDialog(
    context: ImageAssetContext
  ): Promise<ImageObject | null> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          const filePath = await open({
            multiple: false,
            filters: [
              {
                name: "图片文件",
                extensions: [
                  "png",
                  "jpg",
                  "jpeg",
                  "gif",
                  "webp",
                  "bmp",
                  "svg",
                  "avif",
                ],
              },
            ],
          });

          if (!filePath) return null;

          isImporting.value = true;

          // 读取文件为 ArrayBuffer
          const fileBytes = await readFile(filePath);
          const fileName = filePath.split(/[/\\]/).pop() || "image.png";

          return await importImageFromBytes(
            fileBytes.buffer as ArrayBuffer,
            fileName,
            context
          );
        },
        { userMessage: "导入图片失败" }
      )) ?? null
    );
  }

  /**
   * 从字节数据导入图片（支持拖拽、粘贴等场景）
   */
  async function importImageFromBytes(
    buffer: ArrayBuffer,
    fileName: string,
    context: ImageAssetContext
  ): Promise<ImageObject | null> {
    return (
      (await errorHandler.wrapAsync(
        async () => {
          isImporting.value = true;

          // 1. 注册到资产管理器
          const asset = await assetManagerEngine.importAssetFromBytes(
            buffer,
            fileName,
            {
              sourceModule: "sketch-pad",
              generateThumbnail: true,
              enableDeduplication: true,
            }
          );

          logger.info("图片已注册到资产管理器", {
            assetId: asset.id,
            name: asset.name,
          });

          // 2. 获取图片自然尺寸
          const { width, height } = await getImageNaturalSize(asset);

          // 3. 创建 ImageObject 数据
          const imageObj: ImageObject = {
            id: nanoid(),
            type: "image",
            x: 100,
            y: 100,
            width,
            height,
            rotation: 0,
            opacity: 1,
            locked: false,
            assetId: asset.id,
            cachedRelativePath: asset.path,
            naturalWidth: width,
            naturalHeight: height,
          };

          // 4. 更新 assetRefs
          addAssetRef(context, asset, imageObj.id);

          isImporting.value = false;
          return imageObj;
        },
        { userMessage: "导入图片失败" }
      )) ?? null
    );
  }

  /**
   * 从粘贴事件导入图片
   */
  async function importImageFromPaste(
    clipboardData: DataTransfer,
    context: ImageAssetContext
  ): Promise<ImageObject | null> {
    const items = clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;

        const buffer = await file.arrayBuffer();
        const ext = item.type.split("/")[1] || "png";
        const fileName = `paste-${Date.now()}.${ext}`;
        return await importImageFromBytes(buffer, fileName, context);
      }
    }
    return null;
  }

  /**
   * 加载图片资产并创建 Konva.Image 节点
   */
  async function loadImageNode(
    imageObj: ImageObject
  ): Promise<Konva.Image | null> {
    try {
      const asset = await assetManagerEngine.getAssetById(imageObj.assetId);

      if (!asset) {
        logger.warn("图片资产不存在（断链）", { assetId: imageObj.assetId });
        return createBrokenImageNode(imageObj);
      }

      const url = await assetManagerEngine.getAssetUrl(asset);
      if (!url) {
        logger.warn("无法获取图片 URL", { assetId: imageObj.assetId });
        return createBrokenImageNode(imageObj);
      }

      const htmlImage = await loadHtmlImage(url);

      const konvaImage = new Konva.Image({
        id: imageObj.id,
        name: "object-node",
        x: imageObj.x,
        y: imageObj.y,
        width: imageObj.width,
        height: imageObj.height,
        rotation: imageObj.rotation,
        opacity: imageObj.opacity,
        scaleX: imageObj.scaleX ?? 1,
        scaleY: imageObj.scaleY ?? 1,
        draggable: !imageObj.locked,
        image: htmlImage,
      });

      // 存储 assetId 到节点属性中，方便后续序列化
      konvaImage.setAttr("assetId", imageObj.assetId);
      konvaImage.setAttr("naturalWidth", imageObj.naturalWidth);
      konvaImage.setAttr("naturalHeight", imageObj.naturalHeight);
      konvaImage.setAttr("cachedRelativePath", imageObj.cachedRelativePath);

      return konvaImage;
    } catch (error) {
      errorHandler.error(error, "加载图片节点失败", {
        assetId: imageObj.assetId,
      });
      return createBrokenImageNode(imageObj);
    }
  }

  /**
   * 创建断链占位图节点
   */
  function createBrokenImageNode(imageObj: ImageObject): Konva.Image {
    const img = new Image();
    img.src = BROKEN_IMAGE_PLACEHOLDER;

    const konvaImage = new Konva.Image({
      id: imageObj.id,
      name: "object-node",
      x: imageObj.x,
      y: imageObj.y,
      width: imageObj.width,
      height: imageObj.height,
      rotation: imageObj.rotation,
      opacity: imageObj.opacity * 0.6,
      scaleX: imageObj.scaleX ?? 1,
      scaleY: imageObj.scaleY ?? 1,
      draggable: !imageObj.locked,
      image: img,
    });

    // 标记为断链状态
    konvaImage.setAttr("assetId", imageObj.assetId);
    konvaImage.setAttr("isBroken", true);
    konvaImage.setAttr("naturalWidth", imageObj.naturalWidth);
    konvaImage.setAttr("naturalHeight", imageObj.naturalHeight);

    return konvaImage;
  }

  /**
   * 序列化 Konva.Image 节点为 ImageObject
   */
  function serializeImageNode(node: Konva.Image): ImageObject {
    return {
      id: node.id(),
      type: "image",
      x: node.x(),
      y: node.y(),
      width: node.width(),
      height: node.height(),
      rotation: node.rotation(),
      opacity: node.opacity(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      locked: !node.draggable(),
      assetId: node.getAttr("assetId") || "",
      cachedRelativePath: node.getAttr("cachedRelativePath"),
      naturalWidth: node.getAttr("naturalWidth") || node.width(),
      naturalHeight: node.getAttr("naturalHeight") || node.height(),
    };
  }

  // ─── AssetRefs 维护 ───

  /**
   * 添加资产引用
   */
  function addAssetRef(
    context: ImageAssetContext,
    asset: Asset,
    objectId: string
  ) {
    const existing = context.assetRefs.find((r) => r.assetId === asset.id);
    if (existing) {
      // 已存在，追加使用者
      if (!existing.usedBy.includes(objectId)) {
        existing.usedBy.push(objectId);
      }
    } else {
      // 新增引用
      context.assetRefs.push({
        assetId: asset.id,
        originalName: asset.name,
        hash: asset.metadata?.sha256 || "",
        usedBy: [objectId],
      });
    }
  }

  /**
   * 移除资产引用（当图片对象被删除时调用）
   */
  function removeAssetRef(
    context: ImageAssetContext,
    assetId: string,
    objectId: string
  ) {
    const refIndex = context.assetRefs.findIndex((r) => r.assetId === assetId);
    if (refIndex === -1) return;

    const ref = context.assetRefs[refIndex];
    ref.usedBy = ref.usedBy.filter((id) => id !== objectId);

    // 如果没有任何对象在使用这个资产了，移除引用记录
    if (ref.usedBy.length === 0) {
      context.assetRefs.splice(refIndex, 1);
    }
  }

  /**
   * 检查并清理无效的资产引用
   * 返回断链的 assetId 列表
   */
  async function validateAssetRefs(
    context: ImageAssetContext
  ): Promise<string[]> {
    const brokenIds: string[] = [];

    for (const ref of context.assetRefs) {
      const asset = await assetManagerEngine.getAssetById(ref.assetId);
      if (!asset) {
        brokenIds.push(ref.assetId);
      }
    }

    if (brokenIds.length > 0) {
      logger.warn("检测到断链资产", {
        count: brokenIds.length,
        ids: brokenIds,
      });
    }

    return brokenIds;
  }

  /**
   * 尝试通过 hash 重新关联断链资产
   */
  async function tryRelinkAsset(
    context: ImageAssetContext,
    brokenAssetId: string
  ): Promise<string | null> {
    const ref = context.assetRefs.find((r) => r.assetId === brokenAssetId);
    if (!ref || !ref.hash) return null;

    // 目前资产管理器没有按 hash 搜索的接口，预留此方法
    // 未来可以通过 listAssetsPaginated + hash 过滤来实现
    logger.info("尝试通过 hash 重新关联资产", {
      hash: ref.hash,
      assetId: brokenAssetId,
    });
    return null;
  }

  // ─── 工具函数 ───

  /**
   * 获取图片的自然尺寸
   */
  async function getImageNaturalSize(
    asset: Asset
  ): Promise<{ width: number; height: number }> {
    // 优先从 metadata 获取
    if (asset.metadata?.width && asset.metadata?.height) {
      return { width: asset.metadata.width, height: asset.metadata.height };
    }

    // 否则加载图片获取
    try {
      const url = await assetManagerEngine.getAssetUrl(asset);
      const img = await loadHtmlImage(url);
      return { width: img.naturalWidth, height: img.naturalHeight };
    } catch (_) {
      return { width: 300, height: 300 }; // 默认尺寸
    }
  }

  /**
   * 加载 HTML Image 元素
   */
  function loadHtmlImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`图片加载失败: ${url}`));
      img.src = url;
    });
  }

  return {
    isImporting,
    importImageFromDialog,
    importImageFromBytes,
    importImageFromPaste,
    loadImageNode,
    createBrokenImageNode,
    serializeImageNode,
    addAssetRef,
    removeAssetRef,
    validateAssetRefs,
    tryRelinkAsset,
  };
}
