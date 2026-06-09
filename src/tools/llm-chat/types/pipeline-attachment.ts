import type { Asset, AssetMetadata, AssetType } from "@/types/asset-management";

/**
 * 发送管道内部的轻量附件表示。
 *
 * 持久化层和 UI 仍然使用全局 Asset；进入 PipelineContext 后只保留
 * 下游处理器实际需要的字段，并通过 source 描述二进制数据来源。
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
  | { kind: "inline"; base64: string; mimeType: string }
  | { kind: "asset-library"; path: string }
  | { kind: "agent-private"; agentId: string; relativePath: string };

export type AttachmentLike = Asset | PipelineAttachment;

export function isPipelineAttachment(
  value: AttachmentLike
): value is PipelineAttachment {
  return "source" in value;
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
