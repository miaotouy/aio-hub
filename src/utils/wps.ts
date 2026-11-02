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

export const WPS_MIME = "application/kswps";

export function isWpsMime(mime?: string | null): boolean {
  return (
    typeof mime === "string" &&
    [
      WPS_MIME,
      "application/wps",
      "application/x-wps",
      "application/vnd.ms-works",
    ].includes(mime.toLowerCase())
  );
}

export function isWpsAssetLike(asset: {
  name?: string;
  mimeType?: string;
}): boolean {
  return (
    isWpsMime(asset.mimeType) ||
    asset.name?.toLowerCase().endsWith(".wps") === true
  );
}

/** 部分 .wps 文件实际为 OOXML 包，可直接复用 DOCX 渲染。 */
export async function isWpsDocxContainer(buffer: Uint8Array): Promise<boolean> {
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);
    return !!zip.file("[Content_Types].xml") && !!zip.file("word/document.xml");
  } catch {
    return false;
  }
}
