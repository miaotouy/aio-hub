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

import type { LocalMediaReference } from "@/types/local-media";
import type { Asset, AssetMetadata, AssetType } from "@/types/asset-management";

/**
 * 发送管道内部的轻量附件表示。
 *
 * 用户附件以 Asset 保存，本地工具媒体以 LocalMediaReference 保存。
 * 进入 PipelineContext 后仅保留下游所需字段，通过 source 描述二进制来源。
 */
export interface PipelineAttachment {
  id: string;
  type: AssetType;
  name: string;
  mimeType: string;
  size?: number;
  metadata?: AssetMetadata;
  source: AttachmentSource;
}

export type AttachmentSource =
  | { kind: "message-text"; text: string }
  | { kind: "inline"; base64: string; mimeType: string }
  | { kind: "asset-library"; path: string }
  | { kind: "local-file"; path: string; approvalGranted?: boolean }
  | { kind: "agent-private"; agentId: string; relativePath: string };

export type AttachmentLike = Asset | PipelineAttachment;

export function isPipelineAttachment(
  value: AttachmentLike
): value is PipelineAttachment {
  return "source" in value;
}

export function fromVirtualTextAttachment(
  attachment: import("./virtual-attachment").VirtualTextAttachment
): PipelineAttachment {
  return {
    id: attachment.id,
    type: "document",
    name: attachment.title,
    mimeType: "text/plain",
    source: { kind: "message-text", text: attachment.text },
  };
}

export function fromAsset(asset: Asset): PipelineAttachment {
  const source: AttachmentSource = asset.inlineData
    ? {
        kind: "inline",
        base64: asset.inlineData.base64,
        mimeType: asset.inlineData.mimeType,
      }
    : { kind: "asset-library", path: asset.path };

  return {
    id: asset.id,
    type: asset.type,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    metadata: asset.metadata,
    source,
  };
}

export function toPipelineAttachment(
  attachment: AttachmentLike
): PipelineAttachment {
  return isPipelineAttachment(attachment) ? attachment : fromAsset(attachment);
}

export function fromLocalMedia(media: LocalMediaReference): PipelineAttachment {
  return {
    id: media.id,
    type: media.type,
    name: media.name,
    mimeType: media.mimeType,
    size: media.size,
    source: {
      kind: "local-file",
      path: media.path,
      ...(media.approvalGranted ? { approvalGranted: true } : {}),
    },
  };
}
