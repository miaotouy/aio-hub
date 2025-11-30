<template>
  <div class="macro-debug-view">
    <el-alert v-if="!hasMacros" title="未检测到宏" type="info" :closable="false" show-icon>
      此消息中没有使用任何宏表达式
    </el-alert>

    <div v-else class="macro-debug-content">
      <!-- 宏统计信息 -->
      <div class="macro-stats">
        <InfoCard title="宏执行统计">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="执行的宏数量">
              {{ macroResult?.macroCount || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="是否包含宏">
              <el-tag :type="macroResult?.hasMacros ? 'success' : 'info'">
                {{ macroResult?.hasMacros ? "是" : "否" }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </InfoCard>
      </div>

      <!-- 各阶段输出 -->
      <div v-if="macroResult?.phaseOutputs" class="phase-outputs">
        <InfoCard>
          <template #header>
            <div class="card-header">
              <span>三阶段处理过程</span>
              <el-tooltip content="展示宏处理的三个阶段：预处理、替换、后处理" placement="top">
                <el-icon><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
          </template>

          <el-collapse v-model="activePhases" accordion>
            <!-- 原始输入 -->
            <el-collapse-item name="original">
              <template #title>
                <div class="phase-title">
                  <el-tag type="info" size="small">原始输入</el-tag>
                  <span class="phase-name">Original</span>
                </div>
              </template>
              <div class="phase-content">
                <pre>{{ macroResult.phaseOutputs.original }}</pre>
              </div>
            </el-collapse-item>

            <!-- 阶段一：预处理 -->
            <el-collapse-item name="preprocess">
              <template #title>
                <div class="phase-title">
                  <el-tag type="warning" size="small">阶段一</el-tag>
                  <span class="phase-name">预处理（Pre-Process）</span>
                  <span class="phase-desc">处理状态变更宏（setvar, incvar 等）</span>
                </div>
              </template>
              <div class="phase-content">
                <pre>{{ macroResult.phaseOutputs.afterPreProcess }}</pre>
              </div>
            </el-collapse-item>

            <!-- 阶段二：替换 -->
            <el-collapse-item name="substitute">
              <template #title>
                <div class="phase-title">
                  <el-tag type="primary" size="small">阶段二</el-tag>
                  <span class="phase-name">替换（Substitute）</span>
                  <span class="phase-desc">替换静态值（user, char 等）</span>
                </div>
              </template>
              <div class="phase-content">
                <pre>{{ macroResult.phaseOutputs.afterSubstitute }}</pre>
              </div>
            </el-collapse-item>

            <!-- 阶段三：后处理 -->
            <el-collapse-item name="postprocess">
              <template #title>
                <div class="phase-title">
                  <el-tag type="success" size="small">阶段三</el-tag>
                  <span class="phase-name">后处理（Post-Process）</span>
                  <span class="phase-desc">执行动态函数（time, random 等）</span>
                </div>
              </template>
              <div class="phase-content">
                <pre>{{ macroResult.phaseOutputs.afterPostProcess }}</pre>
              </div>
            </el-collapse-item>
          </el-collapse>
        </InfoCard>
      </div>

      <!-- 检测到的宏列表 -->
      <div v-if="detectedMacros.length > 0" class="detected-macros">
        <InfoCard title="检测到的宏">
          <el-table :data="detectedMacros" stripe>
            <el-table-column prop="name" label="宏名称" width="150" />
            <el-table-column label="参数" min-width="200">
              <template #default="{ row }">
                <el-tag
                  v-for="(arg, index) in row.args"
                  :key="index"
                  size="small"
                  style="margin-right: 4px"
                >
                  {{ arg }}
                </el-tag>
                <span v-if="!row.args || row.args.length === 0" class="no-args">无参数</span>
              </template>
            </el-table-column>
            <el-table-column prop="fullMatch" label="完整表达式" min-width="200" />
          </el-table>
        </InfoCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import InfoCard from "@/components/common/InfoCard.vue";
import { QuestionFilled } from "@element-plus/icons-vue";
import { MacroProcessor } from "../../macro-engine";
import { createMacroContext } from "../../macro-engine/MacroContext";
import type { MacroProcessResult } from "../../macro-engine";
import type { ContextPreviewData } from "../../composables/useChatContextBuilder";
import { useAgentStore } from "../../agentStore";

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

const activePhases = ref<string>("original");
const macroResult = ref<MacroProcessResult | null>(null);
const agentStore = useAgentStore();

// 从 contextData 中提取所有原始文本（包含宏的）
const combinedOriginalText = computed(() => {
  if (!props.contextData) return "";

  const texts: string[] = [];

  // 1. 预设消息
  props.contextData.presetMessages.forEach((msg) => {
    // 优先使用 originalContent，如果没有则使用 content
    // 注意：ContextPreviewData 类型定义中可能还没有 originalContent（如果未更新类型定义），
    // 但我们已经在 useChatContextBuilder 中添加了它。这里使用类型断言或可选链。
    const raw = (msg as any).originalContent || msg.content;
    if (raw) texts.push(raw);
  });

  // 2. 历史消息（通常不包含宏，但为了完整性也检查一下）
  // 历史消息一般已经是处理过的，或者用户输入本身就包含宏但已经被处理并存储了。
  // 在预览中，我们主要关注预设消息中的宏。

  return texts.join("\n");
});

// 检测原始消息中的宏
const detectedMacros = computed(() => {
  if (!combinedOriginalText.value) return [];
  return MacroProcessor.extractMacros(combinedOriginalText.value);
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
    // 尝试从 store 获取完整的 agent 对象
    const agentId = newData.agentInfo.id;
    const agent = agentStore.getAgentById(agentId);

    const context = createMacroContext({
      userName: "User", // 这里简化处理，实际应该从 userProfile 获取
      charName: newData.agentInfo.name || "Assistant",
      agent: agent || undefined,
      timestamp: newData.targetTimestamp,
      // 注意：这里缺少 session 对象，某些依赖 session 的宏（如记忆相关）可能无法正确执行
      // 但对于大多数文本替换宏来说已经足够了
    });

    // 如果有参数覆盖，注入到变量中
    if (newData.parameters) {
      Object.entries(newData.parameters).forEach(([key, value]) => {
        if (typeof value === "string" || typeof value === "number") {
          context.variables.set(key, value);
        }
      });
    }

    // 执行宏处理（开启调试模式）
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

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header span {
  font-weight: 600;
}

.phase-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.phase-name {
  font-weight: 500;
}

.phase-desc {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: auto;
}

.phase-content {
  padding: 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
}

.phase-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
}

.no-args {
  color: var(--el-text-color-secondary);
  font-style: italic;
}
</style>
