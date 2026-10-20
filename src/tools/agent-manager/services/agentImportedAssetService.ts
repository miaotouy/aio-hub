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

import { invoke } from "@tauri-apps/api/core";
import { getAgentStorageSubdirectory } from "../utils/agentAssetUtils";

/** 将包内引用写入目标智能体目录，并返回路径已还原的配置副本。 */
export async function restoreImportedAgentAssets<T extends object>(
  source: T,
  assets: Record<string, ArrayBuffer>,
  agentId: string
): Promise<T> {
  const config = JSON.parse(JSON.stringify(source)) as T;
  const binaries = new Map(
    Object.entries(assets).map(([path, binary]) => [
      path.replace(/\\/g, "/"),
      binary,
    ])
  );
  const written = new Set<string>();

  const visit = async (obj: any, parentKey = ""): Promise<void> => {
    if (!obj || typeof obj !== "object") return;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value !== "string") {
        await visit(value, Array.isArray(obj) ? parentKey : key);
        continue;
      }
      const isAvatar = key === "icon" || parentKey === "avatarHistory";
      const normalized = value.replace(/\\/g, "/");
      const archivePath = normalized.startsWith("assets/")
        ? normalized
        : isAvatar
          ? `assets/${normalized}`
          : "";
      const binary = binaries.get(archivePath);
      if (!binary) continue;

      const relativePath = isAvatar
        ? archivePath.replace(/^assets\//, "")
        : archivePath;
      const parts = relativePath.split("/");
      if (
        parts.some(
          (part) => !part || part === "." || part === ".." || part.includes(":")
        )
      ) {
        throw new Error(`资产路径无效：${archivePath}`);
      }
      if (!written.has(relativePath)) {
        const filename = parts.pop()!;
        await invoke("save_uploaded_file", {
          fileData: new Uint8Array(binary),
          subdirectory: getAgentStorageSubdirectory(agentId, parts.join("/")),
          filename,
        });
        written.add(relativePath);
      }
      obj[key] = relativePath;
    }
  };
  await visit(config);
  return config;
}
