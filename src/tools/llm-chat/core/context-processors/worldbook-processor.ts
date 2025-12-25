import { ContextProcessor, PipelineContext } from '../../types/pipeline';
import {
  STWorldbookEntry,
  STWorldbookLogic,
  STWorldbookPosition,
  MatchedWorldbookEntry,
  STWorldbook,
} from '../../types/worldbook';
import { ProcessableMessage } from '../../types/context';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('WorldbookProcessor');

/**
 * 模拟 SillyTavern 的扫描缓冲区
 */
class WorldbookBuffer {
  private depthBuffer: string[] = [];
  private fullHistory: string[] = []; // 完整的历史记录，用于 Sticky/Cooldown
  private recurseBuffer: string[] = [];
  private globalScanData: {
    personaDescription: string;
    characterDescription: string;
    characterPersonality: string;
    characterDepthPrompt: string;
    scenario: string;
    creatorNotes: string;
  };

  constructor(messages: string[], globalData: any) {
    this.depthBuffer = messages;
    this.fullHistory = messages;
    this.globalScanData = {
      personaDescription: globalData.personaDescription || '',
      characterDescription: globalData.characterDescription || '',
      characterPersonality: globalData.characterPersonality || '',
      characterDepthPrompt: globalData.characterDepthPrompt || '',
      scenario: globalData.scenario || '',
      creatorNotes: globalData.creatorNotes || '',
    };
  }

  addRecurse(text: string) {
    this.recurseBuffer.push(text);
  }

  getScanText(entry: STWorldbookEntry, defaultDepth: number): string {
    let depth = entry.scanDepth ?? defaultDepth;
    const MATCHER = '\x01';
    const JOINER = '\n' + MATCHER;

    let parts = this.depthBuffer.slice(0, depth);
    let result = MATCHER + parts.join(JOINER);

    if (entry.matchPersonaDescription && this.globalScanData.personaDescription) {
      result += JOINER + this.globalScanData.personaDescription;
    }
    if (entry.matchCharacterDescription && this.globalScanData.characterDescription) {
      result += JOINER + this.globalScanData.characterDescription;
    }
    if (entry.matchCharacterPersonality && this.globalScanData.characterPersonality) {
      result += JOINER + this.globalScanData.characterPersonality;
    }
    if (entry.matchCharacterDepthPrompt && this.globalScanData.characterDepthPrompt) {
      result += JOINER + this.globalScanData.characterDepthPrompt;
    }
    if (entry.matchScenario && this.globalScanData.scenario) {
      result += JOINER + this.globalScanData.scenario;
    }
    if (entry.matchCreatorNotes && this.globalScanData.creatorNotes) {
      result += JOINER + this.globalScanData.creatorNotes;
    }

    if (this.recurseBuffer.length > 0) {
      result += JOINER + this.recurseBuffer.join(JOINER);
    }

    return result;
  }

