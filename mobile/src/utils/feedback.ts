import { Dialog, Snackbar } from "@varlet/ui";

export type MessageType = "success" | "warning" | "info" | "error";

export function customMessage(message: string, type: MessageType = "info"): void {
  Snackbar({ content: message, type });
}

export async function customDialog(options: {
  title: string;
  message: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}): Promise<boolean> {
  const action = await Dialog({
    title: options.title,
    message: options.message,
    confirmButtonText: options.confirmButtonText,
    cancelButtonText: options.cancelButtonText,
  });
  return action === "confirm";
}
