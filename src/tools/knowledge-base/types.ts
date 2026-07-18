import type {
  EmbeddingSpaceDescriptorV1,
  EmbeddingTaskType,
} from "@aiohub/llm-core";

export const KNOWLEDGE_LIBRARY_CONFIG_SCHEMA_VERSION = 1 as const;

export interface KnowledgeChunkingConfig {
  strategy: "fixed";
  targetChars: number;
  overlapChars: number;
}

export interface KnowledgeEmbeddingIndexConfig {
  enabled: boolean;
  routeKey: string;
  requestedDimensions?: number;
  queryTaskType: EmbeddingTaskType;
  documentTaskType: EmbeddingTaskType;
  encodingFormat: "float";
  adapterContractVersion: number;
}

export interface KnowledgeIndexFlags {
  keyword: boolean;
  semantic: boolean;
  graph: boolean;
}

export interface KnowledgeLibraryIndexConfig {
  schemaVersion: typeof KNOWLEDGE_LIBRARY_CONFIG_SCHEMA_VERSION;
  chunking: KnowledgeChunkingConfig;
  embedding: KnowledgeEmbeddingIndexConfig;
  indexes: KnowledgeIndexFlags;
}

export interface KnowledgeRuntimeConfig {
  version: "1.0.0";
  defaultEmbeddingRouteKey: string;
  embeddingRequestConcurrency: number;
  embeddingBatchSize: number;
  embeddingMaxRetries: number;
  embeddingRetryDelayMs: number;
  ingestQueueConcurrency: number;
  ingestLeaseTimeoutSeconds: number;
  ingestMaxAttempts: number;
  maxImportFileBytes: number;
  maxImportBatchFiles: number;
}

export type KnowledgeSourceKind = "file" | "directory";
export type KnowledgeIngestTaskStatus =
  | "pending"
  | "processing"
  | "retry"
  | "failed"
  | "completed"
  | "cancelled";

