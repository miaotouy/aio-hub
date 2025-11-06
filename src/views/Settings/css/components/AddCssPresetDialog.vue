<script setup lang="ts">
import { ref } from 'vue';

interface Emits {
  (e: 'confirm', name: string): void;
  (e: 'cancel'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { required: true });
const presetName = ref('');

function handleConfirm() {
  if (!presetName.value.trim()) {
    return;
  }
  emit('confirm', presetName.value.trim());
  presetName.value = '';
  visible.value = false;
}

function handleCancel() {
  presetName.value = '';
  visible.value = false;
  emit('cancel');
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="添加 CSS 预设"
    width="400px"
    @close="handleCancel"
  >
    <el-form @submit.prevent="handleConfirm">
      <el-form-item label="预设名称">
        <el-input
          v-model="presetName"
          placeholder="请输入预设名称"
          autofocus
          @keyup.enter="handleConfirm"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button
        type="primary"
        :disabled="!presetName.trim()"
        @click="handleConfirm"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.el-form-item {
  margin-bottom: 0;
}
</style>