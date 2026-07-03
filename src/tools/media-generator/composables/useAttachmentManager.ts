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

import { ref, computed } from "vue";
import type { Asset } from "@/types/asset-management";
import { useAssetManager } from "@/composables/useAssetManager";

/**
 * 附件管理器 (Media Generator 版)
 * 负责输入框附件的临时存储和管理
 */
export function useAttachmentManager() {
  const attachments = ref<Asset[]>([]);
  const isProcessingAttachments = ref(false);
  const maxAttachmentCount = 5;

  const attachmentCount = computed(() => attachments.value.length);
  const hasAttachments = computed(() => attachments.value.length > 0);
  const isAttachmentsFull = computed(
    () => attachments.value.length >= maxAttachmentCount
  );

  /**
   * 添加资产到附件列表
   */
  const addAsset = (asset: Asset) => {
    if (isAttachmentsFull.value) return false;
    if (attachments.value.some((a) => a.id === asset.id)) return false;
    attachments.value.push(asset);
    return true;
  };

  /**
   * 移除附件
   */
  const removeAttachment = (assetId: string) => {
    attachments.value = attachments.value.filter((a) => a.id !== assetId);
  };

  /**
   * 从路径添加附件
   */
  const addAttachments = async (paths: string[]) => {
    const { importAssetFromPath } = useAssetManager();
    isProcessingAttachments.value = true;
    try {
      for (const path of paths) {
        if (isAttachmentsFull.value) break;
        const asset = await importAssetFromPath(path, {
          sourceModule: "media-generator",
        });
        if (asset) {
          addAsset(asset);
        }
      }
    } finally {
      isProcessingAttachments.value = false;
    }
  };

  /**
   * 清空附件
   */
  const clearAttachments = () => {
    attachments.value = [];
  };

  return {
    attachments,
    isProcessingAttachments,
    maxAttachmentCount,
    attachmentCount,
    hasAttachments,
    isAttachmentsFull,
    addAsset,
    addAttachments,
    removeAttachment,
    clearAttachments,
  };
}
