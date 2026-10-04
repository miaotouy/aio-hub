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
 * slashCommandService — 斜杠命令中枢
 *
 * 聚合两类指令来源：
 * 1. 系统内置指令（action 型，如 /清空、/翻译、/临时模型 等）
 * 2. 三层快捷操作组（Global / Agent / Profile）：每个组映射为一个自定义装配种类，
 *    组内 action 执行时由 handleQuickAction 调度（完整保留宏解析及正则后处理）
 *
 * CodeMirror 补全与 Textarea 浮层共用本服务的候选列表与拼音检索能力。
 */
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useQuickActionStore } from "../stores/quickActionStore";
import { useMessageInputStore } from "../stores/messageInputStore";
import { useChatSettings } from "../composables/settings/useChatSettings";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useUserProfileStore } from "../stores/userProfileStore";
import type {
  SlashCommandItem,
  SlashCommandGroup,
  ChatInputContext,
  SlashCommandScope,
} from "../types/slash-command";

const logger = createModuleLogger("llm-chat/slashCommandService");
const errorHandler = createModuleErrorHandler("llm-chat/slashCommandService");

/** 候选列表缓存时长，避免每次按键都重读快捷操作存储 */
const CACHE_TTL_MS = 15_000;

let commandCache: SlashCommandItem[] | null = null;
let cacheTime = 0;
let lastCacheKey = "";

export interface LoadSlashCommandsOptions {
  agentId?: string;
  userProfileId?: string;
  forceRefresh?: boolean;
}

/** 中文汉字拼音首字母边界表 (GB2312 范围) */
const PINYIN_BOUNDARIES = "按芭擦搭蛾发噶哈击喀垃妈拿哦趴期然撒塌挖昔压匝".split("");
const PINYIN_LETTERS = "abcdefghjklmnopqrstwxyz".split("");

/**
 * 获取中文字符串拼音首字母缩写（例如 "清空" -> "qk", "智能转写" -> "znzx"）
 */
export function getPinyinInitials(text: string): string {
  let result = "";
  for (const ch of text) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      result += ch.toLowerCase();
    } else if (/[\u4e00-\u9fa5]/.test(ch)) {
      let letter = "";
      for (let i = PINYIN_BOUNDARIES.length - 1; i >= 0; i--) {
        if (ch.localeCompare(PINYIN_BOUNDARIES[i], "zh-CN") >= 0) {
          letter = PINYIN_LETTERS[i];
          break;
        }
      }
      result += letter;
    }
  }
  return result;
}

