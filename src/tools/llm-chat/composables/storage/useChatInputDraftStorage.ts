import { createConfigManager } from "@/utils/configManager";
import type { ChatInputDraftStorage } from "../input/useChatInputManager";

const config = createConfigManager<{
  version: string;
  state: ChatInputDraftStorage | null;
}>({
  moduleName: "llm-chat",
  fileName: "input-drafts.json",
  version: "1.0.0",
  createDefault: () => ({ version: "1.0.0", state: null }),
});
let pendingWrite: Promise<void> = Promise.resolve();

export async function loadChatInputDrafts(): Promise<ChatInputDraftStorage | null> {
  await pendingWrite;
  return (await config.load({ throwOnError: true })).state;
}

export function saveChatInputDrafts(
  state: ChatInputDraftStorage
): Promise<void> {
  const snapshot = JSON.parse(JSON.stringify(state)) as ChatInputDraftStorage;
  const write = pendingWrite.then(() =>
    config.save({ version: "1.0.0", state: snapshot })
  );
  pendingWrite = write.catch(() => {});
  return write;
}
