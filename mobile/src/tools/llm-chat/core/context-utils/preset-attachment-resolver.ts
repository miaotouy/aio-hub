import type { LlmMessageContent } from "@/tools/llm-api/types";
import type { AgentAsset } from "@/tools/agent-manager/types/agent";
import type { AgentAttachmentRef } from "../../types/context";
import { bytesToBase64 } from "@/utils/base64";

/**
 * 将预设消息 / 开局消息的 Agent 私有附件引用解析为可进入请求的内容片段。
 *
 * 边界：Agent 私有资产不接入全局 `asset_manager.db`，不登记全局 usage，
 * 也不转换成全局 `assetId`。运行时直接通过 Tauri fs 从 `agents/{id}/` 读取字节，
 * 图片以纯 JS 解码为内联 base64 进入 vision；音频/视频在模型能力未显式关闭时
 * 同样内联 base64（音频走 `input_audio`，视频走移动端 `image_url + video_metadata`
 * 平台扩展）；文本文档以内联文本块回退；无法表达时降级为文本描述并 warning，
 * 不静默丢弃。
 */

export type AgentAttachmentKind =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "other";

export interface ResolvedAgentAttachment {
  ref: AgentAttachmentRef;
  /** 相对 Agent 私有目录的路径。 */
  path: string;
  filename: string;
  kind: AgentAttachmentKind;
  mimeType: string;
}

export interface AgentAttachmentResolutionStats {
  totalCount: number;
  imageCount: number;
  audioCount: number;
  videoCount: number;
  textFallbackCount: number;
  degradedCount: number;
  missingCount: number;
}

/**
 * 私有音频/视频内联发送的模型能力开关（来自 `ModelCapabilities`）。
 * `false` 表示模型明确不支持该输入，附件保留显式降级描述；
 * `undefined` / `true` 均视为尝试内联，与图片不判 vision 的行为一致。
 */
export interface AgentAttachmentInlineSupport {
  audio?: boolean;
  video?: boolean;
}

export interface AgentAttachmentResolutionResult {
  parts: LlmMessageContent[];
  stats: AgentAttachmentResolutionStats;
  warnings: string[];
}

/** 文本回退的单份最大字符数，避免超大文档挤爆请求体。 */
export const AGENT_ATTACHMENT_TEXT_MAX_CHARS = 200_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  yaml: "application/x-yaml",
  yml: "application/x-yaml",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  log: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "log",
]);

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml"];
const TEXT_MIME_EXACT = new Set([
  "application/x-yaml",
  "application/yaml",
  "application/javascript",
]);

export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\.\./g, "__").replace(/^\/+/, "");
}

export function basename(path: string): string {
  const segments = normalizeRelativePath(path).split("/");
  return segments[segments.length - 1] || path;
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index + 1).toLowerCase() : "";
}

/** 根据文件名猜测 MIME 类型，未知回退 `application/octet-stream`。 */
export function guessMimeTypeFromFilename(filename: string): string {
  return MIME_BY_EXTENSION[extensionOf(filename)] ?? "application/octet-stream";
}

function normalizeKindHint(value: unknown): AgentAttachmentKind | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  if (lower === "image") return "image";
  if (lower === "audio") return "audio";
  if (lower === "video") return "video";
  if (lower === "document" || lower === "file") return "document";
  if (lower === "other") return "other";
  return null;
}

/** 推断附件类别：优先显式类型提示，其次 MIME。 */
export function inferAgentAttachmentKind(
  typeHint: unknown,
  mimeType: string
): AgentAttachmentKind {
  const hinted = normalizeKindHint(typeHint);
  if (hinted) return hinted;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("sheet")
  ) {
    return "document";
  }
  return "other";
}

export function isTextLikeAttachment(
  kind: AgentAttachmentKind,
  mimeType: string,
  filename: string
): boolean {
  if (kind !== "document") return false;
  if (TEXT_MIME_EXACT.has(mimeType)) return true;
  if (TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return true;
  }
  return TEXT_EXTENSIONS.has(extensionOf(filename));
}

function readRefField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field ? field : undefined;
}

/**
 * 把预设消息的 `presetAttachments` 或开局消息的 `attachments` 归一化为
 * 统一的 `AgentAttachmentRef[]`。对无法识别的条目直接跳过。
 */
