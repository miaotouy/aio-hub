<template>
  <div class="section variables-section">
    <h3>参数配置</h3>
    <div class="variables-grid">
      <div
        v-for="variable in store.selectedPreset?.variables"
        :key="variable.key"
        class="variable-item"
      >
        <label :for="`var-${variable.key}`" class="variable-label">
          {{ variable.label || variable.key }}
          <span v-if="variable.required" class="required-mark">*</span>
        </label>

        <!-- 字符串类型 -->
        <input
          v-if="variable.type === 'string'"
          :id="`var-${variable.key}`"
          type="text"
          :placeholder="variable.placeholder"
          :value="store.variables[variable.key]"
          @input="handleInput(variable.key, ($event.target as HTMLInputElement).value)"
          class="variable-input"
        />

        <!-- 枚举类型 -->
        <select
          v-else-if="variable.type === 'enum'"
          :id="`var-${variable.key}`"
          :value="store.variables[variable.key]"
          @change="handleInput(variable.key, ($event.target as HTMLSelectElement).value)"
          class="variable-select"
        >
          <option
            v-for="option in variable.options"
            :key="option"
            :value="option"
          >
            {{ option }}
          </option>
        </select>

        <!-- 布尔类型 -->
        <label
          v-else-if="variable.type === 'boolean'"
          class="variable-checkbox"
        >
          <input
            :id="`var-${variable.key}`"
            type="checkbox"
            :checked="!!store.variables[variable.key]"
            @change="handleInput(variable.key, ($event.target as HTMLInputElement).checked)"
          />
          <span class="checkbox-label">启用</span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useApiTesterStore } from '../store';

const store = useApiTesterStore();

function handleInput(key: string, value: string | boolean) {
  store.updateVariable(key, value);
}
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--border-color);
}

.section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: var(--text-color);
}

.variables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.variable-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.variable-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.required-mark {
  color: var(--error-color);
}
.variable-input,
.variable-select {
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
  background: var(--input-bg);
  color: var(--text-color);
}

.variable-input:focus,
.variable-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.variable-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.variable-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.variable-checkbox .checkbox-label {
  color: var(--text-color);
}
</style>

