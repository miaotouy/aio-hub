<script setup lang="ts">
import { Plus, Trash2, Crosshair, Ban } from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";
import { iframeBridge } from "../../core/iframe-bridge";

const store = useWebDistilleryStore();

const togglePicker = async (mode: "include" | "exclude") => {
  if (store.pickerMode === mode) {
    await iframeBridge.disablePicker();
    store.setPickerMode("idle");
  } else {
    store.setPickerMode(mode);
    await iframeBridge.enablePicker({ mode, continuous: true }, (data: any) => {
      handleElementSelected(data);
    });
  }
};

const handleElementSelected = (data: any) => {
  const { selector, mode } = data;
  if (!store.recipeDraft) return;

  const draft = { ...store.recipeDraft };
  if (mode === "include") {
    if (!draft.extractSelectors?.includes(selector)) {
      draft.extractSelectors = [...(draft.extractSelectors || []), selector];
    }
  } else if (mode === "exclude") {
    if (!draft.excludeSelectors?.includes(selector)) {
      draft.excludeSelectors = [...(draft.excludeSelectors || []), selector];
    }
  }

  store.updateRecipeDraft(draft);
};

const removeSelector = (mode: "include" | "exclude", index: number) => {
  if (!store.recipeDraft) return;
  const draft = { ...store.recipeDraft };
  if (mode === "include") {
    draft.extractSelectors = draft.extractSelectors?.filter((_, i) => i !== index);
  } else {
    draft.excludeSelectors = draft.excludeSelectors?.filter((_, i) => i !== index);
  }
  store.updateRecipeDraft(draft);
};

const addManualSelector = (mode: "include" | "exclude") => {
  if (!store.recipeDraft) return;
  const draft = { ...store.recipeDraft };
  if (mode === "include") {
    draft.extractSelectors = [...(draft.extractSelectors || []), ""];
  } else {
    draft.excludeSelectors = [...(draft.excludeSelectors || []), ""];
  }
  store.updateRecipeDraft(draft);
};

const updateSelector = (mode: "include" | "exclude", index: number, value: string) => {
  if (!store.recipeDraft) return;
  const draft = { ...store.recipeDraft };
  if (mode === "include" && draft.extractSelectors) {
    draft.extractSelectors[index] = value;
  } else if (mode === "exclude" && draft.excludeSelectors) {
    draft.excludeSelectors[index] = value;
  }
  store.updateRecipeDraft(draft);
};
</script>

<template>
  <div class="rules-tab">
    <!-- 包含规则 -->
    <div class="rules-section">
      <div class="section-header">
        <div class="header-title">
          <el-icon color="#409EFF"><Crosshair /></el-icon>
          <span>包含提取 (Include)</span>
        </div>
        <div class="header-actions">
          <el-button
            size="small"
            :type="store.pickerMode === 'include' ? 'primary' : 'default'"
            @click="togglePicker('include')"
          >
            🎯 拾取
          </el-button>
        </div>
      </div>

      <div class="selectors-list">
        <div v-for="(_, index) in store.recipeDraft?.extractSelectors" :key="'inc-' + index" class="selector-item">
          <el-input
            v-model="store.recipeDraft!.extractSelectors![index]"
            size="small"
            placeholder="CSS 选择器"
            @input="(val: string) => updateSelector('include', index, val)"
          />
          <el-button link type="danger" @click="removeSelector('include', index)">
            <el-icon><Trash2 /></el-icon>
          </el-button>
        </div>
        <el-button class="add-btn" dashed size="small" @click="addManualSelector('include')">
          <el-icon><Plus /></el-icon>
          <span>手动添加</span>
        </el-button>
      </div>
    </div>

    <el-divider />

    <!-- 排除规则 -->
    <div class="rules-section">
      <div class="section-header">
        <div class="header-title">
          <el-icon color="#F56C6C"><Ban /></el-icon>
          <span>排除内容 (Exclude)</span>
        </div>
        <div class="header-actions">
          <el-button
            size="small"
            :type="store.pickerMode === 'exclude' ? 'danger' : 'default'"
            @click="togglePicker('exclude')"
          >
            🎯 拾取
          </el-button>
        </div>
      </div>

      <div class="selectors-list">
        <div v-for="(_, index) in store.recipeDraft?.excludeSelectors" :key="'exc-' + index" class="selector-item">
          <el-input
            v-model="store.recipeDraft!.excludeSelectors![index]"
            size="small"
            placeholder="CSS 选择器"
            @input="(val: string) => updateSelector('exclude', index, val)"
          />
          <el-button link type="danger" @click="removeSelector('exclude', index)">
            <el-icon><Trash2 /></el-icon>
          </el-button>
        </div>
        <el-button class="add-btn" dashed size="small" @click="addManualSelector('exclude')">
          <el-icon><Plus /></el-icon>
          <span>手动添加</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rules-tab {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.rules-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  font-size: 14px;
}

.selectors-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.selector-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-btn {
  width: 100%;
  border-style: dashed;
}

:deep(.el-divider--horizontal) {
  margin: 20px 0;
}
</style>
