<template>
  <div class="macro-debug-view">
    <el-alert v-if="!hasMacros" title="未检测到宏" type="info" :closable="false" show-icon>
      此消息中没有使用任何宏表达式
    </el-alert>

    <div v-else class="macro-debug-content">
      <!-- 宏统计信息 -->
      <div class="macro-stats">
        <InfoCard title="宏执行概览">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="宏总数">
              {{ macroResult?.macroCount || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="去重后数量">
              {{ uniqueDetectedMacros.length }}
            </el-descriptions-item>
          </el-descriptions>
        </InfoCard>
      </div>

      <!-- 检测到的宏列表 (优化版) -->
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

            <el-table-column prop="count" label="次数" width="70" align="center" />

            <el-table-column label="完整表达式" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <code class="macro-code">{{ row.fullMatch }}</code>
              </template>
            </el-table-column>
          </el-table>
        </InfoCard>
      </div>

      <!-- 处理过程展示 (优化版) -->
      <div v-if="macroResult?.phaseOutputs" class="phase-outputs">
        <InfoCard title="处理流水线">
          <template #header-extra>
            <el-switch
              v-model="showOriginal"
              active-text="显示原文"
              inline-prompt
              style="margin-left: 12px"
            />
          </template>

          <div v-if="showOriginal" class="original-preview mb-4">
            <div class="phase-label">原始输入 (Original)</div>
            <div class="phase-content">
              <pre>{{ macroResult.phaseOutputs.original }}</pre>
            </div>
          </div>

          <el-steps
            :active="activeStep"
            finish-status="success"
            process-status="success"
            simple
            style="margin-bottom: 16px"
          >
            <el-step title="预处理" @click="activeStep = 0" class="cursor-pointer" />
            <el-step title="替换" @click="activeStep = 1" class="cursor-pointer" />
            <el-step title="后处理" @click="activeStep = 2" class="cursor-pointer" />
          </el-steps>

          <div class="step-content">
            <div v-if="activeStep === 0">
              <div class="phase-header">
                <span class="phase-title">阶段一：预处理 (Pre-Process)</span>
                <span class="phase-desc">处理 setvar, incvar 等状态变更宏</span>
              </div>
              <div class="phase-content">
                <pre>{{ macroResult.phaseOutputs.afterPreProcess }}</pre>
              </div>
            </div>
            <div v-if="activeStep === 1">
              <div class="phase-header">
                <span class="phase-title">阶段二：替换 (Substitute)</span>
                <span class="phase-desc">替换 user, char 等静态变量</span>
              </div>
              <div class="phase-content">
                <pre>{{ macroResult.phaseOutputs.afterSubstitute }}</pre>
              </div>
            </div>
            <div v-if="activeStep === 2">
              <div class="phase-header">
                <span class="phase-title">阶段三：后处理 (Post-Process)</span>
                <span class="phase-desc">执行 time, random 等动态函数</span>
              </div>
              <div class="phase-content">
                <pre>{{ macroResult.phaseOutputs.afterPostProcess }}</pre>
              </div>
            </div>
          </div>
        </InfoCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from "vue";
import InfoCard from "@/components/common/InfoCard.vue";
import { Loading } from "@element-plus/icons-vue";
import { MacroProcessor, MacroRegistry } from "../../macro-engine";
import { createMacroContext } from "../../macro-engine/MacroContext";
import type { MacroProcessResult } from "../../macro-engine";
import type { ContextPreviewData } from "../../composables/useChatContextBuilder";
import { useAgentStore } from "../../agentStore";

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

const activeStep = ref(2); // 默认显示最后一步（后处理结果）
const showOriginal = ref(false); // 默认折叠原文
const macroResult = ref<MacroProcessResult | null>(null);
const macroPreviews = reactive<Record<string, string>>({}); // 存储宏预览值
const agentStore = useAgentStore();

// 从 contextData 中提取所有原始文本（包含宏的）
const combinedOriginalText = computed(() => {
  if (!props.contextData) return "";

  const texts: string[] = [];

  // 1. 预设消息
  props.contextData.presetMessages.forEach((msg) => {
    const raw = (msg as any).originalContent || msg.content;
    if (raw) texts.push(raw);
  });

  return texts.join("\n");
});

// 检测原始消息中的宏
const detectedMacros = computed(() => {
  if (!combinedOriginalText.value) return [];
  return MacroProcessor.extractMacros(combinedOriginalText.value);
});

// 去重并统计宏
const uniqueDetectedMacros = computed(() => {
  const macros = detectedMacros.value;
  const map = new Map<string, { name: string; args: string[]; fullMatch: string; count: number }>();

  macros.forEach((m) => {
    // 使用 fullMatch 作为唯一标识
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

// 是否包含宏
const hasMacros = computed(() => detectedMacros.value.length > 0);

// 当上下文数据变化时，重新处理宏
watch(
  () => props.contextData,
  async (newData) => {
    if (!newData || !hasMacros.value) {
      macroResult.value = null;
      return;
    }

    // 构建宏上下文
    const agentId = newData.agentInfo.id;
    const agent = agentStore.getAgentById(agentId);

    const context = createMacroContext({
      userName: "User",
      charName: newData.agentInfo.name || "Assistant",
      agent: agent || undefined,
      timestamp: newData.targetTimestamp,
    });

    // 如果有参数覆盖，注入到变量中
    if (newData.parameters) {
      Object.entries(newData.parameters).forEach(([key, value]) => {
        if (typeof value === "string" || typeof value === "number") {
          context.variables.set(key, value);
        }
      });
    }

    // 1. 执行宏处理（开启调试模式）
    const processor = new MacroProcessor();
    try {
      macroResult.value = await processor.process(combinedOriginalText.value, context, {
        debug: true,
      });
    } catch (error) {
      console.error("宏处理预览失败:", error);
      // 降级显示
      macroResult.value = {
        output: combinedOriginalText.value,
        hasMacros: true,
        macroCount: detectedMacros.value.length,
        phaseOutputs: {
          original: combinedOriginalText.value,
          afterPreProcess: "处理出错",
          afterSubstitute: "处理出错",
          afterPostProcess: "处理出错",
        },
      };
    }

    // 2. 计算每个宏的预览值
    // 清空旧预览
    Object.keys(macroPreviews).forEach((key) => delete macroPreviews[key]);

    const registry = MacroRegistry.getInstance();
    for (const macro of uniqueDetectedMacros.value) {
      const def = registry.getMacro(macro.name);
      if (def) {
        try {
          const result = await def.execute(context, macro.args);
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

.original-preview {
  margin-bottom: 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  padding: 12px;
  background-color: var(--el-fill-color-lighter);
}

.phase-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  font-weight: 600;
}

.cursor-pointer {
  cursor: pointer;
}

.phase-header {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.phase-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.phase-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.phase-content {
  padding: 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter);
}

.phase-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.no-args {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

:deep(.el-step.is-process .el-step__title) {
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 4px;
}
</style>
