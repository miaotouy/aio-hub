<template>
  <div class="macro-debug-view">
    <el-alert
      v-if="!hasMacros"
      title="未检测到宏"
      type="info"
      :closable="false"
      show-icon
    >
      此消息中没有使用任何宏表达式
    </el-alert>

    <div v-else class="macro-debug-content">
      <!-- 宏统计信息 -->
      <div class="macro-stats">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>宏执行统计</span>
            </div>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="执行的宏数量">
              {{ macroResult?.macroCount || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="是否包含宏">
              <el-tag :type="macroResult?.hasMacros ? 'success' : 'info'">
                {{ macroResult?.hasMacros ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </div>

      <!-- 各阶段输出 -->
      <div v-if="macroResult?.phaseOutputs" class="phase-outputs">
        <el-card shadow="never">
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
        </el-card>
      </div>

      <!-- 检测到的宏列表 -->
      <div v-if="detectedMacros.length > 0" class="detected-macros">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>检测到的宏</span>
            </div>
          </template>
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
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { QuestionFilled } from '@element-plus/icons-vue';
import { MacroProcessor } from '../../macro-engine';
import type { MacroProcessResult } from '../../macro-engine';
import type { ContextPreviewData } from '../../composables/useChatHandler';

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

const activePhases = ref<string>('original');
const macroResult = ref<MacroProcessResult | null>(null);

// 检测原始消息中的宏
const detectedMacros = computed(() => {
  if (!props.contextData) return [];
  
  // 从 systemPrompt 和 presetMessages 中检测宏
  const texts: string[] = [];
  
  if (props.contextData.systemPrompt) {
    texts.push(props.contextData.systemPrompt.content);
  }
  
  props.contextData.presetMessages.forEach(msg => {
    texts.push(msg.content);
  });
  
  // 合并所有文本并提取宏
  const combinedText = texts.join('\n');
  return MacroProcessor.extractMacros(combinedText);
});

// 是否包含宏
const hasMacros = computed(() => detectedMacros.value.length > 0);

// 当上下文数据变化时，重新处理宏
watch(
  () => props.contextData,
  async (newData) => {
    if (!newData) {
      macroResult.value = null;
      return;
    }

    // 这里只是演示宏处理流程，实际应用中需要完整的 MacroContext
    // 暂时不执行实际的宏处理，只展示检测到的宏
    macroResult.value = {
      output: '',
      hasMacros: hasMacros.value,
      macroCount: detectedMacros.value.length,
    };
  },
  { immediate: true }
);
</script>

<style scoped>
.macro-debug-view {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
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
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.no-args {
  color: var(--el-text-color-secondary);
  font-style: italic;
}
</style>