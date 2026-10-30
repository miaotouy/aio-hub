import { nanoid } from "nanoid";

import type { VirtualTextAttachment } from "../types/virtual-attachment";

export const DEFAULT_TEXT_ATTACHMENT_THRESHOLD = 3000;
export const LARGE_TEXT_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_TEXT_ATTACHMENT_BYTES = 16 * 1024 * 1024;
export const MAX_TEXT_ATTACHMENTS = 100;

export function textCharacterCount(text: string): number {
  let count = 0;
  for (const _character of text) count++;
  return count;
}

export function createVirtualTextAttachment(
  text: string,
  existing: readonly VirtualTextAttachment[] = []
): VirtualTextAttachment {
  let index = 1;
  const titles = new Set(existing.map((item) => item.title));
  while (titles.has(`粘贴文本 ${index}`)) index++;
  return { id: nanoid(), kind: "text", title: `粘贴文本 ${index}`, text };
}

export function cloneVirtualAttachments(
  attachments: readonly VirtualTextAttachment[] | undefined,
  newIds = false
): VirtualTextAttachment[] {
  return (attachments ?? []).map((item) => ({
    ...item,
    ...(newIds ? { id: nanoid() } : {}),
  }));
}

/** Validate imported and synchronized data before it enters a draft/message. */
export function normalizeVirtualAttachments(
  value: unknown
): VirtualTextAttachment[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_TEXT_ATTACHMENTS) {
    throw new Error("文本附件数量超出限制");
  }
  const ids = new Set<string>();
  return value.map((item) => {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      item.kind !== "text" ||
      typeof item.title !== "string" ||
      typeof item.text !== "string" ||
      !item.text.trim()
    ) {
      throw new Error("文本附件数据无效");
    }
    if (
      new TextEncoder().encode(item.text).byteLength > MAX_TEXT_ATTACHMENT_BYTES
    ) {
      throw new Error("单份文本附件最多支持 16 MiB，请拆分材料");
    }
    ids.add(item.id);
    return {
      id: item.id,
      kind: "text",
      title: item.title.slice(0, 200),
      text: item.text,
    };
  });
}

/** Same wrapper for model requests, token previews and readable exports. */
export function formatVirtualTextAttachment(
  attachment: Pick<VirtualTextAttachment, "title" | "text">
): string {
  const title = attachment.title.replace(/[\r\n\[\]]/g, " ");
  const runs = attachment.text.match(/`+/g) ?? [];
  let fenceLength = 3;
  for (const run of runs) fenceLength = Math.max(fenceLength, run.length + 1);
  const fence = "`".repeat(fenceLength);
  return `\n[文本附件: ${title}]\n${fence}\n${attachment.text}\n${fence}\n`;
}

export function formatVirtualAttachments(
  attachments?: readonly VirtualTextAttachment[]
): string {
  return (attachments ?? []).map(formatVirtualTextAttachment).join("");
}
