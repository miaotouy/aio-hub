<template>
  <div class="preset-rule-manager">
    <!-- 左侧面板：预设选择 + 规则列表 -->
    <el-card class="left-panel" shadow="never">
      <!-- 预设管理区域 -->
      <div class="preset-section">
        <div class="preset-header">
          <span class="section-title">预设管理</span>
        </div>

        <div class="preset-selector">
          <el-select
            v-model="store.activePresetId"
            placeholder="选择预设"
            @change="onPresetChange"
            style="width: 100%"
          >
            <el-option
              v-for="preset in store.presets"
              :key="preset.id"
              :label="preset.name"
              :value="preset.id"
            >
              <div class="preset-option">
                <span class="preset-name">{{ preset.name }}</span>
                <span v-if="preset.description" class="preset-desc">{{ preset.description }}</span>
              </div>
            </el-option>
          </el-select>
        </div>

        <div class="preset-actions">
          <el-button :icon="Plus" @click="handleCreatePreset" size="small">新建</el-button>
          <el-button
            :icon="CopyDocument"
            @click="handleDuplicatePreset"
            size="small"
            :disabled="!store.activePresetId"
            >复制</el-button
          >
          <el-button @click="handleRenamePreset" size="small" :disabled="!store.activePresetId"
            >重命名</el-button
          >
          <el-button
            :icon="Delete"
            @click="handleDeletePreset"
            size="small"
            :disabled="!store.activePresetId || store.presets.length <= 1"
            >删除</el-button
          >
        </div>

        <div class="preset-io-actions">
          <el-button @click="importPreset" size="small" style="width: 100%">
            <el-icon><Upload /></el-icon>
            从文件导入
          </el-button>
          <el-button @click="importFromClipboard" size="small" style="width: 100%">
            <el-icon><DocumentCopy /></el-icon>
            从剪贴板导入
          </el-button>
          <el-button
            @click="exportCurrentPreset"
            size="small"
            style="width: 100%"
            :disabled="!store.activePresetId"
          >
            <el-icon><Download /></el-icon>
            导出预设
          </el-button>
        </div>
      </div>

      <!-- 规则列表区域 -->
      <div class="rules-section">
        <div class="rules-header">
          <span class="section-title"
            >规则列表 ({{ filteredRules.length }}/{{ currentRules.length }})</span
          >
          <el-button :icon="Plus" @click="handleAddRule" type="primary" size="small"
            >添加规则</el-button
          >
        </div>

        <!-- 搜索框 -->
        <div class="rules-search">
          <el-input
            v-model="searchKeyword"
            :prefix-icon="Search"
            placeholder="搜索规则名称、正则或替换内容..."
            clearable
            size="small"
          />
        </div>

        <div class="rules-list-container">
          <el-scrollbar v-if="filteredRules.length > 0" height="100%">
            <VueDraggableNext
              v-model="localRules"
              item-key="id"
              handle=".rule-drag-handle"
              @start="onDragStart"
              @end="onRulesReordered"
              class="rules-list"
              ghost-class="ghost-rule"
              drag-class="drag-rule"
              :force-fallback="true"
            >
              <div
                v-for="rule in filteredRules"
                :key="rule.id"
                class="rule-item"
                :class="{ active: selectedRuleId === rule.id, disabled: !rule.enabled }"
                @click="selectRule(rule.id)"
              >
                <el-icon class="rule-drag-handle"><Rank /></el-icon>
                <el-checkbox
                  v-model="rule.enabled"
                  @change="onRuleEnabledChange(rule.id)"
                  @click.stop
                />
                <div class="rule-content">
                  <div class="rule-name">{{ rule.name || rule.regex || "(未命名规则)" }}</div>
                  <div class="rule-preview">
                    {{ rule.regex || "(空正则)" }} → {{ rule.replacement || "(空替换)" }}
                  </div>
                </div>
                <el-button
                  :icon="Delete"
                  @click.stop="handleRemoveRule(getOriginalIndex(rule.id))"
                  text
                  circle
                  size="small"
                  class="rule-delete-btn"
                />
              </div>
            </VueDraggableNext>
          </el-scrollbar>
          <el-empty
            v-else-if="currentRules.length === 0"
            description="暂无规则，点击'添加规则'按钮创建"
          />
          <el-empty v-else description="无匹配的规则" />
        </div>
      </div>
    </el-card>

    <!-- 右侧面板：规则编辑 + 实时预览 -->
    <el-card class="right-panel" shadow="never">
      <div v-if="selectedRule" class="editor-container">
        <!-- 规则编辑区 -->
        <div class="editor-section">
          <div class="section-title">规则编辑</div>

          <div class="editor-field">
            <label>规则名称</label>
            <el-input
              v-model="selectedRule.name"
              placeholder="输入规则名称，例如：移除空行"
              @input="onRuleEdit"
            />
          </div>

          <div class="editor-field">
            <label>正则表达式</label>
            <el-input
              v-model="selectedRule.regex"
              type="textarea"
              :rows="3"
              placeholder="输入正则表达式，例如：\d+"
              @input="onRuleEdit"
            />
            <div v-if="regexError" class="error-hint">
              <el-icon><WarningFilled /></el-icon>
              {{ regexError }}
            </div>
          </div>

          <div class="editor-field">
            <label>替换内容</label>
            <el-input
              v-model="selectedRule.replacement"
              type="textarea"
              :rows="2"
              placeholder="输入替换内容，支持捕获组 $1, $2 等"
              @input="onRuleEdit"
            />
          </div>
        </div>

        <!-- 测试区 -->
        <div class="test-section">
          <div class="section-title">实时测试</div>

          <div class="test-field">
            <label>测试输入</label>
            <el-input v-model="testInput" type="textarea" :rows="4" placeholder="输入测试文本..." />
          </div>

          <div class="test-field">
            <label>
              输出预览
              <span v-if="matchCount !== null" class="match-info">
                (匹配 {{ matchCount }} 次)
              </span>
            </label>
            <div class="preview-output" v-html="highlightedOutput"></div>
          </div>
        </div>
      </div>

      <!-- 未选中规则时的提示 -->
      <el-empty v-else description="请从左侧选择一条规则进行编辑和测试" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import {
  Plus,
  Delete,
  CopyDocument,
  DocumentCopy,
  Rank,
  Upload,
  Download,
  WarningFilled,
  Search,
} from "@element-plus/icons-vue";
import { VueDraggableNext } from "vue-draggable-next";
import { open as openFile, save as saveFile } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { usePresetStore } from "./store";
import type { RegexPreset } from "./types";
import debounce from "lodash/debounce";
import { createModuleLogger } from "@utils/logger";
import { parseRegexPattern } from "./engine";

