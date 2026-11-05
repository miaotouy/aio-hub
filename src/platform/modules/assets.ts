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

import { convertFileSrc } from "../native/core";

/** Local resource origins allowed by the current desktop host. */
export function getLocalAssetCspSources(): string {
  return "asset: agent-asset: http://asset.localhost https://asset.localhost";
}

export function getAssetProtocolCspSource(): string {
  return "asset:";
}

/** Normalize only the host-generated asset URL, retaining encoded path characters. */
export function toLocalAssetUrl(path: string): string {
  const result = convertFileSrc(path);
  return result.includes("asset.localhost") || result.startsWith("asset:")
    ? result.replace(/\\/g, "/")
    : result;
}

export function getSubtitleFontSources(): Record<string, string> {
  return {
    "microsoft yahei": convertFileSrc("C:\\Windows\\Fonts\\msyh.ttc"),
    "microsoft yahei ui": convertFileSrc("C:\\Windows\\Fonts\\msyh.ttc"),
    simhei: convertFileSrc("C:\\Windows\\Fonts\\simhei.ttf"),
    simsun: convertFileSrc("C:\\Windows\\Fonts\\simsun.ttc"),
    dengxian: convertFileSrc("C:\\Windows\\Fonts\\DengXian.ttf"),
  };
}

/** Recognize the current host's already-converted local resource scheme. */
export function isLocalAssetUrl(source: string): boolean {
  return source.startsWith("asset:");
}

/** Strip host origins from an already-decoded URL for filename display. */
export function stripLocalAssetUrlPrefix(source: string): string {
  if (source.startsWith("asset://local/"))
    return source.slice("asset://local/".length).replace(/\?token=[^&]*$/, "");
  return source
    .replace(/^https?:\/\/asset\.localhost\//, "")
    .replace(/^asset:\/\//, "");
}
