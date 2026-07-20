export type AssetKind = "image" | "audio" | "video" | "document" | "other";
export type AssetAvailability =
  | "ready"
  | "importing"
  | "reclaimed"
  | "missing"
  | "error";
export type AssetRetentionPolicy = "reclaimable" | "pinned";
export type AssetUsagePolicy = "advisory" | "blocking";
export type AssetOriginKind =
  | "file_picker"
  | "photo_picker"
  | "camera"
  | "share"
  | "network"
  | "generated"
  | "tool";

export interface AssetRecord {
  id: string;
  contentHash: string;
  kind: AssetKind;
  mimeType: string;
  displayName: string;
  sizeBytes: number;
  storageMode: "managed" | "linked";
  availability: AssetAvailability;
  libraryState: "visible" | "hidden";
  retentionPolicy: AssetRetentionPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedAssetRef {
  assetId: string;
  usagePolicy: AssetUsagePolicy;
  snapshot: {
    displayName: string;
    kind: AssetKind;
    mimeType: string;
    sizeBytes: number;
    extractedText?: string;
  };
}

export interface AssetImportSource {
  reference: string;
  originKind: AssetOriginKind;
  sourceModule: string;
  originalName?: string;
  mimeType?: string;
}

export interface AssetImportResult {
  sourceIndex: number;
  status: "imported" | "deduplicated" | "restored" | "failed";
  asset?: AssetRecord;
  errorCode?: string;
  message?: string;
}

export interface AssetListQuery {
  kind?: AssetKind;
  search?: string;
  includeHidden?: boolean;
  includeUnavailable?: boolean;
  limit?: number;
  offset?: number;
}

export interface AssetOriginSummary {
  id: number;
  originKind: AssetOriginKind;
  sourceModule: string;
  originalName: string;
  createdAt: string;
}

export interface AssetUsageSummary {
  id: number;
  moduleId: string;
  entityType: string;
  entityId: string;
  role: string;
  usagePolicy: AssetUsagePolicy;
  createdAt: string;
}

export interface AssetDetail extends AssetRecord {
  origins: AssetOriginSummary[];
  usages: AssetUsageSummary[];
}

export interface AssetUsageInput {
  assetId: string;
  role: string;
  usagePolicy: AssetUsagePolicy;
}