const store = usePresetStore();
const logger = createModuleLogger("PresetManager");

// ===== 状态 =====
const selectedRuleId = ref<string | null>(null);
const testInput = ref("示例文本：Hello World 123\n测试正则匹配功能");
const regexError = ref<string | null>(null);
const matchCount = ref<number | null>(null);
const localRules = ref<any[]>([]); // 本地规则列表副本，用于 v-model
const searchKeyword = ref(""); // 搜索关键词

// ===== 计算属性 =====
const currentRules = computed(() => store.activePreset?.rules || []);

// 过滤后的规则列表
const filteredRules = computed(() => {
  if (!searchKeyword.value.trim()) {
    return localRules.value;
  }

  const keyword = searchKeyword.value.toLowerCase();
  return localRules.value.filter((rule) => {
    const name = (rule.name || "").toLowerCase();
    const regex = (rule.regex || "").toLowerCase();
    const replacement = (rule.replacement || "").toLowerCase();

    return name.includes(keyword) || regex.includes(keyword) || replacement.includes(keyword);
  });
});

// 监听 store 中激活预设的变化，同步规则到本地副本
watch(
  () => store.activePreset,
  (newPreset) => {
    // 使用 deep copy 确保本地副本是独立的
    localRules.value = newPreset ? JSON.parse(JSON.stringify(newPreset.rules)) : [];
  },
  { immediate: true, deep: true }
);

const selectedRule = computed(() => {
  if (!selectedRuleId.value || !store.activePreset) return null;
  return store.activePreset.rules.find((r) => r.id === selectedRuleId.value);
});