/** 高频系统内置指令注册表 */
export function getSystemCommands(): SlashCommandItem[] {
  return [
    {
      id: "system:new-session",
      name: "新建会话",
      aliases: ["new", "new-session", "clear", "xj", "xjhh"],
      displayName: "新建会话",
      description: "开启一个全新的对话会话",
      category: "system",
      categoryLabel: "系统操作",
      scope: "system",
      type: "action",
      execute: async (context: ChatInputContext) => {
        const agentId = context.agentId || "";
        if (!agentId) {
          customMessage.warning("请先选择当前智能体");
          return;
        }
        if (context.isDetached) {
          const bus = useWindowSyncBus();
          await bus.requestAction("llm-chat:begin-new-session", {
            agentId,
          });
          customMessage.success("已在主窗口开启新会话");
        } else {
          const chatStore = useLlmChatStore();
          await chatStore.beginNewSession(agentId);
        }
        context.focus();
      },
    },
    {
      id: "system:translate",
      name: "翻译",
      aliases: ["translate", "fy"],
      displayName: "翻译输入内容",
      description: "使用配置的翻译模型翻译输入框中的内容",
      category: "system",
      categoryLabel: "系统操作",
      scope: "system",
      type: "action",
      execute: () => {
        const inputStore = useMessageInputStore();
        inputStore.handleTranslateInput();
      },
    },
    {
      id: "system:compress",
      name: "压缩",
      aliases: ["compress", "ys"],
      displayName: "压缩当前上下文",
      description: "将当前会话历史通过压缩模型进行智能摘要压缩",
      category: "system",
      categoryLabel: "系统操作",
      scope: "system",
      type: "action",
      execute: () => {
        const inputStore = useMessageInputStore();
        inputStore.handleCompressContext();
      },
    },
    {
      id: "system:analyze",
      name: "分析",
      aliases: ["analyze", "fx"],
      displayName: "分析当前上下文",
      description: "打开上下文结构分析器，查看当前装配的 Token 与结构",
      category: "system",
      categoryLabel: "系统操作",
      scope: "system",
      type: "action",
      execute: () => {
        const inputStore = useMessageInputStore();
        inputStore.handleAnalyzeContextWithInput();
      },
    },
    {
      id: "system:path2file",
      name: "路径转附件",
      aliases: ["path2file", "lj"],
      displayName: "路径转附件",
      description: "将输入文本中的有效本地文件路径自动识别并挂载为附件",
      category: "system",
      categoryLabel: "系统操作",
      scope: "system",
      type: "action",
      execute: () => {
        const inputStore = useMessageInputStore();
        inputStore.handleConvertPaths();
      },
    },
    {
      id: "system:transcribe",
      name: "智能转写",
      aliases: ["transcribe", "zx"],
      displayName: "智能转写全部附件",
      description: "对当前挂载的所有适用附件启动智能转写任务",
      category: "system",
      categoryLabel: "系统操作",
      scope: "system",
      type: "action",
      execute: () => {
        const inputStore = useMessageInputStore();
        inputStore.handleSmartTranscribeAll();
      },
    },
    {
      id: "system:model",
      name: "临时模型",
      aliases: ["model", "ls"],
      displayName: "选择临时模型",
      description: "为单次发送挑选临时覆盖模型（发送后即失效）",
      category: "model",
      categoryLabel: "模型操作",
      scope: "system",
      type: "action",
      execute: (context: ChatInputContext) => {
        if (context.isDetached) {
          const bus = useWindowSyncBus();
          bus.requestAction("llm-chat:select-temporary-model", {});
          customMessage.info("正在主窗口中打开模型选择弹窗...");
        } else {
          const inputStore = useMessageInputStore();
          inputStore.handleSelectTemporaryModel();
        }
      },
    },
    {
      id: "system:cut-draft",
      name: "剪切草稿",
      aliases: ["cut-draft", "jq"],
      displayName: "剪切草稿",
      description: "将当前输入框草稿剪切到多会话共享的草稿剪贴板",
      category: "system",
      categoryLabel: "系统操作",
      scope: "system",
      type: "action",
      execute: () => {
        const inputStore = useMessageInputStore();
        inputStore.handleCutDraft();
      },
    },
    {
      id: "system:paste-draft",
      name: "粘贴草稿",
      aliases: ["paste-draft", "zt"],
      displayName: "粘贴草稿",
      description: "从草稿剪贴板粘贴此前暂存的输入草稿内容",
      category: "system",
      categoryLabel: "系统操作",
      scope: "system",
      type: "action",
      execute: () => {
        const inputStore = useMessageInputStore();
        inputStore.handlePasteDraft();
      },
    },
  ];
}

/**
 * 从三层快捷操作组 (Global / Agent / Profile) 加载斜杠命令
 */
async function loadFromQuickActions(
  options?: LoadSlashCommandsOptions
): Promise<SlashCommandItem[]> {
  const items: SlashCommandItem[] = [];
  try {
    const quickActionStore = useQuickActionStore();
    const { settings: chatSettings } = useChatSettings();
    const agentStore = useAgentStore();
    const profileStore = useUserProfileStore();

    // 1. 全局配置关联的快捷操作组 (scope: 'global')
    const globalIds = chatSettings.value.quickActionSetIds || [];

    // 2. 智能体关联的快捷操作组 (scope: 'agent')
    const agent = options?.agentId
      ? agentStore.getAgentById(options.agentId)
      : null;
    const agentIds = agent?.quickActionSetIds || [];

    // 3. 用户画像关联的快捷操作组 (scope: 'profile')
    const profileId = options?.userProfileId || agent?.userProfileId;
    const effectiveProfile = profileStore.getEffectiveProfile(profileId);
    const profileIds = effectiveProfile?.quickActionSetIds || [];

    const allIds = Array.from(
      new Set([...globalIds, ...agentIds, ...profileIds])
    );

    if (allIds.length === 0) {
      return items;
    }

    // 确保所有关联组数据已加载
    await quickActionStore.ensureSetsLoaded(allIds);

    // 建立 ID 归属优先级映射
    const idToScopeMap = new Map<string, SlashCommandScope>();
    for (const id of globalIds) idToScopeMap.set(id, "global");
    for (const id of agentIds) idToScopeMap.set(id, "agent");
    for (const id of profileIds) idToScopeMap.set(id, "profile");

    for (const setId of allIds) {
      const set = quickActionStore.loadedSets.get(setId);
      if (!set) continue;

      const scope = idToScopeMap.get(setId) || "global";

      for (const action of set.actions) {
        if (action.isEnabled === false) continue;

        // 生成指令条目
        items.push({
          id: `quick-action:${set.id}:${action.id}`,
          name: action.label,
          displayName: action.label,
          description:
            action.description ||
            action.content.slice(0, 60).replace(/\s+/g, " "),
          category: set.id,
          categoryLabel: set.name,
          scope,
          type: "action",
          template: action.content,
          autoSend: action.autoSend,
          execute: async () => {
            const inputStore = useMessageInputStore();
            await inputStore.handleQuickAction(action);
          },
        });
      }
    }
  } catch (error) {
    errorHandler.error(error as Error, "从快捷操作组加载斜杠命令失败", {
      showToUser: false,
    });
  }
  return items;
}

