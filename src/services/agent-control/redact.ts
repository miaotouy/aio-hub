/** Output protection against accidental ingestion, shared by all controller replies. */
const sensitiveKey =
  /(?:api.?key|authorization|password|passwd|secret|token|cookie|credential|private.?key)/i;
export const sensitiveSelector =
  '[data-sensitive],[data-control-ignore],input[type="password"]';
export function redactText(value: string): string {
  return value
    .replace(/\b(?:Bearer|Basic)\s+[^\s"'<>]+/gi, "[redacted]")
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, "[redacted]")
    .replace(
      /((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;"'<>]+/gi,
      "$1[redacted]"
    )
    .replace(/([?&][^=\s]+)=([^&\s]+)/g, "$1=[redacted]");
}
export function redactOutput(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[truncated]";
  if (typeof value === "string") return redactText(value).slice(0, 24000);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.slice(0, 1000).map((v) => redactOutput(v, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveKey.test(key)) {
      result[key === "apiKey" ? "hasApiKey" : key] =
        key === "apiKey" ? Boolean(item) : "[redacted]";
    } else result[key] = redactOutput(item, depth + 1);
  }
  return result;
}
/** Read only text nodes from safe subtrees; never form values or sensitive ancestors. */
export function safeText(element: Element): string {
  if (element.closest(sensitiveSelector)) return "";
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (
      node instanceof Element &&
      node.matches(
        `${sensitiveSelector},input,textarea,select,[contenteditable],script,style`
      )
    )
      return "";
    return Array.from(node.childNodes).map(walk).join(" ");
  };
  return redactText(walk(element).replace(/\s+/g, " ").trim()).slice(0, 160);
}
