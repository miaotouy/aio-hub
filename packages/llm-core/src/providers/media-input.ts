import type { JsonValue } from "../types/json";

type JsonObject = Record<string, JsonValue>;

const AUDIO_FORMAT_ALIASES: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
};

/**
 * `input_audio.format` must match the actual encoding; sending an ogg or flac
 * payload mislabeled as mp3 makes upstream providers reject or mis-decode it.
 * Unknown media types fall back to their lowercase subtype.
 */
export function audioInputFormat(mediaType: string | undefined): string {
  const normalized = mediaType?.split(";")[0]?.trim().toLowerCase();
  if (!normalized) return "mp3";
  const alias = AUDIO_FORMAT_ALIASES[normalized];
  if (alias) return alias;
  if (normalized === "audio/*" || !normalized.includes("/")) return "mp3";
  return normalized.split("/")[1] ?? "mp3";
}

const DOCUMENT_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "text/html": "html",
  "text/yaml": "yaml",
  "text/xml": "xml",
  "application/json": "json",
  "application/xml": "xml",
  "application/yaml": "yaml",
  "application/x-yaml": "yaml",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export function readStringField(
  value: JsonObject | undefined,
  key: string
): string | undefined {
  const field = value?.[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

export function documentFilename(
  source: JsonObject | undefined,
  mediaType: string
): string {
  const explicit =
    readStringField(source, "filename") ??
    readStringField(source, "displayName") ??
    readStringField(source, "display_name");
  if (explicit) return explicit;

  const normalized = mediaType.split(";")[0]?.trim().toLowerCase();
  const extension =
    (normalized && DOCUMENT_EXTENSIONS[normalized]) ||
    normalized?.split("/")[1]?.replace(/[^a-z0-9-]/g, "") ||
    "bin";
  return `document.${extension}`;
}

/** Strips a `data:<mime>;base64,` prefix, returning the raw base64 payload. */
export function base64FromDataUrl(value: string): string | undefined {
  const match = /^data:[^;,]+;base64,(.+)$/s.exec(value);
  return match ? match[1] : undefined;
}
