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

import { useRouter } from "vue-router";
import { llmChatRegistry } from "@/tools/llm-chat/llm-chat.registry";
import { transcriptionRegistry } from "@/tools/transcription/transcription.registry";
import { useAssetManager } from "@/composables/useAssetManager";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { invoke } from "@tauri-apps/api/core";

const logger = createModuleLogger("ffmpeg-tools/integration");

export function useFFmpegIntegration() {
  const router = useRouter();
  const assetManager = useAssetManager();

  /**
   * 检查文件是否存在
   */
  const checkFileExists = async (path: string, targetName: string) => {
    const exists = await invoke<boolean>("path_exists", { path });
    if (!exists) {
      customMessage.error(`发送至 ${targetName} 失败：源文件已不存在`);
      return false;
    }
    return true;
  };

  /**
   * 发送至 LLM Chat
   */
  const sendToChat = async (path: string) => {
    try {
      if (!(await checkFileExists(path, "LLM Chat"))) return;
      await llmChatRegistry.addAttachmentsFromPaths([path]);
      router.push("/llm-chat");
      customMessage.success("已发送至 LLM Chat");
    } catch (error) {
      logger.error("发送至 Chat 失败", error);
      customMessage.error("发送至 Chat 失败");
    }
  };

  /**
   * 发送至转写工具
   */
  const sendToTranscription = async (path: string) => {
    try {
      if (!(await checkFileExists(path, "转写工具"))) return;
      // 1. 导入为资产
      const asset = await assetManager.importAssetFromPath(path);
      if (!asset) throw new Error("资产导入失败");

      // 2. 添加转写任务，并请求激活工作台
      transcriptionRegistry.addTask(asset, undefined, {
        activateWorkbench: true,
      });

      router.push("/transcription");
      customMessage.success("已发送至转写工具");
    } catch (error) {
      logger.error("发送至转写工具失败", error);
      customMessage.error("发送至转写工具失败");
    }
  };

  return {
    sendToChat,
    sendToTranscription,
  };
}
