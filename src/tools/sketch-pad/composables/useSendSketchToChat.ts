import { useAssetManager } from "@/composables/useAssetManager";
import { llmChatRegistry } from "@/tools/llm-chat/llm-chat.registry";
import { useRouter } from "vue-router";
import { customMessage } from "@/utils/customMessage";
import { generateDefaultSketchName } from "../constants";
import type Konva from "konva";

export function useSendSketchToChat() {
  const { importAssetFromBytes } = useAssetManager();
  const router = useRouter();

  async function sendToChat(stage: Konva.Stage, projectName: string) {
    try {
      // 1. 导出为 PNG DataURL
      // 临时隐藏 overlay 层
      const overlay = stage.findOne(".overlay");
      if (overlay) overlay.hide();
      const dataUrl = stage.toDataURL({ pixelRatio: 2 });
      if (overlay) overlay.show();

      // 2. 转换为 ArrayBuffer
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();

      // 3. 导入资产管理器
      const fileName = `${projectName || generateDefaultSketchName()}.png`;
      const asset = await importAssetFromBytes(buffer, fileName, {
        sourceModule: "sketch-pad",
        origin: {
          type: "generated",
          source: "sketch-pad",
          sourceModule: "sketch-pad",
        },
      });

      if (asset) {
        // 4. 添加到 Chat 附件
        llmChatRegistry.addAssets([asset]);
        customMessage.success("已成功发送到对话附件");

        // 5. 跳转到 Chat 页面
        router.push("/llm-chat");
      }
    } catch (error) {
      customMessage.error("发送到对话失败");
      console.error(error);
    }
  }

  return {
    sendToChat,
  };
}
