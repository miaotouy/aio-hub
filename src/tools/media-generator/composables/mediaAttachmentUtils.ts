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

import { convertArrayBufferToBase64 } from "@/utils/base64";

export type MediaAttachmentKind = "image" | "video" | "audio" | "mask";

export function inferMediaAttachmentType(att: any): MediaAttachmentKind {
  if (att?.type === "audio" || att?.mimeType?.startsWith?.("audio/")) {
    return "audio";
  }
  if (att?.type === "video" || att?.mimeType?.startsWith?.("video/")) {
    return "video";
  }
  if (att?.type === "mask" || att?.role === "mask") {
    return "mask";
  }
  return "image";
}

export function stripAudioDataUrl(input: string): string {
  const match = input.match(/^data:[^;]+;base64,(.+)$/s);
  return match ? match[1] : input;
}

export async function audioAttachmentToBase64(
  att: any,
  getAssetBinary: (path: string) => Promise<ArrayBuffer>
): Promise<string | undefined> {
  if (!att) return undefined;
  if (att.b64) return stripAudioDataUrl(String(att.b64));
  if (att.inlineData?.base64) return String(att.inlineData.base64);
  if (!att.path) return undefined;
  const buffer = await getAssetBinary(att.path);
  return convertArrayBufferToBase64(buffer);
}

export async function getSingleAudioAttachmentBase64(
  attachments: any[] | undefined,
  getAssetBinary: (path: string) => Promise<ArrayBuffer>
): Promise<string | undefined> {
  const audioAttachments = (attachments || []).filter(
    (att) => inferMediaAttachmentType(att) === "audio"
  );
  if (audioAttachments.length > 1) {
    throw new Error("MiniMax 翻唱一次只支持一个参考音频附件");
  }
  return audioAttachmentToBase64(audioAttachments[0], getAssetBinary);
}

export function getSingleAudioAttachment(
  attachments: any[] | undefined
): any | undefined {
  const audioAttachments = (attachments || []).filter(
    (att) => inferMediaAttachmentType(att) === "audio"
  );
  if (audioAttachments.length > 1) {
    throw new Error("MiniMax 翻唱一次只支持一个参考音频附件");
  }
  return audioAttachments[0];
}
