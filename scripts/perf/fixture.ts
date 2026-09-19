// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 玻璃材质性能对比 —— 确定性 fixture 生成器。
 *
 * 目标：在 baseline 与 candidate 构建上生成**逐字节一致**的聊天数据与外观设置，
 * 使两次 release 运行的差异只来自代码本身。
 *
 * 产物（全部落在隔离的 data-dir 内）：
 * - agent-manager/agents-index.json + agents/{id}/agent.json
 * - llm-chat/sessions-index.json + sessions/{id}.json
 * - app-settings/settings.json（开启壁纸 + UI 模糊，即模糊路径真正生效）
 */

import fs from "node:fs";
import path from "node:path";

/** 固定时间戳：避免每次生成的时间字段造成内容漂移。 */
export const PERF_FIXTURE_TIMESTAMP = "2026-01-15T08:00:00.000Z";
export const PERF_AGENT_ID = "perf-glass-agent";
export const PERF_SESSION_ID = "perf-glass-long-session";

export interface PerfFixtureOptions {
  /** 会话内消息条数（不含根节点）。 */
  messageCount?: number;
  /** 每条消息正文的重复权重，用于控制单条消息高度。 */
  paragraphCount?: number;
  /** 每 N 条消息插入一段代码块，用于覆盖富文本分支。 */
  codeBlockEvery?: number;
}

export interface PerfFixtureManifest {
  agentId: string;
  sessionId: string;
  rootNodeId: string;
  activeLeafId: string;
  messageCount: number;
  paragraphCount: number;
  codeBlockCount: number;
  appearance: {
    enableWallpaper: boolean;
    builtinWallpaperName: string;
    enableUiEffects: boolean;
    enableUiBlur: boolean;
    uiBlurIntensity: number;
    chatMessageBlurFactor: number;
    uiBaseOpacity: number;
  };
}

const DEFAULT_MESSAGE_COUNT = 240;
const DEFAULT_PARAGRAPH_COUNT = 3;
const DEFAULT_CODE_BLOCK_EVERY = 12;

function paragraph(seed: number, index: number): string {
  const topics = [
    "这一段用于撑开消息高度，让滚动场景具备足够的合成压力。",
    "区域玻璃层要求在滚动时保持稳定的采样面，因此这里刻意保留长文本。",
    "逐元素 backdrop-filter 的成本会随可见消息数量线性增长。",
    "性能对比关注的是同一份数据在两种实现下的相对差异。",
  ];
  return `[${seed}-${index}] ${topics[index % topics.length]}`;
}

function codeBlock(seed: number): string {
  return [
    "```ts",
    `// perf fixture block ${seed}`,
    "export function measure(frameTimes: number[]): number {",
    "  return frameTimes.reduce((sum, value) => sum + value, 0);",
    "}",
    "```",
  ].join("\n");
}

function messageBody(seed: number, paragraphCount: number): string {
  const parts: string[] = [];
  for (let index = 0; index < paragraphCount; index += 1) {
    parts.push(paragraph(seed, index));
  }
  return parts.join("\n\n");
}

