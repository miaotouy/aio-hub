<template>
  <div class="variable-editor">
    <el-row :gutter="10" align="middle">
      <!-- 变量名 -->
      <el-col :span="6">
        <el-input v-model="editableVariable.key" placeholder="变量名" @change="emitUpdate" />
      </el-col>

      <!-- 类型 -->
      <el-col :span="4">
        <el-select v-model="editableVariable.type" @change="onTypeChange">
          <el-option label="文本" value="string" />
          <el-option label="枚举" value="enum" />
          <el-option label="布尔" value="boolean" />
        </el-select>
      </el-col>

      <!-- 值 -->
      <el-col :span="8">
        <template v-if="editableVariable.type === 'string'">
          <el-input
            v-model="stringValue"
            :placeholder="editableVariable.placeholder || '输入值'"
            @change="emitUpdate"
          />
        </template>
        <template v-else-if="editableVariable.type === 'enum'">
          <el-select
            v-model="stringValue"
            placeholder="选择值"
            class="enum-select"
            @change="emitUpdate"
          >
            <el-option
              v-for="option in editableVariable.options || []"
              :key="option"
              :label="option"
              :value="option"
            />
            <template #footer>
              <el-button text bg size="small" class="edit-options-btn" @click="emit('edit-enum')">
                编辑选项
              </el-button>
            </template>
          </el-select>
        </template>
        <template v-else-if="editableVariable.type === 'boolean'">
          <el-switch v-model="booleanValue" @change="emitUpdate" />
        </template>
      </el-col>

      <!-- 说明 -->
      <el-col :span="4">
        <el-input
          v-model="editableVariable.description"
          placeholder="可选说明"
          @change="emitUpdate"
        />
      </el-col>

      <!-- 操作 -->
      <el-col :span="2">
        <el-button type="danger" :icon="Delete" circle plain @click="emit('remove')" />
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { ElRow, ElCol, ElInput, ElSelect, ElOption, ElSwitch, ElButton } from "element-plus";
import { Delete } from "@element-plus/icons-vue";
import type { Variable } from "../types";

const props = defineProps<{
  modelValue: Variable;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: Variable];
  remove: [];
  "edit-enum": [];
}>();

const editableVariable = ref<Variable>({ ...props.modelValue });

const stringValue = computed({
  get: () => (typeof editableVariable.value.value === "string" ? editableVariable.value.value : ""),
  set: (val) => {
    editableVariable.value.value = val;
  },
});

const booleanValue = computed({
  get: () =>
    typeof editableVariable.value.value === "boolean" ? editableVariable.value.value : false,
  set: (val) => {
    editableVariable.value.value = val;
  },
});

watch(
  () => props.modelValue,
  (newValue) => {
    editableVariable.value = { ...newValue };
  },
  { deep: true }
);

function onTypeChange() {
  const currentType = editableVariable.value.type;
  const currentValue = editableVariable.value.value;

  if (currentType === "enum") {
    if (!editableVariable.value.options) {
      editableVariable.value.options = [];
    }
    // 如果当前值不是字符串，则重置。
    if (typeof currentValue !== "string") {
      editableVariable.value.value = "";
    }
  } else if (currentType === "boolean") {
    // 如果当前值不是布尔值，则重置。
    if (typeof currentValue !== "boolean") {
      editableVariable.value.value = false;
    }
  } else if (currentType === "string") {
    // 如果当前值不是字符串，则重置。
    if (typeof currentValue !== "string") {
      editableVariable.value.value = "";
    }
  }
  emitUpdate();
}

function emitUpdate() {
  emit("update:modelValue", editableVariable.value);
}
</script>

<style scoped>
.variable-editor {
  width: 100%;
}

.enum-select {
  width: 100%;
}

.edit-options-btn {
  width: 100%;
  justify-content: center;
}
</style>
