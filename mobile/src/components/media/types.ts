export type MediaKind = "image" | "video" | "audio";

export interface MediaItem {
  assetId: string;
  kind: MediaKind;
  displayName: string;
  mimeType: string;
  posterAssetId?: string;
}

export type MediaPreviewMode = "inline" | "sheet" | "fullscreen";

export type MediaPreviewState =
  "closed" | "opening" | "loading" | "ready" | "error";

export type MediaPreviewErrorCode =
  | "asset-unavailable"
  | "expired"
  | "range-unsupported"
  | "unsupported-format"
  | "load-failed";
