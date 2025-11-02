<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <el-radio-group
        :model-value="calculationMode"
        @update:model-value="$emit('update:calculationMode', $event)"
        size="small"
      >
        <el-radio-button value="model">按模型</el-radio-button>
        <el-radio-button value="tokenizer">按分词器</el-radio-button>
      </el-radio-group>
      
      <el-select
        :model-value="selectedModelId"
        @update:model-value="$emit('update:selectedModelId', $event)"
        :placeholder="calculationMode === 'model' ? '选择模型' : '选择分词器'"
        size="small"
        filterable
        style="width: 250px"
      >
        <el-option
          v-for="model in availableModels"
          :key="model.id"
          :label="model.name"
          :value="model.id"
        >
          <div class="model-option">
            <span>{{ model.name }}</span>
            <span class="model-provider">{{ model.provider }}</span>
          </div>
        </el-option>
      </el-select>
    </div>

    <div class="toolbar-right">
      <el-button @click="$emit('paste')" size="small" type="primary">
        <el-icon><DocumentCopy /></el-icon>
        粘贴
      </el-button>
      <el-button @click="$emit('copy')" size="small">
        <el-icon><CopyDocument /></el-icon>
        复制
      </el-button>
      <el-button @click="$emit('clear')" size="small" type="danger" plain>
        <el-icon><Delete /></el-icon>
        清空
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DocumentCopy, CopyDocument, Delete } from '@element-plus/icons-vue';
import type { AvailableModel, CalculationMode } from '@/composables/useTokenCalculator';

interface Props {
  calculationMode: CalculationMode;
  selectedModelId: string;
  availableModels: AvailableModel[];
}

interface Emits {
  (e: 'update:calculationMode', value: CalculationMode): void;
  (e: 'update:selectedModelId', value: string): void;
  (e: 'paste'): void;
  (e: 'copy'): void;
  (e: 'clear'): void;
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background-color: transparent;
  border-bottom: 1px solid var(--border-color);
  border-radius: 12px 12px 0 0;
  z-index: 10;
  flex-shrink: 0;
  box-sizing: border-box;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.model-provider {
  font-size: 12px;
  color: var(--text-color-light);
  margin-left: 8px;
}
</style>