export function buildPerfFixture(options: PerfFixtureOptions = {}): {
  manifest: PerfFixtureManifest;
  files: Record<string, unknown>;
} {
  const messageCount = options.messageCount ?? DEFAULT_MESSAGE_COUNT;
  const paragraphCount = options.paragraphCount ?? DEFAULT_PARAGRAPH_COUNT;
  const codeBlockEvery = options.codeBlockEvery ?? DEFAULT_CODE_BLOCK_EVERY;

  if (!Number.isInteger(messageCount) || messageCount < 2) {
    throw new Error("messageCount must be an integer >= 2.");
  }
  if (!Number.isInteger(paragraphCount) || paragraphCount < 1) {
    throw new Error("paragraphCount must be an integer >= 1.");
  }

  const rootNodeId = `${PERF_SESSION_ID}-root`;
  const nodes: Record<string, unknown> = {
    [rootNodeId]: {
      id: rootNodeId,
      parentId: null,
      childrenIds: [],
      content: "",
      role: "system",
      status: "complete",
      isEnabled: true,
      timestamp: PERF_FIXTURE_TIMESTAMP,
    },
  };

  let parentId = rootNodeId;
  let codeBlockCount = 0;
  for (let index = 0; index < messageCount; index += 1) {
    const id = `${PERF_SESSION_ID}-n${String(index).padStart(4, "0")}`;
    const isAssistant = index % 2 === 1;
    const includeCode = codeBlockEvery > 0 && index % codeBlockEvery === 0;
    if (includeCode) codeBlockCount += 1;
    const body = messageBody(index, paragraphCount);
    const content = includeCode ? `${body}\n\n${codeBlock(index)}` : body;

    nodes[id] = {
      id,
      parentId,
      childrenIds: [],
      content,
      role: isAssistant ? "assistant" : "user",
      status: "complete",
      isEnabled: true,
      timestamp: PERF_FIXTURE_TIMESTAMP,
      metadata: {
        agentId: PERF_AGENT_ID,
        agentName: "Perf Glass Agent",
        profileId: "perf-glass-profile",
        modelId: "perf-glass-model",
      },
    };
    (nodes[parentId] as { childrenIds: string[] }).childrenIds.push(id);
    parentId = id;
  }

  const activeLeafId = parentId;

  const agentIndex = {
    version: "1.1.0",
    agents: [
      {
        id: PERF_AGENT_ID,
        name: PERF_AGENT_ID,
        displayName: "Perf Glass Agent",
        description:
          "Deterministic long-chat fixture for glass material perf runs",
        icon: "P",
        profileId: "perf-glass-profile",
        modelId: "perf-glass-model",
        lastUsedAt: PERF_FIXTURE_TIMESTAMP,
        createdAt: PERF_FIXTURE_TIMESTAMP,
        category: "assistant",
        tags: ["perf", "glass"],
      },
    ],
  };

  const agentDetail = {
    version: 3,
    id: PERF_AGENT_ID,
    name: PERF_AGENT_ID,
    displayName: "Perf Glass Agent",
    description: "Deterministic long-chat fixture for glass material perf runs",
    icon: "P",
    profileId: "perf-glass-profile",
    modelId: "perf-glass-model",
    createdAt: PERF_FIXTURE_TIMESTAMP,
    lastUsedAt: PERF_FIXTURE_TIMESTAMP,
    parameters: { temperature: 0, maxTokens: 512 },
    presetMessages: [],
    greetings: [],
    recallConfig: {
      enabled: false,
      bindings: [],
      groups: [],
      autoInjectIfMacroMissing: false,
      autoInjectPosition: "context_head",
    },
    recallSettings: {
      defaultProfile: "semantic",
      defaultLimit: 3,
      maxRecallChars: 6000,
      defaultMinScore: 0.2,
      emptyText: "",
      enableCache: true,
    },
    toolCallConfig: {
      enabled: false,
      mode: "auto",
      toolToggles: {},
      methodToggles: {},
      autoApproveTools: {},
      autoApproveMethods: {},
      defaultToolEnabled: false,
      defaultAutoApprove: false,
      maxIterations: 1,
      timeout: 30,
      parallelExecution: false,
      protocol: "vcp",
      convertToolRoleToUser: false,
    },
    extensionConfig: {
      enabled: false,
      extensionToggles: {},
      defaultExtensionEnabled: false,
    },
    avatarHistory: [],
    worldbookIds: [],
    quickActionSetIds: [],
    presetGroups: [],
    tags: ["perf", "glass"],
    category: "assistant",
  };

  const sessionIndex = {
    version: "1.1.2",
    currentSessionId: PERF_SESSION_ID,
    sessions: [
      {
        id: PERF_SESSION_ID,
        name: "Perf Glass Long Session",
        displayAgentId: PERF_AGENT_ID,
        messageCount,
        createdAt: PERF_FIXTURE_TIMESTAMP,
        updatedAt: PERF_FIXTURE_TIMESTAMP,
        isFavorite: false,
        favoriteFolderId: null,
      },
    ],
    favoriteFolders: [],
  };

  const sessionDetail = {
    id: PERF_SESSION_ID,
    name: "Perf Glass Long Session",
    rootNodeId,
    activeLeafId,
    nodes,
    createdAt: PERF_FIXTURE_TIMESTAMP,
    updatedAt: PERF_FIXTURE_TIMESTAMP,
    displayAgentId: PERF_AGENT_ID,
    messageCount,
    history: [],
    historyIndex: -1,
  };

  const appearance = {
    enableWallpaper: true,
    wallpaperMode: "static",
    wallpaperSource: "builtin",
    builtinWallpaperName: "abstract-shapes.png",
    wallpaperPath: "",
    wallpaperOpacity: 0.55,
    wallpaperFit: "cover",
    enableUiEffects: true,
    enableUiBlur: true,
    uiBaseOpacity: 0.75,
    detachedUiBaseOpacity: 0.95,
    uiBlurIntensity: 24,
    chatMessageBlurFactor: 1,
    enableWindowEffects: false,
    windowEffect: "none",
    enableWindowBackgroundOpacity: false,
    windowBackgroundOpacity: 1,
    backgroundColorOpacity: 1,
    showWindowShadow: true,
  };

  const settings = {
    version: "1.0.0",
    theme: "light",
    appearance,
    // 固定窗口尺寸的还原点：由 window-configs.json 单独控制，这里保持默认。
    logLevel: "WARN",
  };

  return {
    manifest: {
      agentId: PERF_AGENT_ID,
      sessionId: PERF_SESSION_ID,
      rootNodeId,
      activeLeafId,
      messageCount,
      paragraphCount,
      codeBlockCount,
      appearance: {
        enableWallpaper: appearance.enableWallpaper,
        builtinWallpaperName: appearance.builtinWallpaperName,
        enableUiEffects: appearance.enableUiEffects,
        enableUiBlur: appearance.enableUiBlur,
        uiBlurIntensity: appearance.uiBlurIntensity,
        chatMessageBlurFactor: appearance.chatMessageBlurFactor,
        uiBaseOpacity: appearance.uiBaseOpacity,
      },
    },
    files: {
      "agent-manager/agents-index.json": agentIndex,
      [`agent-manager/agents/${PERF_AGENT_ID}/agent.json`]: agentDetail,
      "llm-chat/sessions-index.json": sessionIndex,
      [`llm-chat/sessions/${PERF_SESSION_ID}.json`]: sessionDetail,
      "app-settings/settings.json": settings,
      // 固定主窗口尺寸，避免窗口记忆导致两次运行的视口不同。
      "window-configs.json": {
        main: { x: 80, y: 60, width: 1440, height: 900, maximized: false },
      },
    },
  };
}

/** 幂等写入 fixture；目标文件内容不一致时拒绝覆盖，避免污染既有运行数据。 */
export function writePerfFixture(
  dataDir: string,
  fixture = buildPerfFixture()
): PerfFixtureManifest {
  const resolved = path.resolve(dataDir);
  fs.mkdirSync(resolved, { recursive: true });
  for (const [relativePath, value] of Object.entries(fixture.files)) {
    const target = path.join(resolved, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  return fixture.manifest;
}
