export interface KnowledgeLibrary {
  id: string;
  name: string;
  description?: string;
  embeddingModelId: string;
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
  modelId?: string;
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
