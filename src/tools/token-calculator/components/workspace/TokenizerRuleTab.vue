<template>
  <div class="tokenizer-rule-tab">
    <!-- ============ 顶部说明 + 操作栏 ============ -->
    <div class="rule-header">
      <div class="rule-header-text">
        <h3 class="rule-title">
          <el-icon :size="16">
            <Connection />
          </el-icon>
          匹配规则
        </h3>
        <p class="rule-desc">
          用户规则优先于内置 metadata 匹配与 Profile 自带正则。<br />
          数字越大优先级越高，相同优先级按列表顺序匹配。
        </p>
      </div>
      <div class="rule-header-actions">
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">
          新建规则
        </el-button>
      </div>
    </div>

    <!-- ============ 主体两栏 ============ -->
    <div class="rule-body">
      <!-- 左栏：规则列表 -->
      <div class="rule-list-wrapper">
        <div class="rule-list-toolbar">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索 pattern / profile / 备注"
            clearable
            :prefix-icon="Search"
            style="width: 280px"
          />
          <span class="rule-stats">
            共 {{ filteredRules.length }} / {{ userRules.length }} 条
          </span>
        </div>

        <div class="rule-list">
          <div
            v-for="(rule, index) in sortedRules"
            :key="rule.id"
            class="rule-card"
            :class="{ disabled: rule.enabled === false }"
          >
            <div class="rule-card-header">
              <div class="rule-card-title">
                <el-tag size="small" type="info" effect="plain">
                  P{{ rule.priority ?? 0 }}
                </el-tag>
                <code class="rule-pattern" :title="rule.pattern">
                  {{ rule.pattern }}
                </code>
              </div>
              <div class="rule-card-actions">
                <el-tooltip content="上移" placement="top">
                  <el-button
                    :icon="Top"
                    size="small"
                    circle
                    text
                    :disabled="index === 0"
                    @click="adjustPriority(rule, 1)"
                  />
                </el-tooltip>
                <el-tooltip content="下移" placement="top">
                  <el-button
                    :icon="Bottom"
                    size="small"
                    circle
                    text
                    :disabled="index === sortedRules.length - 1"
                    @click="adjustPriority(rule, -1)"
                  />
                </el-tooltip>
                <el-tooltip
                  :content="rule.enabled === false ? '点击启用' : '点击禁用'"
                  placement="top"
                >
                  <el-switch
                    :model-value="rule.enabled !== false"
                    size="small"
                    @change="(v: boolean) => toggleEnabled(rule, v)"
                  />
                </el-tooltip>
                <el-tooltip content="编辑" placement="top">
                  <el-button
                    :icon="Edit"
                    size="small"
                    circle
                    text
                    @click="openEditDialog(rule)"
                  />
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-button
                    :icon="Delete"
                    size="small"
                    circle
                    text
                    type="danger"
                    @click="onDelete(rule)"
                  />
                </el-tooltip>
              </div>
            </div>

            <div class="rule-card-body">
              <div class="rule-target">
                <span class="meta-label">目标 Profile：</span>
                <span v-if="getProfileMeta(rule.profileId)" class="profile-ref">
                  <span class="profile-ref-name">
                    {{ getProfileMeta(rule.profileId)!.name }}
                  </span>
                  <code class="profile-ref-id">{{ rule.profileId }}</code>
                </span>
                <span v-else class="profile-missing">
                  <el-icon><WarningFilled /></el-icon>
                  Profile 不存在：{{ rule.profileId }}
                </span>
              </div>
              <p v-if="rule.description" class="rule-description">
                {{ rule.description }}
              </p>
            </div>
          </div>

          <div v-if="filteredRules.length === 0" class="rule-empty">
            <el-icon :size="32" color="var(--text-color-light)">
              <Connection />
            </el-icon>
            <p v-if="userRules.length === 0">还没有自定义规则</p>
            <p v-else>没有匹配的规则</p>
            <el-button
              v-if="userRules.length === 0"
              type="primary"
              :icon="Plus"
              size="small"
              @click="openCreateDialog"
            >
              新建第一条规则
            </el-button>
          </div>
        </div>
      </div>

      <!-- 右栏：命中测试器 -->
      <div class="rule-tester">
        <div class="tester-header">
          <el-icon :size="14">
            <Aim />
          </el-icon>
          <span>命中测试器</span>
        </div>
        <el-input
          v-model="testerModelId"
          placeholder="输入模型 ID，如 gpt-4o-2024-08-06"
          clearable
        />
        <div class="tester-result">
          <template v-if="!testerModelId.trim()">
            <div class="tester-placeholder">
              <el-icon :size="28" color="var(--text-color-light)">
                <Aim />
              </el-icon>
              <p>输入模型 ID 查看会命中哪个 Profile</p>
            </div>
          </template>
          <template v-else-if="testerResult.profile">
            <div class="tester-card">
              <div class="tester-card-row">
                <span class="tester-label">命中来源</span>
                <el-tag
                  :type="getMatchSourceTag(testerResult.matchSource).type"
                  size="small"
                  effect="light"
                >
                  {{ getMatchSourceTag(testerResult.matchSource).label }}
                </el-tag>
              </div>
              <div class="tester-card-row">
                <span class="tester-label">Profile</span>
                <span class="tester-profile">
                  <span class="tester-profile-name">
                    {{ testerResult.profile.name }}
                  </span>
                  <code class="tester-profile-id">
                    {{ testerResult.profile.id }}
                  </code>
                </span>
              </div>
              <div class="tester-card-row">
                <span class="tester-label">置信度</span>
                <el-tag
                  :type="getConfidenceTagType(testerResult.profile.confidence)"
                  size="small"
                  effect="light"
                >
                  {{ getConfidenceLabel(testerResult.profile.confidence) }}
                </el-tag>
              </div>
              <div
                v-if="testerResult.profile.calibration"
                class="tester-card-row"
              >
                <span class="tester-label">校准</span>
                <span class="tester-calibration">
                  <span
                    v-if="
                      testerResult.profile.calibration.multiplier !== undefined
                    "
                  >
                    ×{{
                      testerResult.profile.calibration.multiplier.toFixed(2)
                    }}
                  </span>
                  <span
                    v-if="
                      testerResult.profile.calibration.fixedOverhead !==
                      undefined
                    "
                  >
                    +{{ testerResult.profile.calibration.fixedOverhead }}
                  </span>
                </span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="tester-fallback">
              <el-icon :size="24" color="var(--el-color-warning)">
                <WarningFilled />
              </el-icon>
              <p class="fallback-title">未命中任何 Profile</p>
              <p class="fallback-desc">
                将退化为字符级估算器（估算置信度）。<br />
                可新建规则把它显式指向某个 Profile。
              </p>
              <el-button
                size="small"
                type="primary"
                :icon="Plus"
                @click="openCreateDialogWithPattern(testerModelId)"
              >
                为此 ID 创建规则
              </el-button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ============ 规则编辑对话框 ============ -->
    <BaseDialog
      v-model="dialogVisible"
      :title="editingRule ? '编辑匹配规则' : '新建匹配规则'"
      width="640px"
    >
      <template #content>
        <el-form
          ref="formRef"
          :model="formData"
          :rules="formRules"
          label-width="100px"
          label-position="right"
        >
          <el-form-item label="正则模式" prop="pattern">
            <el-input
              v-model="formData.pattern"
              placeholder="例如：^gpt-4o-2024.*$"
              :prefix-icon="Search"
            />
            <div v-if="formPatternHint" class="form-hint">
              <el-icon :size="12">
                <component
                  :is="formPatternHint.icon"
                  :class="`hint-${formPatternHint.level}`"
                />
              </el-icon>
              {{ formPatternHint.text }}
            </div>
          </el-form-item>

          <el-form-item label="目标 Profile" prop="profileId">
            <el-select
              v-model="formData.profileId"
              placeholder="选择目标 Tokenizer Profile"
              filterable
              style="width: 100%"
            >
              <el-option-group
                v-for="group in profileSelectGroups"
                :key="group.label"
                :label="group.label"
              >
                <el-option
                  v-for="p in group.options"
                  :key="p.id"
                  :label="p.name"
                  :value="p.id"
                >
                  <div class="profile-option">
                    <span class="profile-option-name">{{ p.name }}</span>
                    <code class="profile-option-id">{{ p.id }}</code>
                  </div>
                </el-option>
              </el-option-group>
            </el-select>
          </el-form-item>

          <el-form-item label="优先级">
            <el-input-number
              v-model="formData.priority"
              :min="0"
              :max="9999"
              :step="1"
            />
            <span class="form-tip">数字越大越优先匹配，默认 100</span>
          </el-form-item>

          <el-form-item label="备注">
            <el-input
              v-model="formData.description"
              type="textarea"
              :rows="2"
              placeholder="可选：填写规则用途，方便后续维护"
            />
          </el-form-item>

          <el-form-item label="启用">
            <el-switch v-model="formData.enabled" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onSubmit">
          {{ editingRule ? "保存" : "创建" }}
        </el-button>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, nextTick } from "vue";
