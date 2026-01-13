<template>
  <div class="preset-rule-manager">
    <!-- 左侧面板：预设选择 + 规则列表 -->
    <InfoCard class="left-panel" :bare="true">
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
          <el-tooltip content="创建一个新的正则预设" placement="top">
            <el-button :icon="Plus" @click="handleCreatePreset" size="small">新建</el-button>
          </el-tooltip>
          <el-tooltip
            :content="!store.activePresetId ? '请先选择一个预设' : '复制当前预设'"
            placement="top"
          >
            <span>
              <el-button
                :icon="CopyDocument"
                @click="handleDuplicatePreset"
                size="small"
                :disabled="!store.activePresetId"
                >复制</el-button
              >
            </span>
          </el-tooltip>
          <el-tooltip
            :content="!store.activePresetId ? '请先选择一个预设' : '重命名当前预设'"
            placement="top"
          >
            <span>
              <el-button @click="handleRenamePreset" size="small" :disabled="!store.activePresetId"
                >重命名</el-button
              >
            </span>
          </el-tooltip>
          <el-tooltip
            :content="
              !store.activePresetId
                ? '请先选择一个预设'
                : store.presets.length <= 1
                  ? '至少需要保留一个预设'
                  : '删除当前预设'
            "
            placement="top"
          >
            <span>
              <el-button
                :icon="Delete"
                @click="handleDeletePreset"
                size="small"
                :disabled="!store.activePresetId || store.presets.length <= 1"
                >删除</el-button
              >
            </span>
          </el-tooltip>
        </div>

        <div class="preset-io-actions">
          <el-tooltip content="从 JSON 文件导入预设或规则" placement="top">
            <el-button @click="importPreset" size="small" style="width: 100%">
              <el-icon><Upload /></el-icon>
              从文件导入
            </el-button>
          </el-tooltip>
          <el-tooltip content="从剪贴板粘贴 JSON 内容导入" placement="top">
            <el-button @click="importFromClipboard" size="small" style="width: 100%">
              <el-icon><DocumentCopy /></el-icon>
              从剪贴板导入
            </el-button>
          </el-tooltip>
          <el-tooltip
            :content="!store.activePresetId ? '请先选择一个预设' : '将当前预设导出为 JSON 文件'"
            placement="top"
          >
            <span style="width: 100%">
              <el-button
                @click="exportCurrentPreset"
                size="small"
                style="width: 100%"
                :disabled="!store.activePresetId"
              >
                <el-icon><Download /></el-icon>
                导出预设
              </el-button>
            </span>
          </el-tooltip>
        </div>
      </div>

      <!-- 规则列表区域 -->
      <div class="rules-section">
        <div class="rules-header">
          <span class="section-title"
            >规则列表 ({{ filteredRules.length }}/{{ currentRules.length }})</span
          >
          <el-tooltip content="添加一条新的正则规则" placement="top">
            <el-button :icon="Plus" @click="handleAddRule" type="primary" size="small"
              >添加规则</el-button
            >
          </el-tooltip>
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
              drag-class="sortable-drag"
              :force-fallback="true"
              :fallback-tolerance="3"
              :animation="200"
            >
              <div
                v-for="rule in filteredRules"
                :key="rule.id"
                class="rule-item"
                :class="{ active: selectedRuleId === rule.id, disabled: !rule.enabled }"
                @click="selectRule(rule.id)"
              >
                <el-tooltip content="拖动以调整规则顺序" placement="top">
                  <el-icon class="rule-drag-handle"><Rank /></el-icon>
                </el-tooltip>
                <el-tooltip
                  :content="rule.enabled ? '点击禁用此规则' : '点击启用此规则'"
                  placement="top"
                >
                  <el-checkbox
                    v-model="rule.enabled"
                    @change="onRuleEnabledChange(rule.id)"
                    @click.stop
                  />
                </el-tooltip>
                <div class="rule-content">
                  <div class="rule-name">{{ rule.name || rule.regex || "(未命名规则)" }}</div>
                  <div class="rule-preview">
                    {{ rule.regex || "(空正则)" }} → {{ rule.replacement || "(空替换)" }}
                  </div>
                </div>
                <el-tooltip content="删除此规则" placement="top">
                  <el-button
                    :icon="Delete"
                    @click.stop="handleRemoveRule(getOriginalIndex(rule.id))"
                    text
                    circle
                    size="small"
                    class="rule-delete-btn"
                  />
                </el-tooltip>
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
    </InfoCard>

    <!-- 右侧面板：规则编辑 + 实时预览 -->
    <InfoCard class="right-panel" :bare="true">
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
              ref="regexInputRef"
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
            <!-- Rust 兼容性提示 -->
            <div v-if="rustValidation && !rustValidation.isValid" class="rust-error-hint">
              <el-icon><WarningFilled /></el-icon>
              <span>Rust 后端不兼容: {{ rustValidation.errorMessage }}</span>
            </div>
            <div v-else-if="rustValidation && rustValidation.warning" class="rust-warning-hint">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ rustValidation.warning }}</span>
            </div>
            <div v-else-if="rustValidation && rustValidation.isValid" class="rust-success-hint">
              <el-icon><CircleCheck /></el-icon>
              <span>Rust 后端兼容 ✓</span>
            </div>
            <div class="quick-patterns">
              <div class="quick-patterns-label">快捷规则:</div>
              <div class="quick-patterns-list">
                <el-tooltip
                  v-for="pattern in quickPatterns"
                  :key="pattern.value"
                  :content="pattern.desc"
                  placement="top"
                >
                  <el-tag
                    class="quick-pattern-tag"
                    size="small"
                    @click="insertPattern(pattern.value)"
                  >
                    {{ pattern.label }}
                  </el-tag>
                </el-tooltip>
              </div>
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
    </InfoCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { ElMessageBox } from "element-plus";