const highlightedOutput = computed(() => {
  if (!selectedRule.value || !testInput.value) {
    matchCount.value = null;
    return '<div class="empty-preview">输入测试文本以查看预览...</div>';
  }

  const { regex, replacement } = selectedRule.value;
  if (!regex) {
    matchCount.value = null;
    return '<div class="empty-preview">请输入正则表达式...</div>';
  }
  try {
    regexError.value = null;
    const { pattern, flags } = parseRegexPattern(regex);
    const re = new RegExp(pattern, flags);

    // 计算匹配次数
    const matches = testInput.value.match(re);
    matchCount.value = matches ? matches.length : 0;

    // 如果有替换内容，显示替换结果
    if (replacement !== undefined && replacement !== "") {
      const result = testInput.value.replace(re, replacement);
      // 高亮显示修改的部分
      return escapeHtml(result).replace(
        new RegExp(escapeRegex(replacement), flags.includes("g") ? "g" : ""),
        `<mark class="highlight-replacement">${escapeHtml(replacement)}</mark>`
      );
    }

    // 否则只高亮匹配项
    const result = testInput.value.replace(re, (match) => {
      return `<mark class="highlight-match">${escapeHtml(match)}</mark>`;
    });

    return result || testInput.value;
  } catch (error: any) {
    regexError.value = error.message;
    matchCount.value = null;
    return `<div class="error-preview">正则表达式错误: ${escapeHtml(error.message)}</div>`;
  }
});

// ===== 生命周期 =====
onMounted(async () => {
  await store.loadPresets();
  // 默认选中第一条规则
  if (currentRules.value.length > 0) {
    selectedRuleId.value = currentRules.value[0].id;
  }
});

// ===== 预设操作 =====
const onPresetChange = () => {
  // 切换预设时，自动选中第一条规则
  if (currentRules.value.length > 0) {
    selectedRuleId.value = currentRules.value[0].id;
  } else {
    selectedRuleId.value = null;
  }
};

const handleCreatePreset = async () => {
  const { value: name } = await ElMessageBox.prompt("请输入预设名称", "新建预设", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    inputPattern: /.+/,
    inputErrorMessage: "预设名称不能为空",
  }).catch(() => ({ value: null })); // 捕获取消操作

  if (name) {
    store.createPreset(name.trim());
    customMessage.success("预设创建成功！");
  }
};

const handleDuplicatePreset = async () => {
  if (!store.activePresetId) return;
  const currentPreset = store.activePreset;
  if (!currentPreset) return;

  const { value: name } = await ElMessageBox.prompt("请输入新预设名称", "复制预设", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    inputValue: `${currentPreset.name} (副本)`,
    inputPattern: /.+/,
    inputErrorMessage: "预设名称不能为空",
  }).catch(() => ({ value: null })); // 捕获取消操作

  if (name) {
    store.duplicatePreset(store.activePresetId, name.trim());
    customMessage.success("预设复制成功！");
  }
};

const handleRenamePreset = async () => {
  if (!store.activePresetId) return;
  const currentPreset = store.activePreset;
  if (!currentPreset) return;

  const { value: name } = await ElMessageBox.prompt("请输入新名称", "重命名预设", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    inputValue: currentPreset.name,
    inputPattern: /.+/,
    inputErrorMessage: "预设名称不能为空",
  }).catch(() => ({ value: null })); // 捕获取消操作

  if (name) {
    store.renamePreset(store.activePresetId, name.trim());
    customMessage.success("预设重命名成功！");
  }
};