import {
  Connection,
  Plus,
  Search,
  Top,
  Bottom,
  Edit,
  Delete,
  Aim,
  WarningFilled,
  CircleCheck,
  CircleClose,
} from "@element-plus/icons-vue";
import { ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { storeToRefs } from "pinia";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useTokenizerRegistryStore } from "../../stores/tokenizerRegistryStore";
import type {
  TokenizerProfile,
  TokenizerRule,
  TokenizerConfidence,
} from "../../types/tokenizer-profile";

const registryStore = useTokenizerRegistryStore();
const { userRules, builtinProfiles, userProfiles } = storeToRefs(registryStore);

const errorHandler = createModuleErrorHandler("token-calculator/rules");

// ============ 搜索 / 列表 ============

const searchKeyword = ref("");

/** 按优先级倒序展示（priority 越大越靠前） */
const sortedRules = computed<TokenizerRule[]>(() => {
  const list = [...userRules.value];
  list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return list;
});

const filteredRules = computed<TokenizerRule[]>(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  if (!kw) return sortedRules.value;
  return sortedRules.value.filter((r) => {
    const hay = [r.pattern, r.profileId, r.description ?? ""]
      .join("|")
      .toLowerCase();
    return hay.includes(kw);
  });
});

function getProfileMeta(profileId: string): TokenizerProfile | undefined {
  return registryStore.getProfile(profileId);
}

