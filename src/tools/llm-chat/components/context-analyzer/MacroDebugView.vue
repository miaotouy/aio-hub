<template>
  <div class="macro-debug-view">
    <el-alert v-if="!hasMacros" title="未检测到宏" type="info" :closable="false" show-icon>
      此消息中没有使用任何宏表达式
    </el-alert>

    <div v-else class="macro-debug-content">
      <!-- 宏统计信息 -->
      <div class="macro-stats">
        <InfoCard title="宏执行概览">
          <el-descriptions :column="2" :border="true" size="small">
            <el-descriptions-item label="宏总数">
              {{ macroResult?.macroCount || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="去重后数量">
              {{ uniqueDetectedMacros.length }}
            </el-descriptions-item>
          </el-descriptions>
        </InfoCard>
      </div>

      <!-- 检测到的宏列表 -->
      <div v-if="uniqueDetectedMacros.length > 0" class="detected-macros">
        <InfoCard title="检测到的宏">
          <el-table :data="uniqueDetectedMacros" stripe size="small">
            <el-table-column prop="name" label="宏名称" width="120">
              <template #default="{ row }">
                <el-tag effect="plain">{{ row.name }}</el-tag>
              </template>
            </el-table-column>

            <el-table-column label="参数" min-width="120">
              <template #default="{ row }">
                <div v-if="row.args && row.args.length > 0" class="args-list">
                  <el-tag
                    v-for="(arg, index) in row.args"
                    :key="index"
                    size="small"
                    type="info"
                    effect="light"
                  >
                    {{ arg }}
                  </el-tag>
                </div>
                <span v-else class="no-args">-</span>
              </template>
            </el-table-column>

            <el-table-column label="预览值" min-width="150">
              <template #default="{ row }">
                <span v-if="macroPreviews[row.fullMatch]" class="preview-value">
                  {{ macroPreviews[row.fullMatch] }}
                </span>
                <span v-else class="preview-loading">
                  <el-icon class="is-loading"><Loading /></el-icon>
                </span>
              </template>
            </el-table-column>

            <el-table-column prop="count" label="次数" width="70" :align="'center'" />

            <el-table-column label="完整表达式" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <code class="macro-code">{{ row.fullMatch }}</code>
              </template>
            </el-table-column>
          </el-table>
        </InfoCard>
      </div>

      <!-- 宏替换差异视图 -->
      <div v-if="messageResults.length > 0" class="macro-diff-view">
        <InfoCard title="宏替换结果对比">
          <template #header-extra>
            <div class="diff-controls">
              <el-button link type="primary" size="small" @click="toggleAllContext">
                {{ allContextExpanded ? "收起未变行" : "展开全部" }}
              </el-button>
            </div>
          </template>

          <div class="messages-diff-list">
            <el-collapse v-model="activeMessageNames">
              <el-collapse-item
                v-for="(msgResult, msgIndex) in messageResults"
                :key="msgIndex"
                :name="msgIndex"
                :disabled="!msgResult.hasChanges && !msgResult.hasMacros"
              >
                <template #title>
                  <div class="message-diff-header">
                    <span class="role-tag" :class="msgResult.role">{{
                      msgResult.role.toUpperCase()
                    }}</span>
                    <span class="diff-status">
                      <el-tag v-if="msgResult.hasChanges" size="small" type="warning" effect="plain"
                        >已修改</el-tag
                      >
                      <el-tag
                        v-else-if="msgResult.hasMacros"
                        size="small"
                        type="info"
                        effect="plain"
                        >含宏 (未变)</el-tag
                      >
                      <span v-else class="no-change-text">无宏且无变化</span>
                    </span>
                  </div>
                </template>

                <div class="diff-container">
                  <div v-for="(hunk, index) in msgResult.diffHunks" :key="index" class="diff-hunk">
                    <!-- 差异块头部（折叠的上下文） -->
                    <div
                      v-if="hunk.isCollapsed"
                      class="hunk-divider"
                      @click.stop="expandHunk(msgIndex, index)"
                    >
                      <el-icon><MoreFilled /></el-icon>
                      <span>展开 {{ hunk.lines.length }} 行未变化内容</span>
                    </div>

                    <!-- 差异块内容 -->
                    <div v-else class="hunk-content">
                      <div
                        v-for="(line, lineIndex) in hunk.lines"
                        :key="lineIndex"
                        class="diff-line"
                        :class="{
                          'is-added': line.type === 'add',
                          'is-removed': line.type === 'remove',
                          'is-context': line.type === 'context',
                        }"
                      >
                        <div class="line-number">
                          <span v-if="line.oldLineNo">{{ line.oldLineNo }}</span>
                          <span v-else>&nbsp;</span>
                        </div>
                        <div class="line-number">
                          <span v-if="line.newLineNo">{{ line.newLineNo }}</span>
                          <span v-else>&nbsp;</span>
                        </div>
                        <div class="line-content">
                          <template v-if="line.parts">
                            <span
                              v-for="(part, pIndex) in line.parts"
                              :key="pIndex"
                              :class="{
                                'word-added': part.added,
                                'word-removed': part.removed,
                              }"
                              >{{ part.value }}</span
                            >
                          </template>
                          <template v-else>
                            {{ line.content }}
                          </template>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="msgResult.diffHunks.length === 0" class="no-changes">内容无变化</div>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </InfoCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from "vue";