const handleDeletePreset = async () => {
  if (!store.activePresetId || store.presets.length <= 1) {
    customMessage.warning("至少需要保留一个预设");
    return;
  }

  const currentPreset = store.activePreset;
  if (!currentPreset) return;

  try {
    await ElMessageBox.confirm(`确定要删除预设"${currentPreset.name}"吗？`, "删除预设", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    store.deletePreset(store.activePresetId);
    customMessage.success("预设删除成功！");
    selectedRuleId.value = null;
  } catch (error: any) {
    // 用户取消删除操作，不作处理
    logger.debug("用户取消删除预设操作", {
      presetName: currentPreset.name,
      presetId: store.activePresetId,
    });
  }
};

const importPreset = async () => {
  try {
    const filePath = await openFile({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    }).catch(() => null); // 捕获取消操作

    if (!filePath) return;

    const content = await readTextFile(filePath as string);
    const importedPreset: RegexPreset = JSON.parse(content);

    // 验证导入的数据结构
    if (!importedPreset.name || !Array.isArray(importedPreset.rules)) {
      throw new Error("无效的预设格式");
    }

    // 创建新预设
    const newPreset = store.createPreset(importedPreset.name, importedPreset.description);

    // 清空默认规则并导入规则
    if (newPreset && store.activePresetId) {
      const preset = store.getPresetById(store.activePresetId);
      if (preset) {
        preset.rules = [];
        await store.importRules(store.activePresetId, importedPreset.rules);
      }
    }

    customMessage.success(`成功导入预设: ${importedPreset.name}`);
  } catch (error: any) {
    customMessage.error(`导入预设失败: ${error.message}`);
  }
};

const importFromClipboard = async () => {
  try {
    const { value: jsonContent } = await ElMessageBox.prompt(
      "请粘贴预设的 JSON 内容（可以是完整的预设，或者只包含规则数组）",
      "从剪贴板导入",
      {
        confirmButtonText: "导入",
        cancelButtonText: "取消",
        inputType: "textarea",
        inputPlaceholder: "粘贴 JSON 内容...",
        inputValidator: (value) => {
          if (!value || !value.trim()) {
            return "请输入 JSON 内容";
          }
          try {
            JSON.parse(value);
            return true;
          } catch {
            return "JSON 格式无效，请检查格式";
          }
        },
      }
    ).catch(() => ({ value: null }));

    if (!jsonContent) return;

    const parsedData = JSON.parse(jsonContent.trim());

    // 判断导入的是完整预设还是规则数组
    if (Array.isArray(parsedData)) {
      // 导入为规则数组
      if (!store.activePresetId) {
        customMessage.warning("请先选择一个预设");
        return;
      }

      // 验证规则格式
      const isValidRules = parsedData.every(
        (rule) => typeof rule === "object" && ("regex" in rule || "name" in rule)
      );

      if (!isValidRules) {
        throw new Error("规则格式无效");
      }

      await store.importRules(store.activePresetId, parsedData);
      customMessage.success(`成功导入 ${parsedData.length} 条规则到当前预设`);
    } else if (parsedData.name && Array.isArray(parsedData.rules)) {
      // 导入为完整预设
      const importedPreset: RegexPreset = parsedData;

      // 创建新预设
      const newPreset = store.createPreset(importedPreset.name, importedPreset.description);

      // 清空默认规则并导入规则
      if (newPreset && store.activePresetId) {
        const preset = store.getPresetById(store.activePresetId);
        if (preset) {
          preset.rules = [];
          await store.importRules(store.activePresetId, importedPreset.rules);
        }
      }

      customMessage.success(`成功导入预设: ${importedPreset.name}`);
    } else {
      throw new Error("无效的格式：必须是规则数组或包含 name 和 rules 的预设对象");
    }
  } catch (error: any) {
    customMessage.error(`导入失败: ${error.message}`);
  }
};

const exportCurrentPreset = async () => {
  if (!store.activePresetId) return;
  const currentPreset = store.activePreset;
  if (!currentPreset) return;

  try {
    const filePath = await saveFile({
      defaultPath: `${currentPreset.name}_${Date.now()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    }).catch(() => null); // 捕获取消操作

    if (filePath) {
      const json = store.exportPreset(store.activePresetId);
      if (json) {
        await writeTextFile(filePath, json);
        customMessage.success("预设已成功导出！");
      }
    }
  } catch (error: any) {
    customMessage.error(`导出预设失败: ${error.message}`);
  }
};

// ===== 规则操作 =====
const selectRule = (ruleId: string) => {
  selectedRuleId.value = ruleId;
};

const handleAddRule = () => {
  if (!store.activePresetId) return;

  const newRule = store.addRule(store.activePresetId);
  if (newRule) {
    selectedRuleId.value = newRule.id;
    customMessage.success("已添加新规则");
  }
};

const handleRemoveRule = async (index: number) => {
  if (!store.activePresetId || !store.activePreset) return;

  const rule = currentRules.value[index];
  if (!rule) return;

  if (currentRules.value.length === 1) {
    const { value } = await ElMessageBox.confirm(
      "这是最后一条规则，删除后会自动添加一条空规则。确定要继续吗？",
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    ).catch(() => ({ value: false }));

    if (!value) return;
  }

  const isDeleted = store.deleteRule(store.activePresetId, rule.id);

  if (isDeleted) {
    // 如果删除的是选中的规则，选中下一条
    if (selectedRuleId.value === rule.id) {
      const nextRule = currentRules.value[Math.min(index, currentRules.value.length - 1)];
      selectedRuleId.value = nextRule ? nextRule.id : null;
    }

    // 如果没有规则了，自动添加一条
    if (currentRules.value.length === 0) {
      const newRule = store.addRule(store.activePresetId);
      if (newRule) {
        selectedRuleId.value = newRule.id;
      }
    }

    customMessage.success("规则已删除");
  }
};

const onRuleEnabledChange = (ruleId: string) => {
  if (!store.activePresetId) return;
  store.toggleRuleEnabled(store.activePresetId, ruleId);
};

// 拖拽事件处理
const onDragStart = () => {
  logger.debug("开始拖拽规则", {
    presetId: store.activePresetId,
    presetName: store.activePreset?.name,
    ruleCount: localRules.value.length,
  });
};

const onRulesReordered = () => {
  logger.debug("拖拽结束，规则已重新排序", {
    presetId: store.activePresetId,
    presetName: store.activePreset?.name,
    newOrder: localRules.value.map((r) => ({ id: r.id, name: r.name || r.regex || "(未命名)" })),
    ruleCount: localRules.value.length,
  });
  if (!store.activePresetId) return;
  // 将本地排序后的结果同步回 store
  store.reorderRules(store.activePresetId, localRules.value);
};

// 规则编辑时的防抖保存
const onRuleEdit = debounce(() => {
  if (store.activePresetId) {
    store.touchPreset(store.activePresetId);
  }
}, 500);

// 获取规则在原始列表中的索引（用于删除操作）
const getOriginalIndex = (ruleId: string): number => {
  return localRules.value.findIndex((r) => r.id === ruleId);
};

// ===== 工具函数 =====
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
    "\n": "<br>",
  };
  return text.replace(/[&<>"'\n]/g, (m) => map[m]);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
</script>

<style scoped>
.preset-rule-manager {
  display: flex;
  gap: 20px;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  background-color: var(--bg-color);
}

/* 左侧面板 */
.left-panel {
  width: 35%;
  min-width: 300px;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
}

.left-panel :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  overflow: hidden;
}

/* 预设管理区 */
.preset-section {
  flex-shrink: 0;
  margin-bottom: 20px;
}

.preset-header {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.rules-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

.preset-selector {
  margin-bottom: 12px;
}

.preset-option {
  display: flex;
  flex-direction: column;
}

.preset-name {
  font-weight: 500;
  color: var(--text-color);
}

.preset-desc {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 2px;
}

.preset-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.preset-io-actions {
  display: flex;
  gap: 8px;
}

/* 规则列表区 */
.rules-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.rules-search {
  margin-bottom: 12px;
}

.rules-list-container {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--container-bg);
}

.rules-list {
  padding: 8px;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  margin-bottom: 8px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.rule-item.ghost-rule {
  opacity: 0.5;
  background: var(--primary-color-light);
}

.rule-item.drag-rule {
  opacity: 0.8;
  transform: rotate(2deg);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  transition: none !important;
}

.rule-item:hover {
  background-color: var(--container-bg);
  border-color: var(--primary-color-light);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.rule-item.active {
  background-color: var(--primary-color-light);
  border-color: var(--primary-color);
}

.rule-item.disabled {
  opacity: 0.5;
}

.rule-drag-handle {
  cursor: grab;
  color: var(--text-color-light);
  font-size: 16px;
  user-select: none;
}

.rule-drag-handle:active {
  cursor: grabbing;
}

.rule-content {
  flex: 1;
  min-width: 0;
}

.rule-name,
.rule-preview {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.rule-name {
  color: var(--text-color);
  font-weight: 500;
  margin-bottom: 2px;
}

.rule-preview {
  color: var(--text-color-light);
  font-family: monospace;
  font-size: 12px;
}

.rule-delete-btn {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.rule-item:hover .rule-delete-btn {
  opacity: 1;
}

/* 右侧面板 */
.right-panel {
  flex: 1;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
}

.right-panel :deep(.el-card__body) {
  height: 100%;
  padding: 20px;
  overflow-y: auto;
}

.editor-container {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.editor-section,
.test-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.editor-field,
.test-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.editor-field label,
.test-field label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.match-info {
  font-size: 12px;
  font-weight: normal;
  color: var(--primary-color);
  margin-left: 8px;
}

.error-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--error-color);
  font-size: 12px;
  margin-top: 4px;
}

.preview-output {
  min-height: 120px;
  max-height: 300px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--input-bg);
  color: var(--text-color);
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.preview-output :deep(mark.highlight-match) {
  background-color: #ffd700;
  color: #000;
  padding: 2px 4px;
  border-radius: 2px;
  font-weight: 500;
}

.preview-output :deep(mark.highlight-replacement) {
  background-color: #90ee90;
  color: #000;
  padding: 2px 4px;
  border-radius: 2px;
  font-weight: 500;
}

.empty-preview,
.error-preview {
  color: var(--text-color-light);
  font-style: italic;
  text-align: center;
  padding: 20px;
}

.error-preview {
  color: var(--error-color);
}
</style>