import InfoCard from "@/components/common/InfoCard.vue";
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
  CircleCheck,
} from "@element-plus/icons-vue";
import { VueDraggableNext } from "vue-draggable-next";
import { open as openFile, save as saveFile } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { usePresetStore } from "../stores/store";
import type { RegexPreset } from "../types";
import debounce from "lodash/debounce";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { parseRegexPattern } from "../core/engine";
import { invoke } from "@tauri-apps/api/core";

const store = usePresetStore();
const logger = createModuleLogger("PresetManager");
const errorHandler = createModuleErrorHandler("PresetManager");

// Rust 验证结果类型
interface RegexValidation {
  isValid: boolean;
  errorMessage?: string;
  parsedPattern?: string;
  parsedFlags?: string;
  warning?: string;
}

// ===== 状态 =====
const selectedRuleId = ref<string | null>(null);
const testInput = ref("示例文本：Hello World 123\n测试正则匹配功能");
const regexError = ref<string | null>(null);
const rustValidation = ref<RegexValidation | null>(null); // Rust 验证结果
const matchCount = ref<number | null>(null);
const localRules = ref<any[]>([]); // 本地规则列表副本，用于 v-model
const searchKeyword = ref(""); // 搜索关键词
const regexInputRef = ref<any>(null); // 正则输入框的引用

