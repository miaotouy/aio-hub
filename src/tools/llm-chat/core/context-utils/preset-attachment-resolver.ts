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

import { createModuleLogger } from "@/utils/logger";
import type { PresetAttachmentRef } from "../../types/message";
import type { AgentAsset } from "@/tools/agent-manager/types/agent";
import type { AssetType } from "@/types/asset-management";
import type { PipelineAttachment } from "../../types/pipeline-attachment";

const logger = createModuleLogger("llm-chat/preset-attachment-resolver");

/**
 * 将 AgentAsset.type ("image" | "audio" | "video" | "file")
 * 映射为全局 AssetType ("image" | "audio" | "video" | "document" | "text" | "other")
 */
function mapAgentAssetType(agentType: AgentAsset["type"]): AssetType {
  switch (agentType) {
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "file":
      return "document";
    default:
      return "other";
  }
}

/**
 * 根据文件名猜测 MIME 类型
 */
function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    // 图片
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
    // 音频
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
    aac: "audio/aac",
    // 视频
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    // 文档
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimeMap[ext || ""] || "application/octet-stream";
}

/**
 * 将预设附件引用解析为 PipelineAttachment 对象
 *
 * 从 Agent 的 assets 列表中查找对应的 AgentAsset，
 * 构造一个 PipelineAttachment，使用 source.kind = "agent-private"
 * 供下游 asset-resolver 通过 getAttachmentBuffer() 读取。
 */
export function resolvePresetAttachments(
  refs: PresetAttachmentRef[] | undefined,
  agentId: string,
  agentAssets: AgentAsset[] | undefined
): PipelineAttachment[] {
  if (!refs || refs.length === 0) return [];
  if (!agentAssets || agentAssets.length === 0) {
    logger.warn("预设附件引用存在但 Agent 无资产列表", {
      refCount: refs.length,
      agentId,
    });
    return [];
  }

  const results: PipelineAttachment[] = [];

  for (const ref of refs) {
    const agentAsset = agentAssets.find((a) => a.id === ref.assetId);
    if (!agentAsset) {
      logger.warn("预设附件引用的资产未找到", {
        assetId: ref.assetId,
        agentId,
      });
      continue;
    }

    results.push({
      id: `preset-${agentId}-${agentAsset.id}`,
      type: mapAgentAssetType(agentAsset.type),
      name: agentAsset.filename,
      mimeType: agentAsset.mimeType || guessMimeType(agentAsset.filename),
      size: agentAsset.size,
      source: {
        kind: "agent-private",
        agentId,
        relativePath: agentAsset.path,
      },
    });
  }

  return results;
}
