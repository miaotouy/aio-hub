/** Editable text owned by a chat draft or message. */
export interface VirtualTextAttachment {
  id: string;
  kind: "text";
  title: string;
  text: string;
}