// ============ Profile 选择器分组 ============

interface ProfileGroup {
  label: string;
  options: TokenizerProfile[];
}

const profileSelectGroups = computed<ProfileGroup[]>(() => {
  const groups: ProfileGroup[] = [];
  if (builtinProfiles.value.length > 0) {
    groups.push({
      label: "内置 Profile",
      options: builtinProfiles.value,
    });
  }
  if (userProfiles.value.length > 0) {
    groups.push({
      label: "用户安装",
      options: userProfiles.value,
    });
  }
  return groups;
});

// ============ 操作：上移 / 下移 / 启用 / 删除 ============

/**
 * 调整优先级（上移=+10，下移=-10）
 *
 * 简单起见，直接对 priority 做加减，不重新分配整个列表的优先级序号。
 * 如果用户搞乱了优先级，可以在编辑对话框里手动改。
 */
async function adjustPriority(rule: TokenizerRule, direction: 1 | -1) {
  const current = rule.priority ?? 0;
  const next = current + direction * 10;
  try {
    await registryStore.upsertRule({ ...rule, priority: next });
  } catch (error) {
    errorHandler.error(error as Error, "调整优先级失败");
  }
}

async function toggleEnabled(rule: TokenizerRule, enabled: boolean) {
  try {
    await registryStore.upsertRule({ ...rule, enabled });
  } catch (error) {
    errorHandler.error(error as Error, "切换规则启用状态失败");
  }
}

