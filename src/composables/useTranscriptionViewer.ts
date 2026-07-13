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
import type { Asset } from "@/types/asset-management";

export interface TranscriptionViewerState {
  visible: boolean;
  asset: Asset | null;
  initialContent: string;
  showRegenerate?: boolean;
  previousConfig?: any; // 保存上次转写的配置，用于回填
  onSave?: (content: string) => void | Promise<void>;
  onRegenerate?: (payload: {
    modelId: string;
    prompt: string;
    enableRepetitionDetection: boolean;
    overrideConfig?: any;
  }) => void;
  onDelete?: () => void | Promise<void>;
}

const globalState = ref<TranscriptionViewerState>({
  visible: false,
  asset: null,
  initialContent: "",
  showRegenerate: true,
});

/**
 * 转写查看器 Composable
 * 提供全局单例的转写内容查看与编辑功能
 */
export function useTranscriptionViewer() {
  const show = (options: {
    asset: Asset;
    initialContent: string;
    showRegenerate?: boolean;
    previousConfig?: any;
    onSave?: (content: string) => void | Promise<void>;
    onRegenerate?: (payload: {
      modelId: string;
      prompt: string;
      enableRepetitionDetection: boolean;
      overrideConfig?: any;
    }) => void;
    onDelete?: () => void | Promise<void>;
  }) => {
    globalState.value = {
      visible: true,
      asset: options.asset,
      initialContent: options.initialContent,
      showRegenerate: options.showRegenerate ?? true,
      previousConfig: options.previousConfig,
      onSave: options.onSave,
      onRegenerate: options.onRegenerate,
      onDelete: options.onDelete,
    };
  };

  const close = () => {
    globalState.value.visible = false;
    // 延迟清理数据，避免关闭动画闪烁
    setTimeout(() => {
      if (!globalState.value.visible) {
        globalState.value.asset = null;
        globalState.value.initialContent = "";
        globalState.value.previousConfig = undefined;
        globalState.value.onSave = undefined;
        globalState.value.onRegenerate = undefined;
        globalState.value.onDelete = undefined;
      }
    }, 300);
  };

  return {
    state: globalState,
    show,
    close,
  };
}
