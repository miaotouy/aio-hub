export type AssetKind = "image" | "audio" | "video" | "document" | "other";
export type AssetAvailability =
  | "ready"
  | "importing"
  | "reclaimed"
  | "missing"
  | "error";
export type AssetRetentionPolicy = "reclaimable" | "pinned";
export type AssetLibraryState = "visible" | "hidden";
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
  libraryState: AssetLibraryState;
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
  status: "imported" | "deduplicated" | "restored" | "failed" | "cancelled";
  asset?: AssetRecord;
  errorCode?: string;
  message?: string;
}

export type AssetImportJobState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AssetImportJob {
  id: string;
  sourceKind: AssetOriginKind | "mixed" | "unknown";
  state: AssetImportJobState;
  bytesCopied: number;
  totalBytes: number | null;
  sourceCount: number;
  completedCount: number;
  currentSourceIndex: number | null;
  results: AssetImportResult[];
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetImportProgressEvent {
  jobId: string;
  state: AssetImportJobState;
  bytesCopied: number;
  totalBytes: number | null;
  sourceCount: number;
  completedCount: number;
  currentSourceIndex: number | null;
}

export interface AssetListQuery {
  kind?: AssetKind;
  search?: string;
  libraryState?: AssetLibraryState | "all";
  createdMonth?: string;
  originKind?: AssetOriginKind;
  sourceModule?: string;
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

export interface AssetDeleteAnalysisItem {
  assetId: string;
  displayName: string;
  availability: AssetAvailability | "missing_record";
  retentionPolicy: AssetRetentionPolicy;
  sizeBytes: number;
  blockingUsageCount: number;
  advisoryUsageCount: number;
  canDelete: boolean;
  requiresAdvisoryConfirmation: boolean;
  blockedReason?: "not_found" | "pinned" | "blocking_usage" | "busy";
}

export interface AssetDeleteAnalysis {
  items: AssetDeleteAnalysisItem[];
  canDeleteAll: boolean;
  requiresAdvisoryConfirmation: boolean;
  totalSizeBytes: number;
}

export interface AssetDeleteResult {
  deletedCount: number;
  reclaimedCount: number;
  cleanedFileCount: number;
  pendingCleanupCount: number;
}

export interface AssetKindStorageSummary {
  kind: AssetKind;
  assetCount: number;
  sizeBytes: number;
}

export interface AssetStorageSummary {
  assetCount: number;
  readyCount: number;
  missingCount: number;
  reclaimedCount: number;
  originalBytes: number;
  reclaimableBytes: number;
  cacheBytes: number;
  temporaryBytes: number;
  pendingCleanupCount: number;
  byKind: AssetKindStorageSummary[];
}

export interface AssetRepairReport {
  cleanedPendingFiles: number;
  cleanedTemporaryFiles: number;
  cleanedOrphanFiles: number;
  markedMissingAssets: number;
  pendingCleanupCount: number;
}

export interface AssetCacheClearResult {
  removedVariantCount: number;
  reclaimedBytes: number;
  cleanedFileCount: number;
  pendingCleanupCount: number;
}

export interface AssetMonthFacet {
  month: string;
  assetCount: number;
  sizeBytes: number;
}

export interface AssetSourceFacet {
  originKind: AssetOriginKind;
  sourceModule: string;
  assetCount: number;
  sizeBytes: number;
}

export interface AssetLibraryFacets {
  byMonth: AssetMonthFacet[];
  bySource: AssetSourceFacet[];
}

export interface AssetPreviewSource {
  id: string;
  kind: "custom-protocol";
  url: string;
  mimeType: string;
  sizeBytes: number;
  expiresAtMs: number;
  supportsRange: boolean;
  maxRangeBytes: number;
  maxFullResponseBytes: number;
}

export interface AssetExportResult {
  bytesWritten: number;
  fileName: string;
}