export function normalizeAgentAttachmentRefs(
  value: unknown
): AgentAttachmentRef[] {
  if (!Array.isArray(value)) return [];

  const refs: AgentAttachmentRef[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const path = normalizeRelativePath(item);
      if (!path) continue;
      refs.push({ path, filename: basename(path) });
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const record = item as Record<string, unknown>;
    const ref: AgentAttachmentRef = { ...record };
    const assetId = readRefField(item, "assetId");
    const path = readRefField(item, "path");
    const filename = readRefField(item, "filename");
    const name = readRefField(item, "name");
    const description = readRefField(item, "description");
    const mimeType = readRefField(item, "mimeType");
    const type = readRefField(item, "type");

    if (assetId) ref.assetId = assetId;
    else delete ref.assetId;
    if (path) ref.path = normalizeRelativePath(path);
    else delete ref.path;
    const resolvedFilename = filename ?? name;
    if (resolvedFilename) ref.filename = basename(resolvedFilename);
    else delete ref.filename;
    if (description) ref.description = description;
    else delete ref.description;
    if (mimeType) ref.mimeType = mimeType;
    else delete ref.mimeType;
    if (type) ref.type = type;
    else delete ref.type;

    if (!ref.assetId && !ref.path && !ref.filename) continue;
    refs.push(ref);
  }
  return refs;
}

function findAgentAsset(
  ref: AgentAttachmentRef,
  assets: AgentAsset[] | undefined
): AgentAsset | undefined {
  if (!assets?.length) return undefined;

  if (ref.assetId) {
    const byId = assets.find((asset) => asset.id === ref.assetId);
    if (byId) return byId;
  }

  if (ref.path) {
    const target = normalizeRelativePath(ref.path);
    const exact = assets.find(
      (asset) => normalizeRelativePath(asset.path) === target
    );
    if (exact) return exact;
    // 批量多 Agent 子文件夹前缀：包内路径可能带 `{name}/assets/xxx`，支持双向后缀匹配。
    const suffixed = assets.find((asset) => {
      const assetPath = normalizeRelativePath(asset.path);
      return assetPath.endsWith(`/${target}`) || target.endsWith(`/${assetPath}`);
    });
    if (suffixed) return suffixed;
  }

  const filename = ref.filename;
  if (filename) {
    const byName = assets.find(
      (asset) =>
        asset.filename === filename || basename(asset.path) === filename
    );
    if (byName) return byName;
  }

  return undefined;
}

/**
 * 将单个引用解析为可读取的私有附件描述；无法定位路径时返回 `null`。
 */
export function resolveAgentAttachmentRef(
  ref: AgentAttachmentRef,
  assets: AgentAsset[] | undefined
): ResolvedAgentAttachment | null {
  const asset = findAgentAsset(ref, assets);
  const path = normalizeRelativePath(asset?.path ?? ref.path ?? "");
  if (!path) return null;

  const filename = asset?.filename ?? ref.filename ?? basename(path);
  const mimeType =
    asset?.mimeType ?? ref.mimeType ?? guessMimeTypeFromFilename(filename);
  const kind = inferAgentAttachmentKind(asset?.type ?? ref.type, mimeType);

  return { ref, path, filename, kind, mimeType };
}

// 统一走 @/utils/base64；保留导出以兼容既有引用。
export { bytesToBase64 };

function decodeTextBytes(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!text) return null;
    // 出现大量替换字符时大概率是二进制，回退为降级描述。
    const replacementRatio =
      (text.match(/\uFFFD/g)?.length ?? 0) / text.length;
    return replacementRatio > 0.02 ? null : text;
  } catch {
    return null;
  }
}

function formatTextFallback(attachment: ResolvedAgentAttachment, text: string) {
  return [
    `<attachment_text name="${attachment.filename}" mime_type="${attachment.mimeType}">`,
    text,
    "</attachment_text>",
  ].join("\n");
}

function formatDegradedDescription(attachment: ResolvedAgentAttachment) {
  const label =
    attachment.kind === "audio"
      ? "音频"
      : attachment.kind === "video"
        ? "视频"
        : attachment.kind === "image"
          ? "图片"
          : "文件";
  return [
    `<attachment name="${attachment.filename}" type="${attachment.kind}" mime_type="${attachment.mimeType}">`,
    `（${label}附件，移动端未内联发送原文件）`,
    "</attachment>",
  ].join("\n");
}

