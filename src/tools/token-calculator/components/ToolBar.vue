<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <el-radio-group
        :model-value="calculationMode"
        @update:model-value="$emit('update:calculationMode', $event)"
      >
        <el-radio-button value="model">按模型</el-radio-button>
        <el-radio-button value="tokenizer">按分词器</el-radio-button>
      </el-radio-group>

      <el-select
        :model-value="selectedModelId"
        @update:model-value="$emit('update:selectedModelId', $event)"
        :placeholder="calculationMode === 'model' ? '选择模型' : '选择分词器'"
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
      <div class="display-limit-control">
        <span class="control-label">显示上限:</span>
        <el-select
          :model-value="maxDisplayTokens"
          @update:model-value="$emit('update:maxDisplayTokens', $event)"
          style="width: 120px"
        >
          <el-option :value="5000" label="5,000" />
          <el-option :value="10000" label="10,000" />
          <el-option :value="20000" label="20,000" />
          <el-option :value="50000" label="50,000" />
          <el-option :value="100000" label="100,000" />
          <el-option :value="1000000" label="1,000,000" />
          <el-option :value="10000000" label="10,000,000" />
        </el-select>
      </div>
      <el-button @click="$emit('paste')" type="primary">
        <el-icon><DocumentCopy /></el-icon>
        粘贴
      </el-button>
      <el-button @click="$emit('copy')">
        <el-icon><CopyDocument /></el-icon>
        复制
      </el-button>
      <el-button @click="$emit('clear')" type="danger" plain>
        <el-icon><Delete /></el-icon>
        清空
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DocumentCopy, CopyDocument, Delete } from "@element-plus/icons-vue";
import type {
  AvailableModel,
  CalculationMode,
} from "@/tools/token-calculator/composables/useTokenCalculatorState";

interface Props {
  calculationMode: CalculationMode;
  selectedModelId: string;
  availableModels: AvailableModel[];
  maxDisplayTokens: number;
}

interface Emits {
  (e: "update:calculationMode", value: CalculationMode): void;
  (e: "update:selectedModelId", value: string): void;
  (e: "update:maxDisplayTokens", value: number): void;
  (e: "paste"): void;
  (e: "copy"): void;
  (e: "clear"): void;
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
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
  gap: 10px;
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

.display-limit-control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-right: 1px solid var(--border-color);
}

.control-label {
  font-size: 14px;
  color: var(--text-color);
  white-space: nowrap;
}
</style>