/**
 * 获取聚合后的斜杠命令列表（带 TTL 缓存）
 */
export async function getSlashCommands(
  options?: LoadSlashCommandsOptions
): Promise<SlashCommandItem[]> {
  const now = Date.now();
  const cacheKey = `${options?.agentId || ""}_${options?.userProfileId || ""}`;

  if (
    !options?.forceRefresh &&
    commandCache &&
    lastCacheKey === cacheKey &&
    now - cacheTime < CACHE_TTL_MS
  ) {
    return commandCache;
  }

  const quickActionItems = await loadFromQuickActions(options);
  const commands = [...getSystemCommands(), ...quickActionItems];

  commandCache = commands;
  lastCacheKey = cacheKey;
  cacheTime = now;
  logger.debug("斜杠命令列表已聚合", {
    total: commands.length,
    cacheKey,
  });
  return commands;
}

/** 使缓存失效（快捷操作组变更后调用） */
export function invalidateSlashCommandCache(): void {
  commandCache = null;
  cacheTime = 0;
  lastCacheKey = "";
}

/**
 * 按关键词过滤命令
 * 匹配：name、displayName、description、categoryLabel 以及 aliases
 * 额外支持中文首字母拼音快速匹配（例如 /qk 匹配 清空, /fy 匹配 翻译）
 */
export function filterCommands(
  commands: SlashCommandItem[],
  keyword: string
): SlashCommandItem[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return commands;

  return commands.filter((item) => {
    // 1. 直观英文字段与文本匹配
    if (item.name.toLowerCase().includes(normalized)) return true;
    if (item.displayName.toLowerCase().includes(normalized)) return true;
    if (item.description.toLowerCase().includes(normalized)) return true;
    if (item.categoryLabel && item.categoryLabel.toLowerCase().includes(normalized))
      return true;

    // 2. 别名列表匹配
    if (
      item.aliases &&
      item.aliases.some((alias) => alias.toLowerCase().includes(normalized))
    ) {
      return true;
    }

    // 3. 中文拼音首字母检索
    const namePinyin = getPinyinInitials(item.name);
    if (namePinyin.includes(normalized)) return true;

    const displayPinyin = getPinyinInitials(item.displayName);
    if (displayPinyin.includes(normalized)) return true;

    return false;
  });
}

/**
 * 按装配种类分组（保持原始出现顺序，系统类始终排最前）
 */
export function groupCommandsByCategory(
  commands: SlashCommandItem[]
): SlashCommandGroup[] {
  const groups = new Map<string, SlashCommandGroup>();
  for (const item of commands) {
    let group = groups.get(item.category);
    if (!group) {
      group = {
        category: item.category,
        categoryLabel: item.categoryLabel || item.category,
        items: [],
      };
      groups.set(item.category, group);
    }
    group.items.push(item);
  }

  const result = [...groups.values()];
  // 系统操作排最前
  result.sort((a, b) => {
    if (a.category === "system") return -1;
    if (b.category === "system") return 1;
    if (a.category === "model") return -1;
    if (b.category === "model") return 1;
    return 0;
  });
  return result;
}

/**
 * 执行命令
 * 优先调用 execute(context)，否则回退模板插入
 */
export async function applyCommand(
  item: SlashCommandItem,
  context: ChatInputContext
): Promise<void> {
  if (item.execute) {
    await item.execute(context);
    return;
  }
  // 兜底：直接把模板插入到输入框
  if (item.template) {
    context.insertText(item.template);
    if (item.autoSend) {
      context.requestSubmit();
    }
  }
}