async function onDelete(rule: TokenizerRule) {
  try {
    await ElMessageBox.confirm(
      `确定删除该匹配规则吗？\n\n${rule.pattern}`,
      "删除规则",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
  } catch {
    return;
  }
  try {
    await registryStore.deleteRule(rule.id);
    customMessage.success("规则已删除");
  } catch (error) {
    errorHandler.error(error as Error, "删除规则失败");
  }
}

// ============ 命中测试器 ============

const testerModelId = ref("");

const testerResult = computed(() => {
  const id = testerModelId.value.trim();
  if (!id)
    return {
      profile: null as TokenizerProfile | null,
      matchSource: "fallback" as const,
    };
  return registryStore.previewResolve(id);
});

function getMatchSourceTag(source: string): {
  type: "primary" | "success" | "warning" | "info";
  label: string;
} {
  switch (source) {
    case "rule":
      return { type: "primary", label: "用户规则" };
    case "metadata":
      return { type: "success", label: "Model 元数据" };
    case "pattern":
      return { type: "warning", label: "Profile 自带正则" };
    default:
      return { type: "info", label: "未命中（估算）" };
  }
}

function getConfidenceLabel(c: TokenizerConfidence): string {
  switch (c) {
    case "exact":
      return "精确";
    case "close":
      return "近似";
    case "estimated":
      return "估算";
  }
}

function getConfidenceTagType(
  c: TokenizerConfidence
): "success" | "warning" | "info" {
  switch (c) {
    case "exact":
      return "success";
    case "close":
      return "warning";
    case "estimated":
      return "info";
  }
}

// ============ 编辑 / 新建对话框 ============

const dialogVisible = ref(false);
const editingRule = ref<TokenizerRule | null>(null);
const formRef = ref<FormInstance | null>(null);

interface RuleFormData {
  pattern: string;
  profileId: string;
  priority: number;
  description: string;
  enabled: boolean;
}

const formData = reactive<RuleFormData>({
  pattern: "",
  profileId: "",
  priority: 100,
  description: "",
  enabled: true,
});

const formRules: FormRules<RuleFormData> = {
  pattern: [
    { required: true, message: "请输入正则模式", trigger: "blur" },
    {
      validator: (_rule, value: string, callback) => {
        if (!value) return callback();
        try {
          new RegExp(value, "i");
          callback();
        } catch (e) {
          callback(new Error(`正则表达式无效：${(e as Error).message}`));
        }
      },
      trigger: "blur",
    },
  ],
  profileId: [
    { required: true, message: "请选择目标 Profile", trigger: "change" },
  ],
};

/** 表单输入正则时实时给提示 */
const formPatternHint = computed<{
  level: "ok" | "warn" | "error";
  text: string;
  icon: unknown;
} | null>(() => {
  const p = formData.pattern.trim();
  if (!p) return null;
  try {
    new RegExp(p, "i");
    return {
      level: "ok",
      text: "正则语法有效",
      icon: CircleCheck,
    };
  } catch (e) {
    return {
      level: "error",
      text: `语法错误：${(e as Error).message}`,
      icon: CircleClose,
    };
  }
});

function resetForm() {
  formData.pattern = "";
  formData.profileId = "";
  formData.priority = 100;
  formData.description = "";
  formData.enabled = true;
  formRef.value?.clearValidate();
}

function openCreateDialog() {
  editingRule.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openCreateDialogWithPattern(modelId: string) {
  editingRule.value = null;
  resetForm();
  // 自动生成一个安全的正则（转义特殊字符 + 锚定开头）
  const escaped = modelId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  formData.pattern = `^${escaped}$`;
  dialogVisible.value = true;
  // 自动聚焦 profile 选择器
  nextTick(() => formRef.value?.clearValidate());
}

function openEditDialog(rule: TokenizerRule) {
  editingRule.value = rule;
  formData.pattern = rule.pattern;
  formData.profileId = rule.profileId;
  formData.priority = rule.priority ?? 100;
  formData.description = rule.description ?? "";
  formData.enabled = rule.enabled !== false;
  dialogVisible.value = true;
  nextTick(() => formRef.value?.clearValidate());
}

async function onSubmit() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }

  const next: TokenizerRule = {
    id: editingRule.value?.id ?? generateRuleId(),
    pattern: formData.pattern.trim(),
    profileId: formData.profileId,
    priority: formData.priority,
    description: formData.description.trim() || undefined,
    enabled: formData.enabled,
  };

  try {
    await registryStore.upsertRule(next);
    customMessage.success(editingRule.value ? "规则已更新" : "规则已创建");
    dialogVisible.value = false;
  } catch (error) {
    errorHandler.error(error as Error, "保存规则失败");
  }
}

