<template>
  <div class="llm-think-rules-editor">
    <div class="rules-header">
      <div class="header-left">
        <h4>思考块规则配置</h4>
        <div class="header-actions">
          <el-dropdown trigger="click" @command="handlePresetCommand">
            <el-button size="small">
              添加预设<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="preset in PRESET_RULES"
                  :key="preset.id"
                  :command="preset"
                  :disabled="localRules.some((r) => r.id === preset.id)"
                >
                  {{ preset.displayName }} ({{ preset.tagName }})
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button size="small" @click="resetToDefault">重置</el-button>
        </div>
      </div>
      <el-button :icon="Plus" type="primary" size="small" @click="showAddDialog = true">添加规则</el-button>
    </div>

    <div class="rules-list">
      <el-empty v-if="localRules.length === 0" description="暂无规则，点击上方按钮添加" />

      <div v-for="(rule, index) in localRules" :key="rule.id" class="rule-item">
        <div class="rule-content">
          <div class="rule-main">
            <div class="rule-tag">
              <code>&lt;{{ rule.tagName }}&gt;</code>
            </div>
            <div class="rule-info">
              <div class="rule-display-name">{{ rule.displayName }}</div>
              <div class="rule-meta">
                <el-tag size="small" type="info">{{ rule.id }}</el-tag>
                <el-tag size="small" :type="rule.collapsedByDefault ? 'warning' : 'success'">
                  {{ rule.collapsedByDefault ? "默认折叠" : "默认展开" }}
                </el-tag>
              </div>
            </div>
          </div>

          <div class="rule-actions">
            <el-button :icon="Edit" size="small" @click="editRule(index)" />
            <el-button :icon="Delete" size="small" type="danger" @click="deleteRule(index)" />
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑规则对话框 -->
    <BaseDialog
      v-model="showAddDialog"
      :title="editingIndex === -1 ? '添加思考块规则' : '编辑思考块规则'"
      width="500px"
      @close="handleDialogClose"
    >
      <el-form :model="editingRule" label-width="100px" label-position="left">
        <el-form-item label="规则ID">
          <el-input v-model="editingRule.id" placeholder="如: gugu-think" :disabled="editingIndex !== -1" />
          <div class="form-tip">规则的唯一标识，创建后不可修改</div>
        </el-form-item>

        <el-form-item label="XML标签名">
          <el-input v-model="editingRule.tagName" placeholder="如: guguthink" />
          <div class="form-tip">用于识别的XML标签名称（不含尖括号）</div>
        </el-form-item>

        <el-form-item label="显示名称">
          <el-input v-model="editingRule.displayName" placeholder="如: 咕咕的思考" />
          <div class="form-tip">在UI中显示的友好名称</div>
        </el-form-item>

        <el-form-item label="默认状态">
          <el-switch v-model="editingRule.collapsedByDefault" active-text="折叠" inactive-text="展开" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="handleDialogClose">取消</el-button>
        <el-button type="primary" @click="saveRule">
          {{ editingIndex === -1 ? "添加" : "保存" }}
        </el-button>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Plus, Edit, Delete, ArrowDown } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import type { LlmThinkRule } from "../types";
import BaseDialog from "@/components/common/BaseDialog.vue";
import customMessage from "@/utils/customMessage";

// Props
const props = defineProps<{
  modelValue: LlmThinkRule[];
}>();

// Emits
const emit = defineEmits<{
  "update:modelValue": [rules: LlmThinkRule[]];
}>();

// 预设规则定义
const PRESET_RULES: LlmThinkRule[] = [
  {
    id: "deepseek-think",
    kind: "xml_tag",
    tagName: "think",
    displayName: "思考过程",
    collapsedByDefault: true,
  },
  {
    id: "claude-think",
    kind: "xml_tag",
    tagName: "thinking",
    displayName: "思考过程",
    collapsedByDefault: true,
  },
  {
    id: "gugu-think",
    kind: "xml_tag",
    tagName: "guguthink",
    displayName: "咕咕的思考",
    collapsedByDefault: true,
  },
];

// 本地规则列表（使用独立副本，避免直接修改父级数据）
const localRules = ref<LlmThinkRule[]>([]);