export type AgentAssetReader = (
  agentId: string,
  relativePath: string
) => Promise<Uint8Array | null>;

function pushPart(
  parts: LlmMessageContent[],
  part: LlmMessageContent
): void {
  parts.push(part);
}

/**
 * 解析并物化一组 Agent 私有附件引用。
 *
 * @param readBytes 读取私有资产字节的注入点；生产环境使用 Tauri fs，测试可注入 mock。
 * @param inlineSupport 音频/视频内联的模型能力开关；缺省视为支持。
 */
export async function resolveAgentAttachmentParts(
  refs: AgentAttachmentRef[],
  agentId: string,
  assets: AgentAsset[] | undefined,
  readBytes: AgentAssetReader,
  inlineSupport?: AgentAttachmentInlineSupport
): Promise<AgentAttachmentResolutionResult> {
  const parts: LlmMessageContent[] = [];
  const warnings: string[] = [];
  const stats: AgentAttachmentResolutionStats = {
    totalCount: refs.length,
    imageCount: 0,
    audioCount: 0,
    videoCount: 0,
    textFallbackCount: 0,
    degradedCount: 0,
    missingCount: 0,
  };

  for (const ref of refs) {
    const resolved = resolveAgentAttachmentRef(ref, assets);
    if (!resolved) {
      stats.missingCount += 1;
      warnings.push(
        `Agent 私有附件引用未能定位：${ref.assetId ?? ref.path ?? ref.filename ?? "未知条目"}`
      );
      continue;
    }

    const bytes = await readBytes(agentId, resolved.path);
    if (!bytes || !bytes.length) {
      stats.missingCount += 1;
      warnings.push(`Agent 私有附件不存在或读取失败：${resolved.path}`);
      continue;
    }

    if (resolved.kind === "image") {
      const base64 = bytesToBase64(bytes);
      pushPart(parts, {
        type: "image",
        imageBase64: base64,
        mimeType: resolved.mimeType,
        source: {
          type: "base64",
          media_type: resolved.mimeType,
          data: base64,
        },
      });
      stats.imageCount += 1;
      continue;
    }

    if (resolved.kind === "audio" || resolved.kind === "video") {
      const inlineAllowed =
        resolved.kind === "audio"
          ? inlineSupport?.audio !== false
          : inlineSupport?.video !== false;
      if (inlineAllowed) {
        const base64 = bytesToBase64(bytes);
        pushPart(parts, {
          type: resolved.kind,
          mimeType: resolved.mimeType,
          source: {
            type: "base64",
            media_type: resolved.mimeType,
            data: base64,
          },
        });
        if (resolved.kind === "audio") stats.audioCount += 1;
        else stats.videoCount += 1;
        continue;
      }
      pushPart(parts, {
        type: "text",
        text: formatDegradedDescription(resolved),
      });
      stats.degradedCount += 1;
      warnings.push(
        resolved.kind === "audio"
          ? `模型能力未开启音频输入，附件已降级为文本描述：${resolved.filename}`
          : `模型能力未开启视频输入，附件已降级为文本描述：${resolved.filename}`
      );
      continue;
    }

    if (
      isTextLikeAttachment(resolved.kind, resolved.mimeType, resolved.filename)
    ) {
      const text = decodeTextBytes(bytes);
      if (text) {
        const truncated =
          text.length > AGENT_ATTACHMENT_TEXT_MAX_CHARS
            ? `${text.slice(0, AGENT_ATTACHMENT_TEXT_MAX_CHARS)}\n…（附件文本已截断）`
            : text;
        pushPart(parts, {
          type: "text",
          text: formatTextFallback(resolved, truncated.trim()),
        });
        stats.textFallbackCount += 1;
        if (truncated.length !== text.length) {
          warnings.push(`附件文本过长已截断：${resolved.filename}`);
        }
        continue;
      }
    }

    pushPart(parts, {
      type: "text",
      text: formatDegradedDescription(resolved),
    });
    stats.degradedCount += 1;
    warnings.push(`附件类型未内联发送，已降级为文本描述：${resolved.filename}`);
  }

  return { parts, stats, warnings };
}
