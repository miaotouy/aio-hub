<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, EditPen } from "@element-plus/icons-vue";
import type { LlmParameters } from "../../../types";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

type CustomParams = LlmParameters["custom"];

interface Props {
  modelValue?: CustomParams;
}

const props = defineProps<Props>();
const errorHandler = createModuleErrorHandler("LlmChat/CustomParamsPanel");

const emit = defineEmits<{
  (e: "update:modelValue", value: CustomParams): void;
}>();

const isCustomParamsDialogVisible = ref(false);
const customParamsJsonString = ref("");

// 从 props 中派生出计算属性
const paramsEnabled = computed({
  get: () => props.modelValue?.enabled ?? false,
  set: (enabled) => {
    emit("update:modelValue", {
      enabled,
      params: props.modelValue?.params ?? {},
    });
  },
});

const internalParams = computed(() => props.modelValue?.params ?? {});

// 是否配置了内部参数（用于UI显示，如“编辑” vs “添加”）
const hasInternalParams = computed(() => Object.keys(internalParams.value).length > 0);

// 打开弹窗时，初始化 JSON 字符串
const openCustomParamsDialog = () => {
  customParamsJsonString.value = JSON.stringify(internalParams.value, null, 2);
  isCustomParamsDialogVisible.value = true;
};

// 保存自定义参数
const saveCustomParams = () => {
  try {
    const newParams = JSON.parse(customParamsJsonString.value);
    if (typeof newParams !== "object" || newParams === null) {
      throw new Error("JSON 必须是一个对象");
    }

    emit("update:modelValue", {
      enabled: paramsEnabled.value,
      params: newParams,
    });

    isCustomParamsDialogVisible.value = false;
    customMessage.success("自定义参数已保存");
  } catch (error: any) {
    errorHandler.error(error, "JSON 格式错误");
  }
};
</script>

<template>
  <div class="custom-params-panel">
    <div class="custom-params-container">
      <div class="param-header">
        <span class="param-title">附加自定义参数</span>
        <el-switch v-model="paramsEnabled" />
      </div>

      <template v-if="paramsEnabled">
        <div class="param-hint">你可以在这里添加自定义参数。参数将以 JSON 格式合并到请求体中。</div>
        <el-button
          :type="hasInternalParams ? 'primary' : 'default'"
          :plain="hasInternalParams"
          @click="openCustomParamsDialog"
          class="edit-button"
        >
          <el-icon class="el-icon--left">
            <component :is="hasInternalParams ? EditPen : Plus" />
          </el-icon>
          {{ hasInternalParams ? "编辑自定义参数" : "添加自定义参数" }}
        </el-button>
        <div v-if="hasInternalParams" class="custom-params-preview">
          <pre><code>{{ JSON.stringify(modelValue?.params, null, 2) }}</code></pre>
        </div>
      </template>
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

.param-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0 8px;
}

.param-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-primary);
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