// 快捷常用规则列表
const quickPatterns = [
  { label: "数字", value: "\\d+", desc: "匹配一个或多个数字" },
  { label: "字母", value: "[a-zA-Z]+", desc: "匹配一个或多个字母" },
  { label: "中文", value: "[\\u4e00-\\u9fa5]+", desc: "匹配一个或多个中文字符" },
  { label: "空白", value: "\\s+", desc: "匹配一个或多个空白字符" },
  { label: "邮箱", value: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", desc: "匹配邮箱地址" },
  { label: "URL", value: "https?://[^\\s]+", desc: "匹配 HTTP/HTTPS URL" },
  { label: "IP地址", value: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b", desc: "匹配 IPv4 地址" },
  { label: "手机号", value: "1[3-9]\\d{9}", desc: "匹配中国大陆手机号" },
  { label: "日期", value: "\\d{4}-\\d{2}-\\d{2}", desc: "匹配 YYYY-MM-DD 格式日期" },
  { label: "时间", value: "\\d{2}:\\d{2}(:\\d{2})?", desc: "匹配 HH:MM 或 HH:MM:SS 格式时间" },
  { label: "HTML标签", value: "<[^>]+>", desc: "匹配 HTML 标签" },
  { label: "空行", value: "^\\s*$", desc: "匹配空行或只包含空白的行" },
  {
    label: "引号内(双)",
    value: '"([^"]*)"',
    desc: "匹配双引号之间的内容（不含引号），捕获组$1为内容",
  },
  {
    label: "引号内(单)",
    value: "'([^']*)'",
    desc: "匹配单引号之间的内容（不含引号），捕获组$1为内容",
  },
  {
    label: "标记间(不含)",
    value: "(?<=START)(.*?)(?=END)",
    desc: "匹配 START 和 END 之间的内容（不含标记），需手动替换 START/END",
  },
  {
    label: "标记间(包含)",
    value: "START(.*?)END",
    desc: "匹配 START 和 END 之间的内容（包含标记），需手动替换 START/END",
  },
  {
    label: "跨行区间(含标记)",
    value: "/START.*?END/gs",
    desc: "匹配 START 到 END 的所有内容（跨行），需手动替换 START/END",
  },
  { label: "UUID", value: "[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", desc: "匹配 UUID" },
];

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
    errorHandler.error(error, "导入预设失败");
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
    errorHandler.error(error, "导入失败");
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
    errorHandler.error(error, "导出预设失败");
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

// Rust 兼容性验证（防抖）
const validateRustCompatibility = debounce(async () => {
  if (!selectedRule.value?.regex) {
    rustValidation.value = null;
    return;
  }

  try {
    const result = await invoke<RegexValidation>("validate_regex_pattern", {
      regex: selectedRule.value.regex,
    });
    rustValidation.value = result;

    if (!result.isValid) {
      logger.warn("正则表达式 Rust 兼容性检测失败", {
        regex: selectedRule.value.regex,
        error: result.errorMessage,
      });
    } else if (result.warning) {
      logger.debug("正则表达式 Rust 兼容性警告", {
        regex: selectedRule.value.regex,
        warning: result.warning,
      });
    }
  } catch (error: any) {
    errorHandler.handle(error, {
      userMessage: "调用 Rust 验证命令失败",
      context: { error: error.message },
      showToUser: false,
    });
    rustValidation.value = null;
  }
}, 300);

// 规则编辑时的防抖保存
const onRuleEdit = debounce(() => {
  if (store.activePresetId) {
    store.touchPreset(store.activePresetId);
  }
  // 同时触发 Rust 兼容性验证
  validateRustCompatibility();
}, 500);

// 获取规则在原始列表中的索引（用于删除操作）
const getOriginalIndex = (ruleId: string): number => {
  return localRules.value.findIndex((r) => r.id === ruleId);
};

// 插入快捷规则到光标位置
const insertPattern = (pattern: string) => {
  if (!selectedRule.value) return;

  const textarea = regexInputRef.value?.$el?.querySelector("textarea");
  if (!textarea) {
    // 如果无法获取 textarea，直接追加到末尾
    selectedRule.value.regex = (selectedRule.value.regex || "") + pattern;
    onRuleEdit();
    return;
  }

  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const currentValue = selectedRule.value.regex || "";

  // 在光标位置插入规则
  const newValue = currentValue.substring(0, start) + pattern + currentValue.substring(end);
  selectedRule.value.regex = newValue;

  // 触发保存
  onRuleEdit();

  // 设置新的光标位置（插入内容之后）
  setTimeout(() => {
    const newPos = start + pattern.length;
    textarea.focus();
    textarea.setSelectionRange(newPos, newPos);
  }, 0);
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

.sortable-drag {
  opacity: 0.8;
  transform: rotate(2deg);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  transition: none !important;
  background-color: var(--card-bg);
  z-index: 9999;
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

.rust-error-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #f56c6c;
  font-size: 12px;
  margin-top: 4px;
  padding: 8px;
  background-color: color-mix(in srgb, #f56c6c 10%, transparent);
  border-left: 3px solid #f56c6c;
  border-radius: 4px;
}

.rust-warning-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e6a23c;
  font-size: 12px;
  margin-top: 4px;
  padding: 8px;
  background-color: color-mix(in srgb, #e6a23c 10%, transparent);
  border-left: 3px solid #e6a23c;
  border-radius: 4px;
}

.rust-success-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #67c23a;
  font-size: 12px;
  margin-top: 4px;
  padding: 8px;
  background-color: color-mix(in srgb, #67c23a 10%, transparent);
  border-left: 3px solid #67c23a;
  border-radius: 4px;
}

.quick-patterns {
  margin-top: 8px;
  padding: 8px;
  background-color: var(--container-bg);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.quick-patterns-label {
  font-size: 12px;
  color: var(--text-color-light);
  margin-bottom: 6px;
  font-weight: 500;
}

.quick-patterns-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

:deep(.quick-pattern-tag.el-tag) {
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  background-color: color-mix(in srgb, var(--primary-color) 15%, transparent) !important;
  border-color: var(--primary-color) !important;
  color: var(--primary-color) !important;
}

:deep(.quick-pattern-tag.el-tag:hover) {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  background-color: color-mix(in srgb, var(--primary-color) 25%, transparent) !important;
}

:deep(.quick-pattern-tag.el-tag:active) {
  transform: translateY(0);
  opacity: 0.8;
  background-color: color-mix(in srgb, var(--primary-color) 35%, transparent) !important;
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