function generateRuleId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `rule_${crypto.randomUUID()}`;
  }
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// 当 store 中 rules 变化（例如其他视图删除），表单中正在编辑的对象若被删则关闭
watch(userRules, (next) => {
  if (editingRule.value && !next.find((r) => r.id === editingRule.value?.id)) {
    dialogVisible.value = false;
    editingRule.value = null;
  }
});
</script>

<style scoped>
.tokenizer-rule-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 0;
  padding: 16px;
  gap: 12px;
  box-sizing: border-box;
}

/* ============ Header ============ */

.rule-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
}

.rule-header-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rule-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.rule-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-secondary);
}

/* ============ 主体 ============ */

.rule-body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 12px;
  overflow: hidden;
  min-height: 0;
}

/* ============ 左：规则列表 ============ */

.rule-list-wrapper {
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
  min-height: 0;
}

.rule-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.rule-stats {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.rule-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rule-card {
  padding: 10px 12px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.04)
  );
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
  transition:
    box-shadow 0.2s,
    background-color 0.2s,
    opacity 0.2s;
}

.rule-card:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  box-shadow: var(--el-box-shadow-light);
}

.rule-card.disabled {
  opacity: 0.55;
}

.rule-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.rule-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.rule-pattern {
  font-family: "Consolas", monospace;
  font-size: 12px;
  padding: 3px 8px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--primary-color);
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.rule-card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.rule-card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rule-target {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  flex-wrap: wrap;
}

.meta-label {
  color: var(--text-color-secondary);
}

.profile-ref {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.profile-ref-name {
  color: var(--text-color);
  font-weight: 500;
}

.profile-ref-id,
.profile-option-id,
.tester-profile-id {
  font-family: "Consolas", monospace;
  font-size: 11px;
  padding: 1px 6px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  color: var(--text-color-secondary);
  border-radius: 4px;
}

.profile-missing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-warning);
  font-size: 12px;
}

.rule-description {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color-secondary);
}

.rule-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--text-color-light);
  gap: 8px;
}

.rule-empty p {
  margin: 0;
  font-size: 13px;
}

/* ============ 右：命中测试器 ============ */

.rule-tester {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
  overflow-y: auto;
  min-height: 0;
}

.tester-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.tester-result {
  flex: 1;
}

.tester-placeholder,
.tester-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 12px;
  text-align: center;
  gap: 8px;
  color: var(--text-color-light);
}

.tester-fallback {
  color: var(--text-color-secondary);
}

.fallback-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.fallback-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-secondary);
}

.tester-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.06)
  );
  border-radius: 8px;
  margin-top: 4px;
}

.tester-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.tester-label {
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.tester-profile {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-align: right;
}

.tester-profile-name {
  color: var(--text-color);
  font-weight: 500;
}

.tester-calibration {
  display: inline-flex;
  gap: 6px;
  color: var(--text-color);
  font-family: "Consolas", monospace;
}

/* ============ 表单提示 ============ */

.form-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  margin-top: 4px;
  color: var(--text-color-secondary);
}

.hint-ok {
  color: var(--el-color-success);
}

.hint-warn {
  color: var(--el-color-warning);
}

.hint-error {
  color: var(--el-color-danger);
}

.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.profile-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.profile-option-name {
  color: var(--text-color);
}

/* ============ 响应式 ============ */

@media (max-width: 1080px) {
  .rule-body {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
  .rule-tester {
    min-height: 240px;
  }
}
</style>
