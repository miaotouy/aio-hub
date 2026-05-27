import { assetManagerEngine } from "@/composables/useAssetManager";
import { llmChatRegistry } from "@/tools/llm-chat/llm-chat.registry";
import { useRouter } from "vue-router";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { generateDefaultSketchName } from "../constants";
import { canvasToBlob, exportStageToCanvas } from "../core/konva-export";
import type Konva from "konva";

const logger = createModuleLogger("SketchPad/SendToChat");

interface SendSketchToChatOptions {
  width?: number;
  height?: number;
}

export function useSendSketchToChat() {
  const router = useRouter();

  async function sendToChat(
    stage: Konva.Stage,
    projectName: string,
    options: SendSketchToChatOptions = {}
  ) {
    const startedAt = performance.now();
    const overlay = stage.findOne(".overlay");
    const borderLayer = stage.findOne("#border-layer");

    try {
      // 1. 导出为 PNG Blob。避免 DataURL/base64 在主线程产生大字符串和二次拷贝。
      if (overlay) overlay.hide();
      if (borderLayer) borderLayer.hide();

      const canvas = exportStageToCanvas(stage, {
        x: 0,
        y: 0,
        width: options.width,
        height: options.height,
        pixelRatio: 1,
      });
      const blob = await canvasToBlob(canvas, "image/png");

      const buffer = await blob.arrayBuffer();

      // 2. 导入资产管理器。使用无状态引擎，避免一次性导入后额外刷新资产统计拖慢聊天投递。
      const fileName = `${projectName || generateDefaultSketchName()}.png`;
      const asset = await assetManagerEngine.importAssetFromBytes(
        buffer,
        fileName,
        {
          generateThumbnail: true,
          enableDeduplication: true,
          sourceModule: "sketch-pad",
          origin: {
            type: "generated",
            source: "sketch-pad",
            sourceModule: "sketch-pad",
          },
        }
      );

      if (asset) {
        // 3. 添加到 Chat 附件
        llmChatRegistry.addAssets([asset]);
        customMessage.success("已成功发送到对话附件");

        logger.info("草图已发送到对话附件", {
          assetId: asset.id,
          byteLength: buffer.byteLength,
          elapsedMs: Math.round(performance.now() - startedAt),
        });

        // 4. 跳转到 Chat 页面
        router.push("/llm-chat");
      }
    } catch (error) {
      customMessage.error("发送到对话失败");
      logger.error("发送草图到对话失败", error);
    } finally {
      if (overlay) overlay.show();
      if (borderLayer) borderLayer.show();
      stage.batchDraw();
    }
  }

  return {
    sendToChat,
  };
}
