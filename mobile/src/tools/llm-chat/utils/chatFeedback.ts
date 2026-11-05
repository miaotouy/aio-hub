import { Dialog, Snackbar } from "@varlet/ui";
import { useI18n } from "@/i18n";

export async function confirmDeleteMessage(): Promise<boolean> {
  const { useScopedT } = useI18n();
  const t = useScopedT("tools.llm-chat.ChatView");
  const action = await Dialog({
    title: t("删除消息"),
    message: t("删除消息提示"),
    confirmButtonText: t("删除"),
    cancelButtonText: t("取消"),
  });

  return action === "confirm";
}

export function showChatSuccess(content: string): void {
  Snackbar.success(content);
}

export function showChatError(content: string): void {
  Snackbar.error(content);
}
