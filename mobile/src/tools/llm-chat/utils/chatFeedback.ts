import { Dialog, Snackbar } from "@varlet/ui";

export async function confirmDeleteMessage(): Promise<boolean> {
  const action = await Dialog({
    title: "删除消息",
    message: "将删除这条消息及其所有后续分支，确定继续吗？",
    confirmButtonText: "删除",
    cancelButtonText: "取消",
  });

  return action === "confirm";
}

export function showChatSuccess(content: string): void {
  Snackbar.success(content);
}
