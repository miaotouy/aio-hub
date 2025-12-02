<template>
  <div class="json-tree-node" :style="{ paddingLeft: depth > 0 ? '16px' : '0' }">
    <!-- 对象/数组节点 -->
    <div v-if="isObject || isArray" class="node-header">
      <div class="toggle-icon" @click="toggle" :class="{ expanded: isExpanded }">
        <component :is="ChevronRight" :size="14" />
      </div>

      <span class="node-key" v-if="label">{{ label }}: </span>

      <span class="node-summary" @click="toggle">
        <span class="type-indicator">{{
          isArray ? `Array(${Object.keys(data).length})` : "Object"
        }}</span>
        <span class="preview-text" v-if="!isExpanded">{{ previewText }}</span>
      </span>

      <div class="node-actions">
        <el-button
          link
          size="small"
          class="copy-btn"
          @click.stop="copyContent"
          title="复制此节点 JSON"
        >
          <component :is="Copy" :size="12" />
        </el-button>
      </div>
    </div>

    <!-- 展开的子节点 -->
    <div v-if="(isObject || isArray) && isExpanded" class="node-children">
      <JsonTreeNode
        v-for="(value, key) in data"
        :key="key"
        :label="key.toString()"
        :data="value"
        :depth="depth + 1"
      />
    </div>

    <!-- 基础类型节点 -->
    <div v-if="!isObject && !isArray" class="node-item">
      <span class="node-key" v-if="label">{{ label }}: </span>
      <span class="node-value" :class="valueType">{{ formattedValue }}</span>

      <div class="node-actions">
        <el-button link size="small" class="copy-btn" @click.stop="copyContent" title="复制值">
          <component :is="Copy" :size="12" />
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ChevronRight, Copy } from "lucide-vue-next";
import customMessage from "@/utils/customMessage";

const props = withDefaults(
  defineProps<{
    data: any;
    label?: string;
    depth?: number;
  }>(),
  {
    depth: 0,
  }
);

const isExpanded = ref(props.depth < 2); // 默认展开前两层

const isObject = computed(
  () => props.data !== null && typeof props.data === "object" && !Array.isArray(props.data)
);
const isArray = computed(() => Array.isArray(props.data));

const valueType = computed(() => {
  if (props.data === null) return "null";
  return typeof props.data;
});

const formattedValue = computed(() => {
  if (props.data === null) return "null";
  if (typeof props.data === "string") return `"${props.data}"`;
  return String(props.data);
});

const previewText = computed(() => {
  if (isArray.value) return "[...]";
  return "{...}";
});

const toggle = () => {
  isExpanded.value = !isExpanded.value;
};

const copyContent = async () => {
  try {
    const text =
      typeof props.data === "object" ? JSON.stringify(props.data, null, 2) : String(props.data);
    await navigator.clipboard.writeText(text);
    customMessage.success("复制成功");
  } catch (err) {
    console.error("Copy failed:", err);
    customMessage.error("复制失败");
  }
};
</script>

<style scoped>
.json-tree-node {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color);
}

.node-header,
.node-item {
  display: flex;
  align-items: center;
  padding: 2px 0;
  border-radius: 4px;
}

.node-header:hover,
.node-item:hover {
  background-color: var(--fill-color-light);
}

.node-header:hover .node-actions,
.node-item:hover .node-actions {
  opacity: 1;
}

.toggle-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color-secondary);
  transition: transform 0.2s;
  margin-right: 4px;
}

.toggle-icon.expanded {
  transform: rotate(90deg);
}

.node-key {
  color: var(--el-color-primary);
  margin-right: 8px;
}

.node-summary {
  cursor: pointer;
  color: var(--text-color-secondary);
}

.type-indicator {
  font-style: italic;
  opacity: 0.8;
}

.preview-text {
  margin-left: 6px;
  opacity: 0.6;
}

.node-value {
  color: var(--el-color-success);
}

.node-value.string {
  color: var(--el-color-warning);
}

.node-value.number {
  color: var(--el-color-danger);
}

.node-value.boolean {
  color: var(--el-color-primary);
}

.node-value.null {
  color: var(--text-color-placeholder);
}

.node-actions {
  margin-left: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.copy-btn {
  padding: 2px;
  height: auto;
  color: var(--text-color-secondary);
}

.copy-btn:hover {
  color: var(--el-color-primary);
}

.node-children {
  border-left: 1px solid var(--border-color-light);
  margin-left: 7px; /* Align with toggle icon center */
}
</style>
