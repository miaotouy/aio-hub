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
