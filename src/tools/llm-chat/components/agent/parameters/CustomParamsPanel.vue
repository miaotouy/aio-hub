<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Plus, EditPen } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";

interface Props {
  modelValue?: Record<string, any>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: Record<string, any>): void;
}>();

const isCustomParamsDialogVisible = ref(false);
const customParamsJsonString = ref("");

const customParams = computed(() => {
  return props.modelValue || {};
});

const hasCustomParams = computed(() => Object.keys(customParams.value).length > 0);

// 打开弹窗时，初始化 JSON 字符串
const openCustomParamsDialog = () => {
  customParamsJsonString.value = JSON.stringify(customParams.value, null, 2);
  isCustomParamsDialogVisible.value = true;
};

// 保存自定义参数
const saveCustomParams = () => {
  try {
    const newCustomParams = JSON.parse(customParamsJsonString.value);
    if (typeof newCustomParams !== "object" || newCustomParams === null) {
      throw new Error("JSON 必须是一个对象");
    }

    emit("update:modelValue", newCustomParams);

    isCustomParamsDialogVisible.value = false;
    customMessage.success("自定义参数已保存");
  } catch (error: any) {
    customMessage.error(`JSON 格式错误: ${error.message}`);
  }
};

// 监听自定义参数变化，更新 JSON 字符串（如果弹窗是打开的）
watch(
  () => props.modelValue,
  (newVal) => {
    if (isCustomParamsDialogVisible.value) {
      customParamsJsonString.value = JSON.stringify(newVal || {}, null, 2);
    }
  },
  { deep: true }
);
</script>

<template>
  <div class="custom-params-panel">
    <div class="custom-params-container">
      <div class="param-hint">你可以在这里添加自定义参数。参数将以 JSON 格式合并到请求体中。</div>
      <el-button
        :type="hasCustomParams ? 'primary' : 'default'"
        :plain="hasCustomParams"
        @click="openCustomParamsDialog"
        class="edit-button"
      >
        <el-icon class="el-icon--left">
          <component :is="hasCustomParams ? EditPen : Plus" />
        </el-icon>
        {{ hasCustomParams ? "编辑自定义参数" : "添加自定义参数" }}
      </el-button>
      <div v-if="hasCustomParams" class="custom-params-preview">
        <pre><code>{{ JSON.stringify(customParams, null, 2) }}</code></pre>
      </div>
    </div>

    <!-- 自定义参数编辑弹窗 -->
    <BaseDialog
      v-model="isCustomParamsDialogVisible"
      title="编辑自定义参数"
      width="800px"
      :show-close-button="false"
      dialog-class="custom-params-dialog"
    >
      <div class="dialog-content">
        <p class="dialog-hint">
          请以 JSON 格式输入您想添加或覆盖的参数。这些参数将与标准参数合并后发送给 LLM API。
        </p>
        <RichCodeEditor
          v-model="customParamsJsonString"
          language="json"
          class="json-editor"
          :line-numbers="true"
          :word-wrap="true"
        />
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="isCustomParamsDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveCustomParams">保存</el-button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.param-hint {
  margin-bottom: 16px;
  padding: 12px;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.5;
}

.custom-params-container {
  padding: 0 12px 12px;
}

.edit-button {
  width: 100%;
  margin-top: 8px;
}

.custom-params-preview {
  margin-top: 16px;
  padding: 12px;
  background-color: var(--vscode-editor-background);
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
}

.custom-params-preview pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color);
  font-family: "Consolas", "Monaco", monospace;
  font-size: 12px;
}

/* 弹窗样式 */
.dialog-content {
  padding: 0 20px;
}

.dialog-hint {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin-bottom: 16px;
  line-height: 1.6;
}

.json-editor {
  height: 400px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