  matchKeys(haystack: string, needle: string, entry: STWorldbookEntry): boolean {
    const regexMatch = needle.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
    if (regexMatch) {
      try {
        let pattern = regexMatch[1];
        const flags = regexMatch[2];
        if (pattern.match(/(^|[^\\])\//)) return false;
        pattern = pattern.replace('\\/', '/');
        const re = new RegExp(pattern, flags);
        return re.test(haystack);
      } catch (e) {
        return false;
      }
    }

    const caseSensitive = entry.caseSensitive ?? false;
    const h = caseSensitive ? haystack : haystack.toLowerCase();
    const n = caseSensitive ? needle : needle.toLowerCase();

    if (entry.matchWholeWords) {
      const keyWords = n.split(/\s+/);
      if (keyWords.length > 1) {
        return h.includes(n);
      } else {
        const escaped = n.replace(/[.*+?^${}()[\]\\|]/g, '\\$&');
        const re = new RegExp(`(?:^|\\W)(${escaped})(?:$|\\W)`);
        return re.test(h);
      }
    }

    return h.includes(n);
  }

  /**
   * 在历史记录中检查是否有匹配（用于 Sticky/Cooldown）
   * @param keys 关键词列表
   * @param depth 回溯深度
   * @param entry 条目配置
   */
  checkMatchInHistory(keys: string[], depth: number, entry: STWorldbookEntry): boolean {
    if (depth <= 0) return false;
    // 获取最近的 N 条消息进行扫描
    const historyToScan = this.fullHistory.slice(0, depth);
    return historyToScan.some(text => {
      const MATCHER = '\x01';
      const haystack = MATCHER + text;
      return keys.some(k => this.matchKeys(haystack, k, entry));
    });
  }
}

export class WorldbookProcessor implements ContextProcessor {
  id = 'primary:worldbook-processor';
  name = '世界书处理器';
  description = '执行 SillyTavern 风格的世界书关键词匹配与注入';
  priority = 300;

  async execute(context: PipelineContext): Promise<void> {
    const { agentConfig, messages, sharedData } = context;

    // 从共享数据中获取已预加载的世界书内容 (由 useChatExecutor 投喂)
    const worldbooks = sharedData.get("loadedWorldbooks") as STWorldbook[] | undefined;

    if (!worldbooks || worldbooks.length === 0) return;

    const allEntries: { entry: STWorldbookEntry, bookName: string }[] = [];
    for (const book of worldbooks) {
      // 这里的 bookName 必须优先从 metadata 拿，如果 metadata 没被 Store 补全，则回退
      const bookName = book.metadata?.name || 'Unknown';
      if (book.entries) {
        Object.values(book.entries).forEach(entry => {
          allEntries.push({ entry, bookName });
        });
      }
    }

    if (allEntries.length === 0) return;

    const historyTexts = messages
      .filter(m => m.sourceType === 'session_history')
      .map(m => typeof m.content === 'string' ? m.content : '')
      .reverse();

    // 提取智能体配置中的各个字段
    const globalScanData = {
      personaDescription: agentConfig.description || '',
      characterDescription: agentConfig.presetMessages?.find(m => m.role === 'system')?.content || '',
      characterPersonality: (agentConfig as any).personality || '',
      characterDepthPrompt: (agentConfig as any).depthPrompt || '',
      scenario: (agentConfig as any).scenario || '',
      creatorNotes: (agentConfig as any).creatorNotes || '',
    };

    const buffer = new WorldbookBuffer(historyTexts, globalScanData);

    // 获取配置：Agent 覆盖 > 全局设置 > 默认值
    const globalSettings = context.settings.worldbook;
    const agentSettings = agentConfig.worldbookSettings;

    const maxTokens = agentSettings?.maxTokens ?? globalSettings?.maxTokens ?? 4000;
    const disableRecursion = agentSettings?.disableRecursion ?? globalSettings?.disableRecursion ?? false;
    const defaultScanDepth = agentSettings?.defaultScanDepth ?? globalSettings?.defaultScanDepth ?? 2;
    const maxRecursionSteps = (context.settings as any).world_info_max_recursion_steps ?? 0;

    // 使用 Map 存储激活的条目及其元数据，键使用 uid + bookName 的组合以确保唯一性
    const activatedEntries = new Map<string, { entry: STWorldbookEntry, bookName: string, matchedKeys: string[] }>();
    let scanState: 'INITIAL' | 'RECURSION' | 'DONE' = 'INITIAL';
    let loopCount = 0;
    let currentTokenBudget = 0;

    // 处理延迟递归层级
    const availableRecursionDelayLevels = [...new Set(allEntries
      .filter(item => item.entry.delayUntilRecursion)
      .map(item => item.entry.delayUntilRecursionLevel || 1)
    )].sort((a, b) => a - b);
    let currentRecursionDelayLevel = availableRecursionDelayLevels.shift() ?? 0;

    while (scanState !== 'DONE') {
      if (maxRecursionSteps > 0 && loopCount >= maxRecursionSteps) break;
      if (loopCount >= 20) break; // 硬限制防止死循环

      loopCount++;
      let newlyActivatedInThisLoop: { entry: STWorldbookEntry, bookName: string, matchedKeys: string[] }[] = [];
      const candidates = allEntries.filter(item => {
        const key = `${item.entry.uid}-${item.bookName}`;
        return !item.entry.disable && !activatedEntries.has(key);
      });

      for (const item of candidates) {
        const { entry } = item;

        // 角色/标签过滤器
        if (this.shouldFilterByCharacter(entry, agentConfig)) continue;

        // 延迟递归检查
        if (scanState !== 'RECURSION' && entry.delayUntilRecursion) continue;
        if (scanState === 'RECURSION' && entry.delayUntilRecursion && (entry.delayUntilRecursionLevel || 1) > currentRecursionDelayLevel) continue;

        const matchResult = this.checkActivation(entry, buffer, defaultScanDepth, historyTexts.length);
        if (matchResult.isMatched) {
          if (entry.useProbability && entry.probability < 100) {
            if (Math.random() * 100 > entry.probability) continue;
          }
          // 将匹配到的关键词记录下来
          newlyActivatedInThisLoop.push({
            ...item,
            matchedKeys: matchResult.matchedKeys
          });
        }
      }

      // 处理组竞争
      const winners = this.filterInclusionGroups(
        newlyActivatedInThisLoop,
        activatedEntries
      );

      if (winners.length > 0) {
        let addedAnyForRecursion = false;
        for (const winner of winners) {
          const { entry, bookName, matchedKeys } = winner;
          const entryTokens = Math.ceil(entry.content.length / 4);
          if (!entry.ignoreBudget && (currentTokenBudget + entryTokens > maxTokens)) continue;

          const key = `${entry.uid}-${bookName}`;
          activatedEntries.set(key, { entry, bookName, matchedKeys });
          currentTokenBudget += entryTokens;
          if (!entry.preventRecursion && !disableRecursion) {
            buffer.addRecurse(entry.content);
            addedAnyForRecursion = true;
          }
        }
        scanState = addedAnyForRecursion ? 'RECURSION' : 'DONE';
      } else {
        // 尝试提升递归层级
        if (availableRecursionDelayLevels.length > 0) {
          currentRecursionDelayLevel = availableRecursionDelayLevels.shift()!;
          scanState = 'RECURSION';
        } else {
          scanState = 'DONE';
        }
      }
    }

    if (activatedEntries.size === 0) return;

    const matchedEntries: MatchedWorldbookEntry[] = Array.from(activatedEntries.values()).map(item => {
      return {
        raw: item.entry,
        worldbookName: item.bookName,
        matchedKeys: item.matchedKeys
      };
    });

    context.sharedData.set('activatedWorldbookEntries', matchedEntries);
    this.injectEntries(context, matchedEntries);

    context.logs.push({
      processorId: this.id,
      level: 'info',
      message: `激活了 ${matchedEntries.length} 条世界书条目 (Budget: ${currentTokenBudget} tokens)`,
      details: {
        totalTokens: currentTokenBudget,
        activated: matchedEntries.map(m => ({
          uid: m.raw.uid,
          name: m.raw.comment || m.raw.key?.[0] || 'Unnamed Entry',
          worldbook: m.worldbookName
        }))
      }
    });

    logger.debug('世界书处理完成', { activatedCount: matchedEntries.length, tokens: currentTokenBudget });
  }

  /**
   * 检查条目是否应被角色过滤器排除
   * @returns true 表示应该跳过此条目
   */
  private shouldFilterByCharacter(entry: STWorldbookEntry, agentConfig: PipelineContext['agentConfig']): boolean {
    const filter = entry.characterFilter;
    if (!filter) return false;

    const hasNames = filter.names && filter.names.length > 0;
    const hasTags = filter.tags && filter.tags.length > 0;

    // 如果没有配置任何过滤条件，不过滤
    if (!hasNames && !hasTags) return false;

    const agentName = agentConfig.name;
    const agentTags = agentConfig.tags || [];

    const nameMatch = hasNames && filter.names.includes(agentName);
    const tagMatch = hasTags && filter.tags.some(t => agentTags.includes(t));
    const isMatched = nameMatch || tagMatch;

    if (filter.isExclude) {
      // 排除模式：匹配到则跳过
      return isMatched;
    } else {
      // 包含模式：未匹配到则跳过
      return !isMatched;
    }
  }

  private checkActivation(entry: STWorldbookEntry, buffer: WorldbookBuffer, defaultScanDepth: number, historyCount: number): { isMatched: boolean, matchedKeys: string[] } {
    if (entry.constant) return { isMatched: true, matchedKeys: [] };

    // 1. Delay 检查 (历史消息数量不足 N 条时不激活)
    if (entry.delay && historyCount < entry.delay) {
      return { isMatched: false, matchedKeys: [] };
    }

    // 2. Cooldown 检查 (激活后 N 条消息内不再激活)
    if (entry.cooldown && entry.cooldown > 0) {
      if (buffer.checkMatchInHistory(entry.key, entry.cooldown, entry)) {
        return { isMatched: false, matchedKeys: [] };
      }
    }

    const scanText = buffer.getScanText(entry, defaultScanDepth);
    const matchedKeys = entry.key.filter(k => buffer.matchKeys(scanText, k, entry));
    let isMatched = matchedKeys.length > 0;

    // 3. Sticky 检查 (如果当前未匹配，但在回溯范围内匹配过，则视为激活)
    if (!isMatched && entry.sticky && entry.sticky > 0) {
      if (buffer.checkMatchInHistory(entry.key, entry.sticky, entry)) {
        isMatched = true;
      }
    }

    if (!isMatched) return { isMatched: false, matchedKeys: [] };

    if (entry.selective && entry.keysecondary.length > 0) {
      const secondaryMatches = entry.keysecondary.map(k => buffer.matchKeys(scanText, k, entry));
      const matchCount = secondaryMatches.filter(Boolean).length;

      let selectiveMatched = false;
      switch (entry.selectiveLogic) {
        case STWorldbookLogic.AND_ANY: selectiveMatched = matchCount > 0; break;
        case STWorldbookLogic.AND_ALL: selectiveMatched = matchCount === entry.keysecondary.length; break;
        case STWorldbookLogic.NOT_ANY: selectiveMatched = matchCount === 0; break;
        case STWorldbookLogic.NOT_ALL: selectiveMatched = matchCount < entry.keysecondary.length; break;
        default: selectiveMatched = matchCount > 0;
      }

      if (!selectiveMatched) return { isMatched: false, matchedKeys: [] };
    }

    return { isMatched: true, matchedKeys };
  }

  private filterInclusionGroups(
    newlyActivated: { entry: STWorldbookEntry, bookName: string, matchedKeys: string[] }[],
    alreadyActivated: Map<string, { entry: STWorldbookEntry, bookName: string, matchedKeys: string[] }>
  ): { entry: STWorldbookEntry, bookName: string, matchedKeys: string[] }[] {
    const groups = new Map<string, { entry: STWorldbookEntry, bookName: string, matchedKeys: string[] }[]>();
    const nonGrouped: { entry: STWorldbookEntry, bookName: string, matchedKeys: string[] }[] = [];

    for (const item of newlyActivated) {
      const { entry } = item;
      if (entry.group) {
        const groupNames = entry.group.split(/,\s*/).filter(Boolean);
        groupNames.forEach(gn => {
          if (!groups.has(gn)) groups.set(gn, []);
          groups.get(gn)!.push(item);
        });
      } else {
        nonGrouped.push(item);
      }
    }

    const winners = new Set<{ entry: STWorldbookEntry, bookName: string, matchedKeys: string[] }>(nonGrouped);

    for (const [groupName, members] of groups) {
      const isGroupAlreadyActive = Array.from(alreadyActivated.values()).some(e => e.entry.group?.includes(groupName));
      if (isGroupAlreadyActive) continue;

      const overrideWinner = members.find(m => m.entry.groupOverride);
      if (overrideWinner) {
        winners.add(overrideWinner);
        continue;
      }

      const totalWeight = members.reduce((sum, m) => sum + (m.entry.groupWeight ?? 100), 0);
      let roll = Math.random() * totalWeight;
      for (const member of members) {
        roll -= (member.entry.groupWeight ?? 100);
        if (roll <= 0) {
          winners.add(member);
          break;
        }
      }
    }

    return Array.from(winners);
  }

  /**
   * 将激活的条目注入到消息上下文中
   *
   * 设计注记 (AIO Hub 注入策略):
   * SillyTavern 拥有极其复杂的锚点系统，而 AIO Hub 的消息流相对标准：
   * [全局系统指令] -> [角色档案 (agent_preset)] -> [示例对话 (agent_preset)] -> [历史记录 (session_history)]
   * （这个是示例顺序，但实际中这个预设消息是自由可调的）
   *
   * 为了确保世界书条目能作为“背景知识”被模型感知，同时不破坏核心指令权重，我们采取“降级映射”策略：
   * 1. BeforeChar / AfterChar: 映射到角色档案（第一个系统预设消息）前后。
   * 2. BeforeAN / BeforeEM: 映射到历史记录开始之前，作为背景补充。
   * 3. AfterAN / AfterEM: 映射到历史记录第一条之后，模拟酒馆中紧跟最新上下文的效果。
   * 4. Depth: 严格遵循深度注入逻辑，从末尾倒数。
   * 5. Outlet: 仅保留在 sharedData 中，不直接注入消息流，供后续宏处理器提取。
   *
   * 这种降级处理能保证世界书条目准确地卡在“设定”与“对话”之间。
   */
  private injectEntries(context: PipelineContext, matched: MatchedWorldbookEntry[]) {
    const sorted = [...matched].sort((a, b) => b.raw.order - a.raw.order);

    for (const item of sorted) {
      const entry = item.raw;
      // 映射角色 (ST 0=System, 1=User, 2=Assistant)
      let role: 'system' | 'user' | 'assistant' = 'system';
      if (entry.role === 1) role = 'user';
      else if (entry.role === 2) role = 'assistant';

      const message: ProcessableMessage = {
        role,
        content: entry.content,
        sourceType: entry.position === STWorldbookPosition.Depth ? 'depth_injection' : 'anchor_injection',
        sourceId: entry.uid,
      };

      const firstHistoryIndex = context.messages.findIndex(m => m.sourceType === 'session_history');
      const firstPresetIndex = context.messages.findIndex(m => m.sourceType === 'agent_preset');
      const systemPromptIndex = context.messages.findIndex(m => m.sourceType === 'agent_preset' && m.role === 'system');

      // 寻找各种锚点位置
      const historyAnchor = firstHistoryIndex >= 0 ? firstHistoryIndex : context.messages.length;
      const presetAnchor = firstPresetIndex >= 0 ? firstPresetIndex : historyAnchor;
      const charAnchor = systemPromptIndex >= 0 ? systemPromptIndex : presetAnchor;

      // 处理位置注入
      switch (entry.position) {
        case STWorldbookPosition.BeforeChar:
          context.messages.splice(charAnchor, 0, message);
          break;
        case STWorldbookPosition.AfterChar:
          context.messages.splice(charAnchor + 1, 0, message);
          break;
        case STWorldbookPosition.BeforeAN:
        case STWorldbookPosition.BeforeEM:
          // 暂时统一放在历史记录之前
          context.messages.splice(historyAnchor, 0, message);
          break;
        case STWorldbookPosition.AfterAN:
        case STWorldbookPosition.AfterEM:
          // 暂时统一放在历史记录第一条之后
          context.messages.splice(historyAnchor + 1, 0, message);
          break;
        case STWorldbookPosition.Depth:
          {
            // Depth 注入：严格相对于历史记录末尾倒数
            // 找到最后一条历史消息的索引
            let lastHistoryIndex = -1;
            for (let i = context.messages.length - 1; i >= 0; i--) {
              if (context.messages[i].sourceType === 'session_history') {
                lastHistoryIndex = i;
                break;
              }
            }

            // 如果没有历史记录，则默认放在最后
            if (lastHistoryIndex === -1) {
              context.messages.push(message);
            } else {
              // 深度为 0 表示最后一条历史消息之后，深度为 1 表示最后一条之前
              // 这与酒馆逻辑保持一致：插入位置 = (最后一条历史索引 + 1) - depth
              const targetIndex = Math.max(0, (lastHistoryIndex + 1) - (entry.depth ?? 0));
              context.messages.splice(targetIndex, 0, message);
            }
          }
          break;
        case STWorldbookPosition.Outlet:
          // Outlet 模式不直接注入消息列表，仅保留在 sharedData 中供宏处理器使用
          break;
        default:
          context.messages.splice(historyAnchor, 0, message);
      }

    }
  }
}

export const worldbookProcessor = new WorldbookProcessor();