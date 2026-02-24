<script setup lang="ts">
import { Settings2, FolderOpen } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { open } from "@tauri-apps/plugin-dialog";
import { customMessage } from "@/utils/customMessage";

const props = defineProps<{
  method: any;
  modelValue: Record<string, any>;
  settingsSchema?: any[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: Record<string, any>];
  change: [];
}>();

/**
 * 格式化同步
 */
const notifyChange = () => {
  emit("update:modelValue", props.modelValue);
  emit("change");
};

/**
 * 解析联合类型字符串
 */
const parseUnionType = (typeStr: string): { options: string[]; isArray: boolean } | null => {
  if (!typeStr) return null;

  let isArray = false;
  let targetStr = typeStr.trim();

  const arrayMatch = targetStr.match(/^Array<(.+)>$/);
  if (arrayMatch) {
    isArray = true;
    targetStr = arrayMatch[1].trim();
  }

  const parts = targetStr.split("|").map((s) => s.trim());
  if (parts.length <= 1 && !isArray) return null;

  const options: string[] = [];
  for (const part of parts) {
    const match = part.match(/^['"](.+)['"]$/);
    if (match) {
      options.push(match[1]);
    } else {
      if (!isArray) return null;
    }
  }

  return options.length > 0 ? { options, isArray } : null;
};

/**
 * 判断是否可能是路径参数
 */
const isPathParameter = (p: any) => {
  const hint = p.uiHint?.toLowerCase();
  if (hint === "path" || hint === "file" || hint === "directory" || hint === "folder") return true;

  if (p.type?.toLowerCase() !== "string") return false;
  const name = p.name?.toLowerCase() || "";
  const desc = p.description?.toLowerCase() || "";
  return (
    name.includes("path") ||
    name.includes("dir") ||
    name.includes("file") ||
    desc.includes("路径") ||
    desc.includes("目录") ||
    desc.includes("文件")
  );
};

/**
 * 判断是否可能是模型参数
 */
const isModelParameter = (p: any) => {
  const hint = p.uiHint?.toLowerCase();
  if (hint === "model") return true;

  if (p.type?.toLowerCase() !== "string") return false;
  const name = p.name?.toLowerCase() || "";
  return name.includes("modelid") || name === "model";
};

/**
 * 判断是否可能是长文本参数
 */
const isLargeTextParameter = (p: any) => {
  const hint = p.uiHint?.toLowerCase();
  if (hint === "textarea" || hint === "text") return true;

  if (p.type?.toLowerCase() !== "string") return false;
  const name = p.name?.toLowerCase() || "";
  const desc = p.description?.toLowerCase() || "";
  return (
    name.includes("text") ||
    name.includes("content") ||
    name.includes("prompt") ||
    name.includes("code") ||
    name.includes("body") ||
    desc.includes("内容") ||
    desc.includes("文本") ||
    desc.includes("提示词") ||
    desc.includes("代码")
  );
};

/**
 * 判断是否可能是 JSON 参数
 */
const isJsonParameter = (p: any) => {
  const hint = p.uiHint?.toLowerCase();
  if (hint === "json") return true;

  const type = p.type?.toLowerCase();
  return type === "object" || type === "array";
};

/**
 * 处理 JSON 更新
 */
const handleJsonParamUpdate = (paramName: string, value: string) => {
  try {
    props.modelValue[paramName] = JSON.parse(value);
    notifyChange();
  } catch (e) {
    // 忽略解析过程中的错误
  }
};

/**
 * 处理路径选择
 */
const handlePathSelect = async (paramName: string, description: string) => {
  try {
    const isDir = description.includes("目录") || description.includes("folder") || description.includes("dir");
    const selected = await open({
      directory: isDir,
      multiple: false,
      title: `选择${isDir ? "目录" : "文件"} - ${paramName}`,
    });

    if (selected && typeof selected === "string") {
      props.modelValue[paramName] = selected;
      notifyChange();
    }
  } catch (e: any) {
    customMessage.error("选择路径失败: " + e.message);
  }
};
</script>

<template>
  <div class="form-container scrollbar-styled">
    <div v-if="!method" class="empty-form">
      <Settings2 :size="32" />
      <p>请先选择一个方法</p>
    </div>
    <el-form v-else label-position="top" size="default">
      <el-form-item v-for="p in method.parameters" :key="p.name" :label="p.name">
        <template #label>
          <div class="form-label">
            <span class="p-name">{{ p.name }}</span>
            <span class="p-type">{{ p.type }}</span>
            <span v-if="p.required" class="p-required">*</span>
          </div>
        </template>

        <!-- 布尔类型 -->
        <el-switch
          v-if="p.uiHint === 'switch' || p.type?.toLowerCase() === 'boolean'"
          v-model="modelValue[p.name]"
          class="p-switch"
          @change="notifyChange"
        />

        <!-- 数字类型 -->
        <el-input-number
          v-else-if="p.uiHint === 'number' || p.type?.toLowerCase() === 'number'"
          v-model="modelValue[p.name]"
          class="w-full"
          :min="p.min !== undefined ? p.min : p.range?.min"
          :max="p.max !== undefined ? p.max : p.range?.max"
          @change="notifyChange"
        />

        <!-- 枚举或联合类型 -->
        <el-select
          v-else-if="p.uiHint === 'select' || p.enumValues || p.options || parseUnionType(p.type)"
          v-model="modelValue[p.name]"
          class="w-full"
          :multiple="parseUnionType(p.type)?.isArray"
          @change="notifyChange"
        >
          <el-option
            v-for="val in p.enumValues || p.options || parseUnionType(p.type)?.options || []"
            :key="typeof val === 'object' ? val.value : val"
            :label="typeof val === 'object' ? val.label : val"
            :value="typeof val === 'object' ? val.value : val"
          />
        </el-select>

        <!-- 模型选择 -->
        <LlmModelSelector
          v-else-if="isModelParameter(p)"
          v-model="modelValue[p.name]"
          class="w-full"
          @change="notifyChange"
        />

        <!-- 路径选择 -->
        <el-input
          v-else-if="isPathParameter(p)"
          v-model="modelValue[p.name]"
          :placeholder="p.description"
          @input="notifyChange"
        >
          <template #append>
            <el-button :icon="FolderOpen" @click="handlePathSelect(p.name, p.description)" />
          </template>
        </el-input>

        <!-- 复杂对象/数组 (内嵌 JSON 编辑器) -->
        <div v-else-if="isJsonParameter(p)" class="embedded-editor">
          <RichCodeEditor
            :value="JSON.stringify(modelValue[p.name], null, 2)"
            language="json"
            height="120px"
            @change="(val: string) => handleJsonParamUpdate(p.name, val)"
          />
        </div>

        <!-- 长文本 -->
        <el-input
          v-else-if="isLargeTextParameter(p)"
          v-model="modelValue[p.name]"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :placeholder="p.description"
          @input="notifyChange"
        />

        <!-- 普通输入 -->
        <el-input v-else v-model="modelValue[p.name]" :placeholder="p.description" @input="notifyChange" />

        <div v-if="p.description" class="p-desc">{{ p.description }}</div>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.form-container {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  background-color: var(--card-bg);
}

.empty-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  opacity: 0.5;
  gap: 12px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.p-name {
  font-weight: 600;
  font-family: var(--el-font-family-mono);
}

.p-type {
  font-size: 10px;
  color: var(--el-color-info);
  background: rgba(var(--el-color-info-rgb), 0.1);
  padding: 1px 4px;
  border-radius: 3px;
}

.p-required {
  color: var(--el-color-danger);
}

.p-desc {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 2px;
  line-height: 1.4;
}

.embedded-editor {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.w-full {
  width: 100%;
}

.p-switch {
  margin-right: 12px;
}

.scrollbar-styled::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-styled::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}
</style>
