import type { LocalFileRef, WireJsonValue } from "../types/json";

const LOCAL_FILE_REF_KEYS = new Set(["kind", "path", "contentType"]);

export function isLocalFileRef(value: unknown): value is LocalFileRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === "local-file-ref" &&
    typeof candidate.path === "string" &&
    candidate.path.length > 0 &&
    (candidate.contentType === undefined ||
      typeof candidate.contentType === "string") &&
    Object.keys(candidate).every((key) => LOCAL_FILE_REF_KEYS.has(key))
  );
}

export function containsLocalFileRef(value: WireJsonValue): boolean {
  const pending: WireJsonValue[] = [value];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    if (isLocalFileRef(current)) return true;
    if (Array.isArray(current)) {
      pending.push(...current);
    } else if (current && typeof current === "object") {
      pending.push(...Object.values(current));
    }
  }

  return false;
}