import InfoCard from "@/components/common/InfoCard.vue";
import { Loading, MoreFilled } from "@element-plus/icons-vue";
import { MacroProcessor, MacroRegistry } from "../../macro-engine";
import { createMacroContext } from "../../macro-engine/MacroContext";
import type { MacroProcessResult } from "../../macro-engine";
import type { ContextPreviewData } from "../../composables/useChatContextBuilder";
import { useAgentStore } from "../../agentStore";
import { diffLines, diffWordsWithSpace, type Change } from "diff";

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

const macroResult = ref<MacroProcessResult | null>(null);
const macroPreviews = reactive<Record<string, string>>({});
const agentStore = useAgentStore();

// Diff 状态
interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
  parts?: Change[]; // 用于词级差异
}

interface DiffHunk {
  lines: DiffLine[];
  isCollapsed: boolean;
  isChangeHunk: boolean; // 如果此块包含更改则为 True
  hasMacro: boolean; // 如果此块包含宏（即使未更改）则为 True
}

interface MessageDiffResult {
  role: string;
  original: string;
  modified: string;
  diffHunks: DiffHunk[];
  hasChanges: boolean;
  hasMacros: boolean;
}

const messageResults = ref<MessageDiffResult[]>([]);
const activeMessageNames = ref<number[]>([]);
const allContextExpanded = ref(false);

// 从 contextData 中提取所有原始文本 (仅用于宏统计)
const combinedOriginalText = computed(() => {
  if (!props.contextData) return "";
  const texts: string[] = [];
  props.contextData.presetMessages.forEach((msg) => {
    const raw = (msg as any).originalContent || msg.content;
    if (raw) texts.push(raw);
  });
  return texts.join("\n");
});

// 检测原始消息中的宏 (仅用于统计)
const detectedMacros = computed(() => {
  if (!combinedOriginalText.value) return [];
  return MacroProcessor.extractMacros(combinedOriginalText.value);
});

// 去重并统计宏
const uniqueDetectedMacros = computed(() => {
  const macros = detectedMacros.value;
  const map = new Map<string, { name: string; args: string[]; fullMatch: string; count: number }>();

  macros.forEach((m) => {
    if (map.has(m.fullMatch)) {
      map.get(m.fullMatch)!.count++;
    } else {
      map.set(m.fullMatch, {
        name: m.name,
        args: m.args || [],
        fullMatch: m.fullMatch,
        count: 1,
      });
    }
  });

  return Array.from(map.values());
});

const hasMacros = computed(() => detectedMacros.value.length > 0);

// 检查字符串是否包含宏模式的辅助函数
const containsMacro = (text: string) => /\{\{.*?\}\}/.test(text);

