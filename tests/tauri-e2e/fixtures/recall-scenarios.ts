export const RECALL_SCENARIO_SCHEMA_VERSION = 1 as const;

export interface RecallChatScenario {
  id: string;
  userMarker: string;
  expectedStream?: boolean;
  requiredEvidence?: Array<{
    entryId: string;
    contentMarker: string;
  }>;
  requiredContextMarkers?: string[];
  forbiddenEvidence?: string[];
  response: {
    chunks: string[];
    finishReason: "stop";
  };
  expected: {
    embeddingRequests: number;
    topEntryId?: string;
  };
}

export const RECALL_ENTRY_IDS = {
  renderer: "20000000-0000-4000-8000-000000000001",
  base64: "20000000-0000-4000-8000-000000000002",
  memory: "20000000-0000-4000-8000-000000000003",
  structure: "20000000-0000-4000-8000-000000000004",
} as const;

export const RECALL_EVIDENCE_MARKERS = {
  renderer: "E2E_EVIDENCE_RENDERER_HEAVY_COMPONENT_INIT",
  base64: "E2E_EVIDENCE_BASE64_MALFORMED_DATA_URL",
  memory: "E2E_EVIDENCE_FRONTEND_OWNS_DATA_RUST_ACCELERATES",
  structure: "E2E_EVIDENCE_TOOL_CORE_LOGIC_CONFIG_STORES",
  empty: "E2E_RECALL_EMPTY_RESULT",
} as const;

const allEntryMarkers = [
  RECALL_EVIDENCE_MARKERS.renderer,
  RECALL_EVIDENCE_MARKERS.base64,
  RECALL_EVIDENCE_MARKERS.memory,
  RECALL_EVIDENCE_MARKERS.structure,
];

export const recallChatScenarios: RecallChatScenario[] = [
  {
    id: "renderer-positive",
    userMarker: "[e2e:recall-renderer-v2]",
    expectedStream: true,
    requiredEvidence: [
      {
        entryId: RECALL_ENTRY_IDS.renderer,
        contentMarker: RECALL_EVIDENCE_MARKERS.renderer,
      },
    ],
    forbiddenEvidence: [RECALL_EVIDENCE_MARKERS.base64],
    response: {
      chunks: ["复杂 Markdown 的停顿点来自", "重型组件初始化。"],
      finishReason: "stop",
    },
    expected: {
      embeddingRequests: 1,
      topEntryId: RECALL_ENTRY_IDS.renderer,
    },
  },
  {
    id: "base64-positive",
    userMarker: "[e2e:recall-base64]",
    expectedStream: true,
    requiredEvidence: [
      {
        entryId: RECALL_ENTRY_IDS.base64,
        contentMarker: RECALL_EVIDENCE_MARKERS.base64,
      },
    ],
    forbiddenEvidence: [RECALL_EVIDENCE_MARKERS.renderer],
    response: {
      chunks: ["先检查畸形 data URL，", "再核对原始请求体。"],
      finishReason: "stop",
    },
    expected: {
      embeddingRequests: 1,
      topEntryId: RECALL_ENTRY_IDS.base64,
    },
  },
  {
    id: "memory-ownership",
    userMarker: "[e2e:recall-memory-ownership]",
    expectedStream: true,
    requiredEvidence: [
      {
        entryId: RECALL_ENTRY_IDS.memory,
        contentMarker: RECALL_EVIDENCE_MARKERS.memory,
      },
    ],
    response: {
      chunks: ["前端持有数据，", "Rust 副本用于计算加速。"],
      finishReason: "stop",
    },
    expected: {
      embeddingRequests: 1,
      topEntryId: RECALL_ENTRY_IDS.memory,
    },
  },
  {
    id: "no-result",
    userMarker: "[e2e:recall-no-result]",
    expectedStream: true,
    requiredContextMarkers: [RECALL_EVIDENCE_MARKERS.empty],
    forbiddenEvidence: allEntryMarkers,
    response: {
      chunks: ["没有可用的", "召回内容。"],
      finishReason: "stop",
    },
    expected: { embeddingRequests: 1 },
  },
  {
    id: "binding-disabled",
    userMarker: "[e2e:recall-binding-disabled]",
    expectedStream: true,
    forbiddenEvidence: [...allEntryMarkers, RECALL_EVIDENCE_MARKERS.empty],
    response: {
      chunks: ["本轮未注入", " Recall。"],
      finishReason: "stop",
    },
    expected: { embeddingRequests: 0 },
  },
  {
    id: "non-stream-response",
    userMarker: "[e2e:recall-non-stream]",
    expectedStream: false,
    requiredEvidence: [
      {
        entryId: RECALL_ENTRY_IDS.structure,
        contentMarker: RECALL_EVIDENCE_MARKERS.structure,
      },
    ],
    response: {
      chunks: ["工具模块按 core、logic、config 和 stores 拆分。"],
      finishReason: "stop",
    },
    expected: {
      embeddingRequests: 1,
      topEntryId: RECALL_ENTRY_IDS.structure,
    },
  },
  {
    id: "knowledge-explicit-existing-e2e",
    userMarker: "E2E explicit Knowledge query",
    response: {
      chunks: ["E2E Knowledge request completed."],
      finishReason: "stop",
    },
    expected: { embeddingRequests: 0 },
  },
];

export interface EmbeddingTopic {
  id: string;
  markers: string[];
  axis: number;
}

export const embeddingTopics: EmbeddingTopic[] = [
  {
    id: "renderer",
    markers: [
      RECALL_EVIDENCE_MARKERS.renderer,
      "复杂 markdown",
      "streaming markdown",
      "heavy component",
    ],
    axis: 0,
  },
  {
    id: "base64",
    markers: [
      RECALL_EVIDENCE_MARKERS.base64,
      "base64 image",
      "data url",
      "原始请求体",
    ],
    axis: 1,
  },
  {
    id: "memory",
    markers: [
      RECALL_EVIDENCE_MARKERS.memory,
      "rust 内存副本",
      "frontend data ownership",
      "计算加速",
    ],
    axis: 2,
  },
  {
    id: "structure",
    markers: [
      RECALL_EVIDENCE_MARKERS.structure,
      "core/logic/config/stores",
      "工具目录结构",
    ],
    axis: 3,
  },
  {
    id: "rust-ownership",
    markers: ["rust ownership", "borrow checker", "所有权与借用"],
    axis: 4,
  },
  {
    id: "banana-bread",
    markers: ["banana bread", "香蕉面包"],
    axis: 5,
  },
];
