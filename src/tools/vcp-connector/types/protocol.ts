export type VcpMessageType =
  | "RAG_RETRIEVAL_DETAILS"
  | "META_THINKING_CHAIN"
  | "AGENT_PRIVATE_CHAT_PREVIEW"
  | "AI_MEMO_RETRIEVAL"
  | "PLUGIN_STEP_STATUS"
  | "UNKNOWN";

export interface VcpBaseMessage {
  type: VcpMessageType;
  timestamp: number;
  raw?: unknown;
}

export interface RagResult {
  text: string;
  score?: number;
  originalScore?: number;
  source: "rag" | "time";
  matchedTags?: string[];
  coreTagsMatched?: string[];
}

export interface RagRetrievalMessage extends VcpBaseMessage {
  type: "RAG_RETRIEVAL_DETAILS";
  dbName: string;
  query: string;
  k: number;
  useTime: string;
  useRerank: boolean;
  useTagMemo: boolean;
  tagWeight?: number;
  coreTags?: string[];
  results: RagResult[];
  tagStats?: Record<string, number>;
}

export interface ThinkingStageResult {
  text: string;
  score: number;
  source?: string;
}

export interface ThinkingStage {
  stage: number;
  clusterName: string;
  k: number;
  resultCount: number;
  results: ThinkingStageResult[];
}

export interface ThinkingChainMessage extends VcpBaseMessage {
  type: "META_THINKING_CHAIN";
  chainName: string;
  query: string;
  stages: ThinkingStage[];
}

export interface AgentChatPreviewMessage extends VcpBaseMessage {
  type: "AGENT_PRIVATE_CHAT_PREVIEW";
  agentName: string;
  query: string;
  response: string;
}

export interface AiMemoRetrievalMessage extends VcpBaseMessage {
  type: "AI_MEMO_RETRIEVAL";
  mode: string;
  diaryCount: number;
  extractedMemories: string;
}

export interface PluginStepStatusMessage extends VcpBaseMessage {
  type: "PLUGIN_STEP_STATUS";
  pluginName: string;
  stepName: string;
  status: "pending" | "running" | "completed" | "failed";
  message?: string;
}

export type VcpMessage =
  | RagRetrievalMessage
  | ThinkingChainMessage
  | AgentChatPreviewMessage
  | AiMemoRetrievalMessage
  | PluginStepStatusMessage;

export type VcpConnectionMode = "observer" | "distributed" | "both";

export interface VcpConfig {
  wsUrl: string;
  vcpKey: string;
  vcpPath: string;
  autoConnect: boolean;
  maxHistory: number;
  mode?: VcpConnectionMode;
}

export interface ConnectionState {
  status: "disconnected" | "connecting" | "connected" | "error";
  lastPingLatency?: number;
  lastPingTime?: number;
  reconnectAttempts: number;
}

export interface FilterState {
  types: VcpMessageType[];
  keyword: string;
  paused: boolean;
}

export interface MessageStats {
  totalCount: number;
  ragCount: number;
  chainCount: number;
  agentCount: number;
  memoCount: number;
  pluginCount: number;
  messagesPerMinute: number;
  startTime?: number;
}
