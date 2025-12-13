<template>
  <BaseDialog
    v-model="showDialog"
    title="消息数据编辑器 (高级)"
    width="80vw"
    height="80vh"
    :destroy-on-close="true"
    @close="handleClose"
  >
    <div class="data-editor-container">
      <RichCodeEditor
        ref="editorRef"
        v-model="jsonData"
        language="json"
        editor-type="monaco"
        :options="{ lineNumbers: 'on', folding: true }"
      />
      <div v-if="parseError" class="error-message">
        <p>JSON 解析失败:</p>
        <pre>{{ parseError }}</pre>
      </div>
    </div>

    <template #footer>
      <div class="footer-actions">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from "vue";
import { ElButton, ElMessage } from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { useLlmChatStore } from "../../store";
import type { ChatMessageNode } from "../../types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("MessageDataEditor");

const props = defineProps<{
  modelValue: boolean;
  messageId: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const store = useLlmChatStore();
const editorRef = ref<InstanceType<typeof RichCodeEditor> | null>(null);

const jsonData = ref("");
const parseError = ref<string | null>(null);

const showDialog = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

watch(
  () => props.modelValue,
  (isOpening) => {
    if (isOpening && props.messageId) {
      const session = store.currentSession;
      if (session && session.nodes[props.messageId]) {
        const node = session.nodes[props.messageId];
        // 使用 JSON.stringify 格式化输出
        jsonData.value = JSON.stringify(node, null, 2);
        parseError.value = null;

        // 自动聚焦
        nextTick(() => {
          editorRef.value?.focusEditor();
        });
      } else {
        logger.error("无法加载消息数据：节点不存在", { messageId: props.messageId });
        ElMessage.error("无法加载消息数据，节点可能已被删除。");
        handleClose();
      }
    }
  }
);

const handleSave = async () => {
  parseError.value = null;
  let parsedData: Partial<ChatMessageNode>;

  try {
    parsedData = JSON.parse(jsonData.value);
  } catch (error) {
    logger.warn("保存失败：JSON 解析错误", error);
    parseError.value = (error as Error).message;
    ElMessage.error("JSON 格式错误，请检查后再保存。");
    return;
  }

  if (!props.messageId) {
    ElMessage.error("内部错误：缺少消息 ID。");
    return;
  }

  try {
    await store.updateNodeData(props.messageId, parsedData);
    ElMessage.success("消息数据已更新。");
    handleClose();
  } catch (error) {
    logger.error("更新节点数据时出错", error);
    ElMessage.error(`保存失败：${(error as Error).message}`);
  }
};

const handleClose = () => {
  emit("update:modelValue", false);
};
</script>

<style scoped>
.data-editor-container {
  display: flex;
  flex-direction: column;
  height: 100%; /* 让编辑器撑满内容区 */
  gap: 10px;
}

.error-message {
  padding: 10px;
  background-color: var(--el-color-error-light-9);
  color: var(--el-color-error);
  border: 1px solid var(--el-color-error-light-5);
  border-radius: 4px;
  font-size: 14px;
}

.error-message pre {
  margin-top: 5px;
  white-space: pre-wrap;
  word-break: break-all;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}
</style>
