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
 * 1. 系统内置指令（action 型，如 /clear）
 * 2. 已启用的快捷操作组：每个组映射为一个自定义装配种类，
 *    组内 action 映射为 insert 型指令（复用快捷操作管理面板即可增删分组与指令）
 *
 * CodeMirror 补全与 Textarea 浮层共用本服务的候选列表。
 */
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useQuickActionStore } from "../stores/quickActionStore";
import type {
  SlashCommandItem,
  SlashCommandGroup,
  ChatInputContext,
} from "../types/slash-command";

const logger = createModuleLogger("llm-chat/slashCommandService");
const errorHandler = createModuleErrorHandler("llm-chat/slashCommandService");

/** 候选列表缓存时长，避免每次按键都重读快捷操作存储 */
const CACHE_TTL_MS = 30_000;

let commandCache: SlashCommandItem[] | null = null;
let cacheTime = 0;

/** 系统内置指令 */
function getSystemCommands(): SlashCommandItem[] {
  return [
    {
      id: "system:clear",
      name: "clear",
      displayName: "清空输入框",
      description: "清空当前输入框的全部内容",
      category: "system",
      categoryLabel: "系统操作",
      type: "action",
      execute: (context: ChatInputContext) => {
        context.replaceValue("");
        context.focus();
      },
    },
  ];
}

/** 从快捷操作组加载 insert 型指令（组 = 装配种类） */
async function loadFromQuickActions(): Promise<SlashCommandItem[]> {
  const items: SlashCommandItem[] = [];
  try {
    const store = useQuickActionStore();

    // 索引为空时尝试懒加载（正常情况下应用启动时已加载）
    if (store.quickActionSets.length === 0) {
      await store.loadQuickActions();
    }

    const enabledSets = store.quickActionSets.filter((s) => s.isEnabled);
    for (const meta of enabledSets) {
      const set = await store.getQuickActionSet(meta.id);
      if (!set) continue;
      for (const action of set.actions) {
        if (action.isEnabled === false) continue;
        items.push({
          id: `quick-action:${meta.id}:${action.id}`,
          name: action.label,
          displayName: action.label,
          description:
            action.description || action.content.slice(0, 60).replace(/\s+/g, " "),
          category: meta.id,
          categoryLabel: meta.name,
          type: "insert",
          template: action.content,
          autoSend: action.autoSend,
        });
      }
    }
  } catch (error) {
    // 快捷操作存储不可用时降级为空列表，不影响系统指令
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
  forceRefresh = false
): Promise<SlashCommandItem[]> {
  const now = Date.now();
  if (!forceRefresh && commandCache && now - cacheTime < CACHE_TTL_MS) {
    return commandCache;
  }

  const [quickActionItems] = await Promise.all([loadFromQuickActions()]);
  const commands = [...getSystemCommands(), ...quickActionItems];

  commandCache = commands;
  cacheTime = now;
  logger.debug("斜杠命令列表已聚合", { total: commands.length });
  return commands;
}

/** 使缓存失效（快捷操作组变更后调用） */
export function invalidateSlashCommandCache(): void {
  commandCache = null;
  cacheTime = 0;
}

/**
 * 按关键词过滤命令（匹配指令名、显示名、描述与种类标签，不区分大小写）
 */
export function filterCommands(
  commands: SlashCommandItem[],
  keyword: string
): SlashCommandItem[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return commands;
  return commands.filter(
    (item) =>
      item.name.toLowerCase().includes(normalized) ||
      item.displayName.toLowerCase().includes(normalized) ||
      item.description.toLowerCase().includes(normalized) ||
      (item.categoryLabel || "").toLowerCase().includes(normalized)
  );
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
    return 0;
  });
  return result;
}

/**
 * 执行 action 型命令（insert 型由编辑器补全 UI 直接处理模板插入）
 */
export async function applyCommand(
  item: SlashCommandItem,
  context: ChatInputContext
): Promise<void> {
  if (item.type === "action" && item.execute) {
    await item.execute(context);
    return;
  }
  // 兜底：直接把模板追加到光标处
  if (item.template) {
    context.insertText(item.template);
  }
}
