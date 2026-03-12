<script setup lang="ts">
import { ref, watch } from "vue";
import { Plus, DocumentCopy, View } from "@element-plus/icons-vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import VariableTreeItem from "./VariableTreeItem.vue";
import type { VariableTreeNode } from "@/tools/llm-chat/types/sessionVariable";
import { customMessage } from "@/utils/customMessage";

interface Props {
  modelValue: VariableTreeNode[];
}

interface Emits {
  (e: "update:modelValue", value: VariableTreeNode[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

type EditorMode = "ui" | "json";
const mode = ref<EditorMode>("ui");

// UI 模式的本地数据
const treeData = ref<VariableTreeNode[]>([...props.modelValue]);

// JSON 模式的文本
const jsonText = ref("");

// 同步 props 到本地
watch(() => props.modelValue, (newVal) => {
  treeData.value = [...newVal];
  if (mode.value === "json") {
    jsonText.value = JSON.stringify(newVal, null, 2);
  }
}, { deep: true });

// 切换模式
const switchMode = (newMode: EditorMode) => {
  if (newMode === "json") {
    // 切换到 JSON 模式：序列化当前树
    jsonText.value = JSON.stringify(treeData.value, null, 2);
  } else {
    // 切换到 UI 模式：解析 JSON
    try {
      const parsed = JSON.parse(jsonText.value);
      if (Array.isArray(parsed)) {
        treeData.value = parsed;
        emit("update:modelValue", parsed);
      } else {
        customMessage.error("JSON 格式错误：根节点必须是数组");
        return;
      }
    } catch (e) {
      customMessage.error("JSON 解析失败，请检查格式");
      return;
    }
  }
  mode.value = newMode;
};

// 添加根节点
const addRootNode = (type: "group" | "variable") => {
  const newNode: VariableTreeNode = {
    key: "",
    type,
    ...(type === "variable" ? { initialValue: 0 } : { children: [] })
  };
  treeData.value.push(newNode);
  emit("update:modelValue", treeData.value);
};

// 更新节点
const updateNode = (index: number, node: VariableTreeNode) => {
  treeData.value[index] = node;
  emit("update:modelValue", treeData.value);
};

// 删除节点
const deleteNode = (index: number) => {
  treeData.value.splice(index, 1);
  emit("update:modelValue", treeData.value);
};

// 添加子节点到根节点
const addChildToRoot = (index: number, type: "group" | "variable") => {
  const targetNode = treeData.value[index];
  if (targetNode.type !== "group") return;
  
  const newChild: VariableTreeNode = {
    key: "",
    type,
    ...(type === "variable" ? { initialValue: 0 } : { children: [] })
  };
  
  targetNode.children = [...(targetNode.children || []), newChild];
  emit("update:modelValue", treeData.value);
};

// JSON 编辑器更新
const onJsonUpdate = (value: string) => {
  jsonText.value = value;
};

// 应用 JSON 更改
const applyJsonChanges = () => {
  try {
    const parsed = JSON.parse(jsonText.value);
    if (Array.isArray(parsed)) {
      treeData.value = parsed;
      emit("update:modelValue", parsed);
      customMessage.success("JSON 已应用");
    } else {
      customMessage.error("JSON 格式错误：根节点必须是数组");
    }
  } catch (e) {
    customMessage.error("JSON 解析失败，请检查格式");
  }
};

// 格式化 JSON
const formatJson = () => {
  try {
    const parsed = JSON.parse(jsonText.value);
    jsonText.value = JSON.stringify(parsed, null, 2);
    customMessage.success("JSON 已格式化");
  } catch (e) {
    customMessage.error("JSON 格式错误，无法格式化");
  }
};
</script>

<template>
  <div class="variable-tree-editor">
    <div class="editor-toolbar">
      <el-radio-group v-model="mode" size="small" @change="switchMode">
        <el-radio-button value="ui">
          <el-icon><View /></el-icon>
          <span>可视化编辑</span>
        </el-radio-button>
        <el-radio-button value="json">
          <el-icon><DocumentCopy /></el-icon>
          <span>JSON 编辑</span>
        </el-radio-button>
      </el-radio-group>
      
      <div v-if="mode === 'ui'" class="toolbar-actions">
        <el-button type="primary" :icon="Plus" size="small" @click="addRootNode('variable')">
          添加变量
        </el-button>
        <el-button type="info" :icon="Plus" size="small" @click="addRootNode('group')">
          添加分组
        </el-button>
      </div>
      
      <div v-if="mode === 'json'" class="toolbar-actions">
        <el-button type="primary" size="small" @click="applyJsonChanges">
          应用更改
        </el-button>
        <el-button size="small" @click="formatJson">
          格式化
        </el-button>
      </div>
    </div>
    
    <div class="editor-content">
      <div v-if="mode === 'ui'" class="ui-editor">
        <div v-if="treeData.length === 0" class="empty-hint">
          <p>暂无变量定义，点击上方按钮添加</p>
        </div>
        <VariableTreeItem
          v-for="(node, index) in treeData"
          :key="index"
          :node="node"
          @update="updateNode(index, $event)"
          @delete="deleteNode(index)"
          @add-child="addChildToRoot(index, $event)"
        />
      </div>
      
      <div v-else class="json-editor">
        <RichCodeEditor
          :model-value="jsonText"
          language="json"
          :height="400"
          @update:model-value="onJsonUpdate"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.variable-tree-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.editor-content {
  min-height: 300px;
}

.ui-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-hint {
  text-align: center;
  padding: 40px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.json-editor {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
}
</style>