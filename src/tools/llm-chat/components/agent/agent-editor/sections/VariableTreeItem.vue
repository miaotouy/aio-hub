<script setup lang="ts">
import { ref } from "vue";
import { Plus, Delete, FolderOpened, Folder } from "@element-plus/icons-vue";
import type { VariableTreeNode } from "@/tools/llm-chat/types/sessionVariable";

interface Props {
  node: VariableTreeNode;
  depth?: number;
}

interface Emits {
  (e: "update", node: VariableTreeNode): void;
  (e: "delete"): void;
  (e: "add-child", type: "group" | "variable"): void;
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0
});

const emit = defineEmits<Emits>();

const expanded = ref(true);

const updateKey = (value: string) => {
  emit("update", { ...props.node, key: value });
};

const updateDisplayName = (value: string) => {
  emit("update", { ...props.node, displayName: value });
};

const updateDescription = (value: string) => {
  emit("update", { ...props.node, description: value });
};

const updateInitialValue = (value: any) => {
  emit("update", { ...props.node, initialValue: value });
};

const updateMin = (value: number | undefined) => {
  emit("update", { ...props.node, min: value });
};

const updateMax = (value: number | undefined) => {
  emit("update", { ...props.node, max: value });
};

const toggleType = () => {
  const newType = props.node.type === "group" ? "variable" : "group";
  const updated: VariableTreeNode = {
    ...props.node,
    type: newType
  };
  
  if (newType === "group") {
    updated.children = updated.children || [];
    delete updated.initialValue;
    delete updated.min;
    delete updated.max;
  } else {
    delete updated.children;
    updated.initialValue = 0;
  }
  
  emit("update", updated);
};

const addChild = (type: "group" | "variable") => {
  emit("add-child", type);
};

const updateChild = (index: number, child: VariableTreeNode) => {
  if (!props.node.children) return;
  const newChildren = [...props.node.children];
  newChildren[index] = child;
  emit("update", { ...props.node, children: newChildren });
};

const deleteChild = (index: number) => {
  if (!props.node.children) return;
  const newChildren = props.node.children.filter((_, i) => i !== index);
  emit("update", { ...props.node, children: newChildren });
};

const addChildToNode = (index: number, type: "group" | "variable") => {
  if (!props.node.children) return;
  const targetChild = props.node.children[index];
  if (targetChild.type !== "group") return;
  
  const newChild: VariableTreeNode = {
    key: "",
    type,
    ...(type === "variable" ? { initialValue: 0 } : { children: [] })
  };
  
  const updatedChild = {
    ...targetChild,
    children: [...(targetChild.children || []), newChild]
  };
  
  updateChild(index, updatedChild);
};
</script>

<template>
  <div class="variable-tree-item" :style="{ paddingLeft: `${depth * 20}px` }">
    <div class="item-header">
      <div class="item-controls">
        <el-icon 
          v-if="node.type === 'group'" 
          class="expand-icon" 
          @click="expanded = !expanded"
        >
          <FolderOpened v-if="expanded" />
          <Folder v-else />
        </el-icon>
        
        <el-input 
          :model-value="node.key" 
          @update:model-value="updateKey"
          placeholder="键名 (如: hp)" 
          size="small" 
          class="key-input"
        />
        
        <el-tag :type="node.type === 'group' ? 'info' : 'success'" size="small" @click="toggleType" style="cursor: pointer;">
          {{ node.type === "group" ? "分组" : "变量" }}
        </el-tag>
      </div>
      
      <div class="item-actions">
        <el-button 
          v-if="node.type === 'group'" 
          type="primary" 
          :icon="Plus" 
          circle 
          size="small" 
          @click="addChild('variable')"
          title="添加子变量"
        />
        <el-button 
          v-if="node.type === 'group'" 
          type="info" 
          :icon="Plus" 
          circle 
          size="small" 
          @click="addChild('group')"
          title="添加子分组"
        />
        <el-button 
          type="danger" 
          :icon="Delete" 
          circle 
          size="small" 
          @click="emit('delete')"
        />
      </div>
    </div>
    
    <div v-if="node.type === 'variable'" class="item-details">
      <el-form label-width="80px" size="small">
        <el-form-item label="显示名称">
          <el-input 
            :model-value="node.displayName" 
            @update:model-value="updateDisplayName"
            placeholder="如: 生命值" 
          />
        </el-form-item>
        
        <el-form-item label="初始值">
          <el-input 
            :model-value="node.initialValue" 
            @update:model-value="updateInitialValue"
            placeholder="0 或 { }" 
          />
        </el-form-item>
        
        <el-form-item label="范围">
          <div class="range-inputs">
            <el-input-number 
              :model-value="node.min" 
              @update:model-value="updateMin"
              placeholder="最小值" 
              :controls="false"
            />
            <span>-</span>
            <el-input-number 
              :model-value="node.max" 
              @update:model-value="updateMax"
              placeholder="最大值" 
              :controls="false"
            />
          </div>
        </el-form-item>
        
        <el-form-item label="描述">
          <el-input 
            :model-value="node.description" 
            @update:model-value="updateDescription"
            placeholder="用途说明" 
          />
        </el-form-item>
      </el-form>
    </div>
    
    <div v-if="node.type === 'group' && expanded && node.children" class="item-children">
      <VariableTreeItem
        v-for="(child, index) in node.children"
        :key="index"
        :node="child"
        :depth="depth + 1"
        @update="updateChild(index, $event)"
        @delete="deleteChild(index)"
        @add-child="addChildToNode(index, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.variable-tree-item {
  border-left: 2px solid var(--el-border-color-light);
  margin-bottom: 8px;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: var(--card-bg);
  border-radius: 4px;
  margin-bottom: 4px;
}

.item-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.expand-icon {
  cursor: pointer;
  font-size: 18px;
  color: var(--el-text-color-secondary);
}

.expand-icon:hover {
  color: var(--el-color-primary);
}

.key-input {
  width: 200px;
}

.item-actions {
  display: flex;
  gap: 4px;
}

.item-details {
  padding: 12px;
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
  border-radius: 4px;
  margin-bottom: 8px;
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-inputs :deep(.el-input-number) {
  width: 120px;
}

.item-children {
  margin-left: 12px;
}
</style>