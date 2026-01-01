<script setup lang="ts">
import { inject, defineAsyncComponent, ref, watch } from "vue";

const ChatRegexEditor = defineAsyncComponent(() => import("../../../common/ChatRegexEditor.vue"));
const LlmThinkRulesEditor = defineAsyncComponent(
  () => import("@/tools/rich-text-renderer/components/LlmThinkRulesEditor.vue")
);
const MarkdownStyleEditor = defineAsyncComponent(
  () => import("@/tools/rich-text-renderer/components/style-editor/MarkdownStyleEditor.vue")
);

const editForm = inject<any>("agent-edit-form");
const activeTab = inject<any>("active-tab");

const thinkRulesLoaded = ref(false);
const styleOptionsLoaded = ref(false);
const styleLoading = ref(false);

watch(
  activeTab,
  (tab) => {
    if (tab === "output") {
      thinkRulesLoaded.value = true;
      if (!styleOptionsLoaded.value) {
        styleLoading.value = true;
        setTimeout(() => {
          styleLoading.value = false;
        }, 500);
      }
      styleOptionsLoaded.value = true;
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="agent-section">
    <!-- 文本替换规则 -->
    <div class="section-group" data-setting-id="regex">
      <div class="section-group-title">文本替换规则</div>
      <div class="form-hint" style="margin-bottom: 12px">
        配置该智能体专属的文本替换规则。支持正则表达式，用于对回复内容进行动态清洗或格式转换。
      </div>
      <ChatRegexEditor v-model="editForm.regexConfig" />
    </div>

    <el-divider />

    <!-- 思考块规则 -->
    <div class="section-group" data-setting-id="thinkRules">
      <div class="section-group-title">思考块规则配置</div>
      <div class="form-hint" style="margin-bottom: 12px">
        配置 LLM 输出中的自定义思考过程识别规则，用于在对话中折叠显示思考内容。
      </div>
      <LlmThinkRulesEditor v-if="thinkRulesLoaded" v-model="editForm.llmThinkRules" />
    </div>

    <el-divider />

    <!-- 回复样式自定义 -->
    <div class="section-group" data-setting-id="style">
      <div class="section-group-title">回复样式自定义</div>
      <div class="form-hint" style="margin-bottom: 12px">
        自定义该智能体回复内容的 Markdown 渲染样式（如粗体颜色、发光效果等）。
      </div>
      <div style="height: 600px">
        <MarkdownStyleEditor
          v-if="styleOptionsLoaded"
          v-model="editForm.richTextStyleOptions"
          :loading="styleLoading"
        />
      </div>
    </div>

    <el-divider />

    <!-- 交互行为 -->
    <div class="section-group" data-setting-id="interaction">
      <div class="section-group-title">交互行为配置</div>
      <el-form-item label="分支发送">
        <el-switch v-model="editForm.interactionConfig.sendButtonCreateBranch" />
        <div class="form-hint">
          开启后，点击消息中的可交互发送按钮（如“继续”）将不再追加到当前对话末尾，而是作为该消息的新分支发送。
        </div>
      </el-form-item>
    </div>
  </div>
</template>

<style scoped>
.section-group {
  margin-bottom: 24px;
}
.section-group-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
}
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}
</style>
