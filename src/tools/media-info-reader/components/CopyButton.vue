<template>
  <el-button
    size="small"
    link
    :type="copied ? 'success' : 'primary'"
    :icon="copied ? Check : CopyDocument"
    @click="handleCopy"
  >
    {{ copied ? "已复制" : "复制" }}
  </el-button>
</template>

<script setup lang="ts">
import { ElButton } from "element-plus";
import { CopyDocument, Check } from "@element-plus/icons-vue";
import { useClipboard } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";

const props = defineProps<{
  text: string;
}>();

const { copy, copied } = useClipboard();

const handleCopy = () => {
  if (props.text) {
    copy(props.text);
    customMessage.success("已复制");
  }
};
</script>
