import type {
  ChatMessageNode,
  ChatMessageReference,
} from "../types";

const MESSAGE_ROLES = new Set(["system", "user", "assistant"]);

/**
 * Creates a durable display snapshot so reply cards remain meaningful when a
 * source branch is later edited or deleted.
 */
export function createReplyReference(
  message: ChatMessageNode
): ChatMessageReference {
  return {
    messageId: message.id,
    role: message.role,
    content: message.content,
    ...(message.timestamp ? { timestamp: message.timestamp } : {}),
  };
}

export function isChatMessageReference(
  value: unknown
): value is ChatMessageReference {
  if (!value || typeof value !== "object") return false;
  const reference = value as Partial<ChatMessageReference>;
  return (
    typeof reference.messageId === "string" &&
    MESSAGE_ROLES.has(String(reference.role)) &&
    typeof reference.content === "string" &&
    (reference.timestamp === undefined || typeof reference.timestamp === "string")
  );
}

/**
 * Keep the user-visible message content untouched while making its selected
 * reply target explicit to the model in the request history.
 */
export function formatReplyReferenceContent(
  reference: ChatMessageReference | undefined,
  content: string
): string {
  if (!reference) return content;
  return [
    `<reply_to role="${reference.role}">`,
    reference.content,
    "</reply_to>",
    "",
    content,
  ].join("\n");
}