// 计算差异 (纯函数)
const getDiffHunks = (original: string, modified: string): DiffHunk[] => {
  const linesDiff = diffLines(original, modified);
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffLine[] = [];
  let oldLineCount = 1;
  let newLineCount = 1;
  let currentHunkHasChange = false;
  let currentHunkHasMacro = false;

  // 推送当前块的辅助函数
  const pushHunk = () => {
    if (currentHunk.length > 0) {
      const shouldExpand = currentHunkHasChange || currentHunkHasMacro;

      hunks.push({
        lines: [...currentHunk],
        isCollapsed: !shouldExpand,
        isChangeHunk: currentHunkHasChange,
        hasMacro: currentHunkHasMacro,
      });
      currentHunk = [];
      currentHunkHasChange = false;
      currentHunkHasMacro = false;
    }
  };

  const rawOps: { type: "add" | "remove" | "common"; lines: string[] }[] = linesDiff
    .map((part) => {
      let lines = part.value.split("\n");
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }
      return {
        type: (part.added ? "add" : part.removed ? "remove" : "common") as
          | "add"
          | "remove"
          | "common",
        lines: lines,
      };
    })
    .filter((op) => op.lines.length > 0);

  let i = 0;
  while (i < rawOps.length) {
    const op = rawOps[i];

    if (op.type === "common") {
      pushHunk(); // 关闭上一个块

      op.lines.forEach((line) => {
        if (containsMacro(line)) currentHunkHasMacro = true;
        currentHunk.push({
          type: "context",
          content: line,
          oldLineNo: oldLineCount++,
          newLineNo: newLineCount++,
        });
      });
      pushHunk(); // 关闭此上下文块
      i++;
    } else {
      // 检测到更改
      currentHunkHasChange = true;

      // 检查替换块（删除后紧跟添加）
      const nextOp = rawOps[i + 1];

      if (op.type === "remove" && nextOp && nextOp.type === "add") {
        const removeLines = op.lines;
        const addLines = nextOp.lines;
        const maxLen = Math.max(removeLines.length, addLines.length);

        for (let k = 0; k < maxLen; k++) {
          const remLine = removeLines[k];
          const addLine = addLines[k];

          if (remLine !== undefined && addLine !== undefined) {
            // 检查行是否实际上相同（diffLines 可能过于激进或者是空白差异）
            if (remLine === addLine) {
              if (containsMacro(remLine)) currentHunkHasMacro = true;
              currentHunk.push({
                type: "context",
                content: remLine,
                oldLineNo: oldLineCount++,
                newLineNo: newLineCount++,
              });
            } else {
              // 实际差异 -> 词级差异
              if (containsMacro(remLine)) currentHunkHasMacro = true;

              const wordDiff = diffWordsWithSpace(remLine, addLine);

              // 对于旧行：显示公共部分 + 删除部分（过滤掉添加部分）
              currentHunk.push({
                type: "remove",
                content: remLine,
                oldLineNo: oldLineCount++,
                parts: wordDiff.filter((p) => !p.added),
              });

              // 对于新行：显示公共部分 + 添加部分（过滤掉删除部分）
              currentHunk.push({
                type: "add",
                content: addLine,
                newLineNo: newLineCount++,
                parts: wordDiff.filter((p) => !p.removed),
              });
            }
          } else if (remLine !== undefined) {
            if (containsMacro(remLine)) currentHunkHasMacro = true;
            currentHunk.push({
              type: "remove",
              content: remLine,
              oldLineNo: oldLineCount++,
            });
          } else if (addLine !== undefined) {
            currentHunk.push({
              type: "add",
              content: addLine,
              newLineNo: newLineCount++,
            });
          }
        }
        i += 2;
      } else {
        // 单个块（仅添加或删除）
        op.lines.forEach((line) => {
          if (op.type === "remove") {
            if (containsMacro(line)) currentHunkHasMacro = true;
            currentHunk.push({
              type: "remove",
              content: line,
              oldLineNo: oldLineCount++,
            });
          } else {
            currentHunk.push({
              type: "add",
              content: line,
              newLineNo: newLineCount++,
            });
          }
        });
        i++;
      }
    }
  }
  pushHunk(); // 刷新最后一块

  return hunks;
};

const toggleAllContext = () => {
  allContextExpanded.value = !allContextExpanded.value;
  messageResults.value.forEach((msg) => {
    msg.diffHunks.forEach((h) => {
      h.isCollapsed = !allContextExpanded.value;
    });
  });
};

const expandHunk = (msgIndex: number, hunkIndex: number) => {
  const msg = messageResults.value[msgIndex];
  if (msg && msg.diffHunks[hunkIndex]) {
    msg.diffHunks[hunkIndex].isCollapsed = false;
  }
};

