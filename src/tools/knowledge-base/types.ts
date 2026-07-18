import type { EmbeddingSpaceDescriptorV1 } from "@aiohub/llm-core";

export interface AgentKnowledgeAccess {
  enabled: boolean;
  allowedLibraryIds: string[];
  allowSearchAll: boolean;
  allowDocumentRead: boolean;
  allowResearch: boolean;
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
  config: Record<string, unknown>;
  documentCount: number;
  chunkCount: number;
  createdAt: number;
  updatedAt: number;
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
  embeddingModelId: string;
  activeEmbeddingSpaceId: string;
  embeddingRouteKey: string;
  embeddingSpaceDescriptor?: EmbeddingSpaceDescriptorV1;
  dimension: number;
}

export interface KnowledgeImportFailure {
  sourcePath: string;
  message: string;
}