// 同步外部变化到本地
watch(
  () => props.modelValue,
  (newVal) => {
    // 使用浅拷贝数组 + 对象，避免和父级共享引用
    localRules.value = newVal.map((rule) => ({ ...rule }));
  },
  { immediate: true, deep: true }
);

// 将本地变更同步回父组件
function emitRulesUpdate() {
  emit(
    "update:modelValue",
    localRules.value.map((rule) => ({ ...rule }))
  );
}

// 对话框状态
const showAddDialog = ref(false);
const editingIndex = ref(-1);
const editingRule = ref<LlmThinkRule>({
  id: "",
  kind: "xml_tag",
  tagName: "",
  displayName: "",
  collapsedByDefault: true,
});

// 重置编辑表单
function resetEditingRule() {
  editingRule.value = {
    id: "",
    kind: "xml_tag",
    tagName: "",
    displayName: "",
    collapsedByDefault: true,
  };
  editingIndex.value = -1;
}

// 编辑规则
function editRule(index: number) {
  editingIndex.value = index;
  editingRule.value = { ...localRules.value[index] };
  showAddDialog.value = true;
}

// 处理对话框关闭（取消按钮或 ESC 键）
function handleDialogClose() {
  showAddDialog.value = false;
  resetEditingRule();
}

// 保存规则
function saveRule() {
  // 验证
  if (!editingRule.value.id.trim()) {
    customMessage.warning("请输入规则ID");
    return;
  }
  if (!editingRule.value.tagName.trim()) {
    customMessage.warning("请输入XML标签名");
    return;
  }
  if (!editingRule.value.displayName.trim()) {
    customMessage.warning("请输入显示名称");
    return;
  }

  // 检查ID是否重复（除了当前编辑的规则）
  const isDuplicate = localRules.value.some((r, idx) => r.id === editingRule.value.id && idx !== editingIndex.value);
  if (isDuplicate) {
    customMessage.warning("规则ID已存在，请使用其他ID");
    return;
  }

  // 保存
  if (editingIndex.value === -1) {
    // 新增
    localRules.value.push({ ...editingRule.value });
    customMessage.success("规则添加成功");
  } else {
    // 更新
    localRules.value[editingIndex.value] = { ...editingRule.value };
    customMessage.success("规则更新成功");
  }

  // 将更新后的规则同步给父组件
  emitRulesUpdate();

  showAddDialog.value = false;
  resetEditingRule();
}

// 处理预设命令
function handlePresetCommand(preset: LlmThinkRule) {
  if (localRules.value.some((r) => r.id === preset.id)) {
    customMessage.warning("该预设规则已存在");
    return;
  }
  localRules.value.push({ ...preset });
  emitRulesUpdate();
  customMessage.success(`已添加预设: ${preset.displayName}`);
}

// 重置为默认
function resetToDefault() {
  ElMessageBox.confirm("确定要重置所有规则吗？这将清空当前所有自定义配置并恢复预设规则。", "确认重置", {
    confirmButtonText: "确定重置",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      localRules.value = PRESET_RULES.map((r) => ({ ...r }));
      emitRulesUpdate();
      customMessage.success("已重置为默认规则");
    })
    .catch(() => {});
}

// 删除规则
function deleteRule(index: number) {
  const rule = localRules.value[index];
  ElMessageBox.confirm(`确定要删除规则"${rule.displayName}"吗？`, "确认删除", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      localRules.value.splice(index, 1);
      // 将删除后的规则同步给父组件
      emitRulesUpdate();
      customMessage.success("规则已删除");
    })
    .catch(() => {
      // 用户取消
    });
}
</script>

<style scoped>
.llm-think-rules-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  width: 100%;
}

.rules-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.rules-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rule-item {
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.rule-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.rule-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.rule-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.rule-tag {
  flex-shrink: 0;
}

.rule-tag code {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  padding: 6px 10px;
  background: var(--input-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--el-color-primary);
  font-weight: 500;
}

.rule-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.rule-display-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  line-height: 1.4;
}

.rule-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.rule-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-items: center;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.5;
}
</style>