watch(
  () => props.contextData,
  async (newData) => {
    if (!newData || !hasMacros.value) {
      macroResult.value = null;
      messageResults.value = [];
      activeMessageNames.value = [];
      return;
    }

    const agentId = newData.agentInfo.id;
    const agent = agentStore.getAgentById(agentId);

    // 基础上下文，用于宏预览等
    const baseContext = createMacroContext({
      userName: newData.userInfo?.name || "User",
      charName: agent?.name || newData.agentInfo.name || "Assistant",
      agent: agent || undefined,
      timestamp: newData.targetTimestamp,
    });

    if (newData.parameters) {
      Object.entries(newData.parameters).forEach(([key, value]) => {
        if (typeof value === "string" || typeof value === "number") {
          baseContext.variables.set(key, value);
        }
      });
    }

    const processor = new MacroProcessor();
    const results: MessageDiffResult[] = [];
    const activeNames: number[] = [];
    let totalMacroCount = 0;

    try {
      // 分别处理每条消息
      for (let i = 0; i < newData.presetMessages.length; i++) {
        const msg = newData.presetMessages[i];
        const original = (msg as any).originalContent || msg.content || "";

        // 如果消息为空，跳过
        if (!original.trim()) {
          continue;
        }

        // 为每条消息创建特定的上下文，确保时间戳和角色名称正确
        // 注意：presetMessages 没有节点时间戳，所以回退到 targetTimestamp
        const messageTimestamp = (msg as any).timestamp || newData.targetTimestamp;
        const messageContext = createMacroContext({
          userName: baseContext.userName,
          charName: baseContext.charName,
          agent: baseContext.agent,
          userProfile: baseContext.userProfileObj,
          timestamp: messageTimestamp,
        });

        const processResult = await processor.process(original, messageContext, {
          debug: true,
        });

        const modified = processResult.phaseOutputs?.afterPostProcess || original;
        const hunks = getDiffHunks(original, modified);
        const hasChanges = original !== modified;
        const hasMacros = containsMacro(original);

        if (hasChanges) {
          activeNames.push(i);
        }

        results.push({
          role: msg.role,
          original,
          modified,
          diffHunks: hunks,
          hasChanges,
          hasMacros,
        });

        // 累加统计信息
        if (processResult) {
          totalMacroCount += processResult.macroCount;
        }
      }

      messageResults.value = results;
      activeMessageNames.value = activeNames;

      // 构造一个伪造的 macroResult 用于顶部统计
      // 注意：这里我们尽可能保持 macroResult 的结构以兼容现有代码
      // 但实际上我们更关心的是 macroCount
      macroResult.value = {
        output: "", // 仅用于占位，不再重要
        hasMacros: totalMacroCount > 0,
        macroCount: totalMacroCount,
        phaseOutputs: {
          original: combinedOriginalText.value,
          afterPreProcess: "",
          afterSubstitute: "",
          afterPostProcess: "",
        },
      };
    } catch (error) {
      console.error("宏处理预览失败:", error);
      macroResult.value = null;
      messageResults.value = [];
    }

    // 预览 (保持不变，基于 detectedMacros)
    Object.keys(macroPreviews).forEach((key) => delete macroPreviews[key]);
    const registry = MacroRegistry.getInstance();
    for (const macro of uniqueDetectedMacros.value) {
      const def = registry.getMacro(macro.name);
      if (def) {
        try {
          // 宏预览也使用基础上下文
          const result = await def.execute(baseContext, macro.args);
          macroPreviews[macro.fullMatch] = result;
        } catch (e) {
          macroPreviews[macro.fullMatch] = "(执行错误)";
        }
      } else {
        macroPreviews[macro.fullMatch] = "(未知宏)";
      }
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.macro-debug-view {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
}

.macro-debug-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.args-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.macro-code {
  background-color: var(--el-fill-color-light);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  color: var(--el-color-primary);
}

.preview-value {
  color: var(--el-color-success);
  font-family: monospace;
  font-weight: 600;
}

.preview-loading {
  color: var(--el-text-color-secondary);
}

.no-args {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

/* Diff 样式 */
.diff-container {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.diff-hunk {
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.diff-hunk:last-child {
  border-bottom: none;
}

.hunk-divider {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  padding: 4px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  user-select: none;
}
.hunk-divider:hover {
  background-color: var(--el-fill-color);
  color: var(--el-color-primary);
}

.diff-line {
  display: flex;
  line-height: 20px;
}

.line-number {
  width: 40px;
  text-align: right;
  padding-right: 8px;
  color: var(--el-text-color-placeholder);
  background-color: var(--el-fill-color-lighter);
  border-right: 1px solid var(--el-border-color-lighter);
  user-select: none;
  flex-shrink: 0;
}

.line-content {
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-all;
  flex-grow: 1;
}

/* 颜色 */
.is-added {
  background-color: var(--el-color-success-light-9);
}
.is-added .line-number {
  background-color: var(--el-color-success-light-8);
  color: var(--el-color-success-dark-2);
}

.is-removed {
  background-color: var(--el-color-danger-light-9);
}
.is-removed .line-number {
  background-color: var(--el-color-danger-light-8);
  color: var(--el-color-danger-dark-2);
}

.is-context {
  color: var(--el-text-color-regular);
}

/* 词级高亮 */
.word-added {
  background-color: var(--el-color-success-light-5);
  border-radius: 2px;
}

.word-removed {
  background-color: var(--el-color-danger-light-5);
  text-decoration: line-through;
  border-radius: 2px;
}

.no-changes {
  padding: 20px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>
