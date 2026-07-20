import type { ValidationRun } from "../types/validation";

const URI_PATTERN = /\b(content|file):\/\/[^\s]+/gi;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s]+/g;
const MOBILE_PATH_PATTERN = /\/(?:storage|data|private|var)\/[^\s]+/g;
const SECRET_PATTERN =
  /\b(sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})\b/gi;

export function redactValidationText(value: string): string {
  return value
    .replace(
      URI_PATTERN,
      (_match, scheme: string) => `${scheme.toLowerCase()}://[redacted]`
    )
    .replace(WINDOWS_PATH_PATTERN, "[redacted-path]")
    .replace(MOBILE_PATH_PATTERN, "[redacted-path]")
    .replace(SECRET_PATTERN, "[redacted-secret]");
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactValidationText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item)])
    );
  }
  return value;
}

export function redactValidationRun(run: ValidationRun): ValidationRun {
  return redactValue(run) as ValidationRun;
}
