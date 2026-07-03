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

import { assetManagerEngine } from "@/composables/useAssetManager";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { readFile } from "@tauri-apps/plugin-fs";
import type { PipelineAttachment } from "../../types/pipeline-attachment";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
}

export async function getAttachmentBuffer(
  attachment: PipelineAttachment
): Promise<ArrayBuffer> {
  switch (attachment.source.kind) {
    case "inline":
      return base64ToArrayBuffer(attachment.source.base64);

    case "asset-library":
      return assetManagerEngine.getAssetBinary(attachment.source.path);

    case "agent-private": {
      const agentDir = await join(
        await appConfigDir(),
        "llm-chat",
        "agents",
        attachment.source.agentId
      );
      const fullPath = await join(agentDir, attachment.source.relativePath);
      return toStandaloneArrayBuffer(await readFile(fullPath));
    }
  }
}
