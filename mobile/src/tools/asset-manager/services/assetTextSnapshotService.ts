import { createModuleLogger } from "@/utils/logger";
import { extractAssetText } from "./assetService";

const logger = createModuleLogger("asset-manager/text-snapshot");

/** 与 Rust `asset_extract_text` 的原生读取上限一致，超出后无法提取。 */
export const MAX_TEXT_SNAPSHOT_BYTES = 2 * 1024 * 1024;
/** 写入业务快照的文本字符上限，超出截断以避免业务数据无限膨胀。 */
export const MAX_TEXT_SNAPSHOT_CHARS = 200_000;

const TEXT_SNAPSHOT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "text/yaml",
  "text/toml",
  "text/csv",
]);

const TEXT_SNAPSHOT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "log",
  "xml",
  "yaml",
  "yml",
  "toml",
]);

export interface TextSnapshotAssetLike {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AttachmentTextSnapshot {
  /** 可写入 `ManagedAssetRef.snapshot.extractedText` 的文本；无可用文本时为空。 */
  text?: string;
  /** 文本因超长被截断，调用方应给出 warning。 */
  truncated: boolean;
  /** 面向用户的降级说明；无降级时为空。 */
  warning?: string;
}

function textSnapshotExtension(displayName: string): string {
  const dotIndex = displayName.lastIndexOf(".");
  return dotIndex === -1 ? "" : displayName.slice(dotIndex + 1).toLowerCase();
}

/**
 * 仅识别移动端可安全直读的纯文本类附件；docx/pptx/xlsx 等压缩文档不在范围内。
 */
export function isTextSnapshotCandidate(
  asset: Pick<TextSnapshotAssetLike, "mimeType" | "displayName">
): boolean {
  const mimeType = asset.mimeType.toLowerCase();
  if (mimeType.startsWith("text/") || TEXT_SNAPSHOT_MIME_TYPES.has(mimeType)) {
    return true;
  }
  return TEXT_SNAPSHOT_EXTENSIONS.has(textSnapshotExtension(asset.displayName));
}

/**
 * 在附件选定/发送前按需生成文本快照，供原件被回收后由 `attachment-preparer` 回退。
 * 只调用资产模块已有的受控读取命令，不接触路径或 WebView 文件系统。
 */
export async function resolveAttachmentTextSnapshot(
  asset: TextSnapshotAssetLike
): Promise<AttachmentTextSnapshot> {
  if (!isTextSnapshotCandidate(asset)) {
    return { truncated: false };
  }

  if (asset.sizeBytes > MAX_TEXT_SNAPSHOT_BYTES) {
    const warning = `附件「${asset.displayName}」超过文本快照上限，仅保留原件引用`;
    logger.warn(warning, {
      assetId: asset.id,
      sizeBytes: asset.sizeBytes,
    });
    return { truncated: false, warning };
  }

  try {
    const extraction = await extractAssetText(asset.id);
    const text = extraction.text;
    if (!text) return { truncated: false };

    if (text.length > MAX_TEXT_SNAPSHOT_CHARS) {
      const warning = `附件「${asset.displayName}」文本过长，快照已截断`;
      logger.warn(warning, {
        assetId: asset.id,
        originalLength: text.length,
        snapshotLength: MAX_TEXT_SNAPSHOT_CHARS,
      });
      return {
        text: text.slice(0, MAX_TEXT_SNAPSHOT_CHARS),
        truncated: true,
        warning,
      };
    }

    return { text, truncated: false };
  } catch (cause) {
    const warning = `无法为附件「${asset.displayName}」生成文本快照`;
    logger.warn(warning, {
      assetId: asset.id,
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return { truncated: false, warning };
  }
}