export interface KnowledgeSource {
  id: string;
  libraryId: string;
  kind: KnowledgeSourceKind;
  rootPath: string;
  recursive: boolean;
  ignorePatterns: string[];
  status: string;
  fileCount: number;
  pendingTaskCount: number;
  failedTaskCount: number;
  lastScanAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeIngestTask {
  id: string;
  libraryId: string;
  sourceId: string;
  sourceFileId: string;
  sourcePath: string;
  operation: "upsert" | "delete";
  expectedChecksum: string;
  fileSize: number;
  modifiedAt: number;
  parserVersion: string;
  status: KnowledgeIngestTaskStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAt: number;
  leaseToken?: string;
  leaseExpiresAt?: number;
  cancelRequested: boolean;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeEnqueueFailure {
  sourcePath: string;
  message: string;
}

export interface KnowledgeEnqueueResult {
  taskIds: string[];
  queued: number;
  skippedUnchanged: number;
  skippedQueued: number;
  failures: KnowledgeEnqueueFailure[];
}

export interface AgentKnowledgeAccess {
  enabled: boolean;
  allowedLibraryIds: string[];
  allowSearchAll: boolean;
  allowDocumentRead: boolean;
  allowResearch: boolean;
}

export const KNOWLEDGE_REFERENCE_SCHEMA_VERSION = 1 as const;

export interface KnowledgeReferenceLibrarySnapshot {
  id: string;
  name: string;
  availability: KnowledgeLibraryAvailability;
}

/**
 * 用户在聊天输入区显式选择的 Knowledge 引用。
 *
 * libraryIds 是执行与权限判断的唯一依据；libraries 只保存发送时的显示快照。
 */
export interface KnowledgeReference {
  schemaVersion: typeof KNOWLEDGE_REFERENCE_SCHEMA_VERSION;
  type: "knowledge";
  libraryIds: string[];
  mode: "search" | "research";
  libraries: KnowledgeReferenceLibrarySnapshot[];
}

export type KnowledgeLibraryAvailability =
  "available" | "unavailable" | "deleted";

export interface KnowledgeLibrarySummary {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  availability: KnowledgeLibraryAvailability;
  supportsKeywordSearch: boolean;
  supportsSemanticSearch: boolean;
  indexStatus: {
    keyword: "ready" | "unavailable";
    semantic: "ready" | "notBuilt" | "unavailable";
  };
}

export interface KnowledgeLibrary {
  id: string;
  name: string;
  description?: string;
  embeddingModelId: string;
  activeEmbeddingSpaceId: string;
  embeddingRouteKey: string;
  embeddingSpaceDescriptor?: EmbeddingSpaceDescriptorV1;
  dimension: number;
  config: KnowledgeLibraryIndexConfig;
  documentCount: number;
  chunkCount: number;
  sourceCount: number;
  pendingTaskCount: number;
  failedTaskCount: number;
  keywordIndexStatus: "ready" | "partial";
  semanticIndexStatus: "ready" | "partial" | "notBuilt";
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeLibraryUpdate {
  name: string;
  description?: string;
}

export interface KnowledgeDocument {
  id: string;
  libraryId: string;
  sourcePath: string;
  title: string;
  checksum: string;
  mimeType: string;
  size: number;
  status: string;
  chunkCount: number;
  vectorizedChunkCount: number;
  sourceId: string;
  sourceFileId: string;
  sourceChecksum: string;
  parserVersion: string;
  version: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeChunk {
  id: string;
  libraryId: string;
  documentId: string;
  sourcePath: string;
  title: string;
  chunkIndex: number;
  content: string;
  checksum: string;
  heading?: string;
  startOffset: number;
  endOffset: number;
}

export type KnowledgeSearchStrategy =
  "auto" | "keyword" | "semantic" | "hybrid";

export type KnowledgeSignalType =
  "knowledge-bm25" | "knowledge-vector" | "knowledge-graph";

export interface KnowledgeSignal {
  signalType: KnowledgeSignalType;
  score: number;
}

export interface KnowledgeResult {
  sourceType: "knowledge";
  libraryId: string;
  libraryName: string;
  documentId: string;
  sourcePath: string;
  title: string;
  chunkId: string;
  chunkIndex: number;
  heading?: string;
  content: string;
  score: number;
  signals: KnowledgeSignal[];
}

export interface KnowledgeSearchRequest {
  query: string;
  libraryIds: string[];
  strategy: KnowledgeSearchStrategy;
  limit: number;
  minScore: number;
  queryVector?: number[];
  spaceId?: string;
}

export interface KnowledgeSearchTrace {
  libraryIds: string[];
  requestedStrategy: KnowledgeSearchStrategy;
  actualStrategy: Exclude<KnowledgeSearchStrategy, "auto">;
  degradationReason?: string;
}

export interface KnowledgeSearchExecution {
  results: KnowledgeResult[];
  traces: KnowledgeSearchTrace[];
}

export interface KnowledgeSearchFilters {
  documentIds?: string[];
  sourceTypes?: string[];
  pathPrefixes?: string[];
}

export interface KnowledgeToolSearchRequest {
  query: string;
  libraryIds?: string[];
  strategy?: KnowledgeSearchStrategy;
  topK?: number;
  filters?: KnowledgeSearchFilters;
  includeAdjacent?: boolean;
  maxChars?: number;
}

export interface KnowledgeToolHit {
  libraryId: string;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  title: string;
  heading?: string;
  sourcePath: string;
  snippet: string;
  score: number;
  rankScore: number;
  signals: KnowledgeSignal[];
}

export interface KnowledgeToolSearchResponse {
  query: string;
  requestedStrategy: KnowledgeSearchStrategy;
  traces: KnowledgeSearchTrace[];
  hits: KnowledgeToolHit[];
  totalCandidates: number;
  truncated: boolean;
}

export interface KnowledgeToolReadRequest {
  libraryId: string;
  chunkId?: string;
  documentId?: string;
  chunkIndex?: number;
  neighborCount?: number;
  heading?: string;
  startOffset?: number;
  endOffset?: number;
  maxChars: number;
}

export interface KnowledgeToolReadChunk {
  libraryId: string;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  title: string;
  heading?: string;
  sourcePath: string;
  startOffset: number;
  endOffset: number;
  content: string;
}

export interface KnowledgeToolReadResponse {
  libraryId: string;
  documentId: string;
  sourcePath: string;
  title: string;
  chunks: KnowledgeToolReadChunk[];
  previousChunkIndex?: number;
  nextChunkIndex?: number;
  truncated: boolean;
}

export interface KnowledgeIngestRequest {
  libraryId: string;
  sourcePath: string;
  title?: string;
  mimeType?: string;
  content: string;
}

export interface KnowledgeVectorRecord {
  chunkId: string;
  vector: number[];
}

export interface KnowledgeIndexStatus {
  libraryId: string;
  totalChunks: number;
  vectorizedChunks: number;
  pendingChunks: number;
  keywordIndexedChunks: number;
  semanticFallbackChunks: number;
  sourceCount: number;
  pendingTaskCount: number;
  failedTaskCount: number;
  embeddingModelId: string;
  activeEmbeddingSpaceId: string;
  embeddingRouteKey: string;
  embeddingSpaceDescriptor?: EmbeddingSpaceDescriptorV1;
  dimension: number;
}

export type KnowledgeImportStage = "validation" | "read" | "parse" | "ingest";

export interface KnowledgeImportFailure {
  sourcePath: string;
  fileName: string;
  stage: KnowledgeImportStage;
  message: string;
}
