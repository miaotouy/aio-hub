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
  private recurseBuffer: string[] = [];
  private personaDescription: string = '';
  private characterDescription: string = '';

  constructor(messages: string[], globalData: { persona?: string; charDef?: string }) {
    this.depthBuffer = messages;
    this.personaDescription = globalData.persona || '';
    this.characterDescription = globalData.charDef || '';
  }

  addRecurse(text: string) {
    this.recurseBuffer.push(text);
  }

  getScanText(entry: STWorldbookEntry, defaultDepth: number): string {
    const scanDepth = entry.scanDepth ?? defaultDepth;
    const messages = this.depthBuffer.slice(0, scanDepth);
    
    let parts = [...messages];
    
    if (entry.matchPersonaDescription && this.personaDescription) {
      parts.push(this.personaDescription);
    }
    if (entry.matchCharacterDescription && this.characterDescription) {
      parts.push(this.characterDescription);
    }
    
    parts.push(...this.recurseBuffer);
    
    return '\x01' + parts.join('\n\x01');
  }

  matchKeys(haystack: string, needle: string, entry: STWorldbookEntry): boolean {
    const regexMatch = needle.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
      try {
        const re = new RegExp(regexMatch[1], regexMatch[2]);
        return re.test(haystack);
      } catch (e) {
        return false;
      }
    }

    const caseSensitive = entry.caseSensitive ?? false;
    const h = caseSensitive ? haystack : haystack.toLowerCase();
    const n = caseSensitive ? needle : needle.toLowerCase();

    if (entry.matchWholeWords) {
      const escaped = n.replace(/[.*+?^${}()[\]\\|]/g, '\\$&');
      const re = new RegExp(`(?:^|\\W)(${escaped})(?:$|\\W)`);
      return re.test(h);
    }

    return h.includes(n);
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

    const charDef = agentConfig.presetMessages?.find(m => m.role === 'system')?.content || '';

    const buffer = new WorldbookBuffer(historyTexts, {
      persona: agentConfig.description,
      charDef: typeof charDef === 'string' ? charDef : ''
    });

    const activatedEntries = new Map<string, STWorldbookEntry>();
    let scanState: 'INITIAL' | 'RECURSION' | 'DONE' = 'INITIAL';
    let loopCount = 0;
    let currentTokenBudget = 0;
    const MAX_TOKENS = 1000; 

    while (scanState !== 'DONE' && loopCount < 10) {
      loopCount++;
      let newlyActivatedInThisLoop: { entry: STWorldbookEntry, bookName: string }[] = [];
      const candidates = allEntries.filter(item => !item.entry.disable && !activatedEntries.has(String(item.entry.uid)));

      for (const item of candidates) {
        const { entry } = item;
        if (this.checkActivation(entry, buffer)) {
          if (entry.useProbability && entry.probability < 100) {
            if (Math.random() * 100 > entry.probability) continue;
          }
          newlyActivatedInThisLoop.push(item);
        }
      }

      // 处理组竞争
      const winners = this.filterInclusionGroups(
        newlyActivatedInThisLoop.map(i => i.entry),
        activatedEntries
      );
      
      if (winners.length > 0) {
        for (const entry of winners) {
          const entryTokens = Math.ceil(entry.content.length / 4);
          if (!entry.ignoreBudget && (currentTokenBudget + entryTokens > MAX_TOKENS)) {
            continue;
          }

          activatedEntries.set(String(entry.uid), entry);
          currentTokenBudget += entryTokens;
          if (!entry.preventRecursion) {
            buffer.addRecurse(entry.content);
          }
        }
        scanState = 'RECURSION';
      } else {
        scanState = 'DONE';
      }
    }

    if (activatedEntries.size === 0) return;

    const matchedEntries: MatchedWorldbookEntry[] = Array.from(activatedEntries.values()).map(entry => {
      const sourceInfo = allEntries.find(i => i.entry.uid === entry.uid);
      return {
        raw: entry,
        worldbookName: sourceInfo?.bookName || 'Unknown',
        matchedKeys: []
      };
    });

    context.sharedData.set('activatedWorldbookEntries', matchedEntries);
    this.injectEntries(context, matchedEntries);

    context.logs.push({
      processorId: this.id,
      level: 'info',
      message: `激活了 ${matchedEntries.length} 条世界书条目 (Budget: ${currentTokenBudget} tokens)`,
      details: { uids: matchedEntries.map(m => m.raw.uid) }
    });
    
    logger.debug('世界书处理完成', { activatedCount: matchedEntries.length, tokens: currentTokenBudget });
  }

  private checkActivation(entry: STWorldbookEntry, buffer: WorldbookBuffer): boolean {
    if (entry.constant) return true;
    const scanText = buffer.getScanText(entry, 2); 
    const primaryMatch = entry.key.some(k => buffer.matchKeys(scanText, k, entry));
    if (!primaryMatch) return false;

    if (entry.selective && entry.keysecondary && entry.keysecondary.length > 0) {
      const secondaryMatches = entry.keysecondary.map(k => buffer.matchKeys(scanText, k, entry));
      const matchCount = secondaryMatches.filter(Boolean).length;

      switch (entry.selectiveLogic) {
        case STWorldbookLogic.AND_ANY: return matchCount > 0;
        case STWorldbookLogic.AND_ALL: return matchCount === entry.keysecondary.length;
        case STWorldbookLogic.NOT_ANY: return matchCount === 0;
        case STWorldbookLogic.NOT_ALL: return matchCount < entry.keysecondary.length;
        default: return matchCount > 0;
      }
    }
    return true;
  }

  private filterInclusionGroups(newlyActivated: STWorldbookEntry[], alreadyActivated: Map<string, STWorldbookEntry>): STWorldbookEntry[] {
    const groups = new Map<string, STWorldbookEntry[]>();
    const nonGrouped: STWorldbookEntry[] = [];

    for (const entry of newlyActivated) {
      if (entry.group) {
        const groupNames = entry.group.split(/,\s*/).filter(Boolean);
        groupNames.forEach(gn => {
          if (!groups.has(gn)) groups.set(gn, []);
          groups.get(gn)!.push(entry);
        });
      } else {
        nonGrouped.push(entry);
      }
    }

    const winners = new Set<STWorldbookEntry>(nonGrouped);

    for (const [groupName, members] of groups) {
      const isGroupAlreadyActive = Array.from(alreadyActivated.values()).some(e => e.group?.includes(groupName));
      if (isGroupAlreadyActive) continue;

      const overrideWinner = members.find(m => m.groupOverride);
      if (overrideWinner) {
        winners.add(overrideWinner);
        continue;
      }

      const totalWeight = members.reduce((sum, m) => sum + (m.groupWeight ?? 100), 0);
      let roll = Math.random() * totalWeight;
      for (const member of members) {
        roll -= (member.groupWeight ?? 100);
        if (roll <= 0) {
          winners.add(member);
          break;
        }
      }
    }

    return Array.from(winners);
  }

  private injectEntries(context: PipelineContext, matched: MatchedWorldbookEntry[]) {
    const sorted = [...matched].sort((a, b) => b.raw.order - a.raw.order);

    for (const item of sorted) {
      const entry = item.raw;
      const message: ProcessableMessage = {
        role: 'system',
        content: entry.content,
        sourceType: entry.position === STWorldbookPosition.Depth ? 'depth_injection' : 'anchor_injection',
        sourceId: entry.uid,
      };

      switch (entry.position) {
        case STWorldbookPosition.BeforeChar:
          context.messages.unshift(message);
          break;
        case STWorldbookPosition.AfterChar:
          context.messages.splice(1, 0, message);
          break;
        case STWorldbookPosition.Depth:
          const targetIndex = Math.max(0, context.messages.length - (entry.depth ?? 0));
          context.messages.splice(targetIndex, 0, message);
          break;
        default:
          context.messages.unshift(message);
          break;
      }
    }
  }
}

export const worldbookProcessor = new WorldbookProcessor();