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
import { ElButton } from "element-plus";
import { isEqual } from "lodash-es";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { useMediaGenStore } from "../../stores/mediaGenStore";
import type { MediaMessage } from "../../types";

const errorHandler = createModuleErrorHandler("MediaGenerator/MessageDataEditor");

const props = defineProps<{
  modelValue: boolean;
  messageId: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const store = useMediaGenStore();
const editorRef = ref<InstanceType<typeof RichCodeEditor> | null>(null);

const jsonData = ref("");
const originalNodeData = ref<Partial<MediaMessage> | null>(null);
const parseError = ref<string | null>(null);

const showDialog = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

watch(
  () => props.modelValue,
  (isOpening) => {
    if (isOpening && props.messageId) {
      const node = store.nodes[props.messageId];
      if (node) {
        // 保存原始数据用于比较
        originalNodeData.value = JSON.parse(JSON.stringify(node));
        // 使用 JSON.stringify 格式化输出
        jsonData.value = JSON.stringify(node, null, 2);
        parseError.value = null;

        // 自动聚焦
        nextTick(() => {
          editorRef.value?.focusEditor();
        });
      } else {
        errorHandler.error(null, "无法加载消息数据，节点可能已被删除。", {
          messageId: props.messageId,
        });
        handleClose();
      }
    }
  }
);

const handleSave = async () => {
  parseError.value = null;
  let parsedData: Partial<MediaMessage>;

  try {
    parsedData = JSON.parse(jsonData.value);
  } catch (error) {
    parseError.value = (error as Error).message;
    errorHandler.error(error, "JSON 格式错误，请检查后再保存。");
    return;
  }

  if (!props.messageId || !originalNodeData.value) {
    errorHandler.error("内部错误：缺少消息 ID 或原始数据。");
    return;
  }

  // 比较数据是否有变化
  // 创建一个用于比较的副本，移除由 updateNodeData 自动处理的字段
  const originalComparable = { ...originalNodeData.value };
  delete (originalComparable as any).id;
  delete (originalComparable as any).parentId;
  delete (originalComparable as any).childrenIds;
  delete (originalComparable as any).updatedAt;

  const newComparable = { ...parsedData };
  delete (newComparable as any).id;
  delete (newComparable as any).parentId;
  delete (newComparable as any).childrenIds;
  delete (newComparable as any).updatedAt;

  if (isEqual(originalComparable, newComparable)) {
    customMessage.info("未检测到数据更改。");
    handleClose();
    return;
  }

  try {
    await store.updateNodeData(props.messageId, parsedData);
    customMessage.success("消息数据已更新。");
    handleClose();
  } catch (error) {
    errorHandler.error(error, "保存失败");
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