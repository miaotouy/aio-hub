<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="tokenizer-calibration-tab">
    <!-- 顶部说明 -->
    <div class="calibration-header">
      <div class="header-text">
        <h3 class="header-title">
          <el-icon :size="16">
            <SetUp />
          </el-icon>
          校准设置
        </h3>
        <p class="header-desc">
          为没有公开分词器或新版分词偏差较大的模型配置乘性倍率与固定
          overhead，<br />
          得到保守的 token 估算。最终结果 =
          <code>round(原始 × multiplier + fixedOverhead)</code
          >，下游模块直接使用 <code>count</code>，无需感知校准存在。
        </p>
      </div>
      <div class="header-stats">
        <div class="stat-card">
          <span class="stat-label">已校准</span>
          <span class="stat-value">{{ calibratedCount }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">总计</span>
          <span class="stat-value">{{ allProfiles.length }}</span>
        </div>
      </div>
    </div>

    <!-- 主体两栏 -->
    <div class="calibration-body">
      <!-- 左：Profile 列表 -->
      <div class="profile-list-wrapper">
        <div class="list-toolbar">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索分词器名称 / ID"
            clearable
            :prefix-icon="Search"
            style="width: 240px"
          />
          <el-checkbox
            v-model="onlyShowCalibrated"
            label="仅显示已校准"
            size="small"
          />
        </div>

        <div class="profile-list">
          <div
            v-for="profile in filteredProfiles"
            :key="profile.id"
            class="profile-row"
            :class="{
              active: selectedProfileId === profile.id,
              calibrated: hasCalibration(profile),
            }"
            @click="selectedProfileId = profile.id"
          >
            <div class="profile-row-main">
              <div class="profile-row-title">
                <span class="profile-name">{{ profile.name }}</span>
                <el-tag
                  v-if="hasCalibration(profile)"
                  size="small"
                  type="warning"
                  effect="light"
                >
                  已校准
                </el-tag>
                <el-tag
                  v-if="
                    registryStore.isBuiltinProfile(profile.id) &&
                    registryStore.hasBuiltinOverride(profile.id)
                  "
                  size="small"
                  type="info"
                  effect="plain"
                >
                  已覆盖
                </el-tag>
              </div>
              <div class="profile-row-meta">
                <code class="profile-id">{{ profile.id }}</code>
                <span class="profile-source">
                  {{ getSourceLabel(profile.source.type) }}
                </span>
              </div>
              <div v-if="hasCalibration(profile)" class="profile-summary">
                {{ buildCalibrationSummary(profile.calibration!) }}
              </div>
            </div>
          </div>

          <div v-if="filteredProfiles.length === 0" class="profile-empty">
            <el-icon :size="32" color="var(--text-color-light)">
              <Search />
            </el-icon>
            <p v-if="onlyShowCalibrated">还没有校准过任何分词器</p>
            <p v-else>没有匹配的分词器</p>
          </div>
        </div>
      </div>

      <!-- 右：校准编辑面板 -->
      <div class="calibration-editor">
        <template v-if="selectedProfile">
          <div class="editor-header">
            <div class="editor-title-row">
              <h4 class="editor-title">{{ selectedProfile.name }}</h4>
              <el-tag
                :type="getConfidenceTagType(selectedProfile.confidence)"
                size="small"
                effect="light"
              >
                {{ getConfidenceLabel(selectedProfile.confidence) }}
              </el-tag>
            </div>
            <code class="editor-profile-id">{{ selectedProfile.id }}</code>
            <p v-if="selectedProfile.description" class="editor-description">
              {{ selectedProfile.description }}
            </p>
          </div>

          <!-- 校准字段 -->
          <div class="editor-form">
            <div class="form-row">
              <label class="form-label">
                Multiplier
                <el-tooltip
                  content="乘性倍率。例如新 Claude 本地分词偏低时设 1.20。范围 0.10 ~ 5.00"
                  placement="top"
                >
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </label>
              <el-input-number
                v-model="formData.multiplier"
                :min="0.1"
                :max="5"
                :step="0.05"
                :precision="2"
                controls-position="right"
              />
              <span class="form-tip">默认 1.00，不缩放</span>
            </div>

            <div class="form-row">
              <label class="form-label">
                Fixed Overhead
                <el-tooltip
                  content="每次调用的固定 token 开销（与文本长度无关）"
                  placement="top"
                >
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </label>
              <el-input-number
                v-model="formData.fixedOverhead"
                :min="0"
                :max="2000"
                :step="1"
                :precision="0"
                controls-position="right"
              />
              <span class="form-tip">默认 0</span>
            </div>

            <div class="form-row">
              <label class="form-label">
                Per Message Overhead
                <el-tooltip
                  content="每条 chat 消息的固定 token 开销（LLM Chat 等模块按需读取）"
                  placement="top"
                >
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </label>
              <el-input-number
                v-model="formData.perMessageOverhead"
                :min="0"
                :max="500"
                :step="1"
                :precision="0"
                controls-position="right"
              />
              <span class="form-tip">默认 0（典型 OpenAI 模型为 3~4）</span>
            </div>

            <div class="form-row">
              <label class="form-label">
                Per Tool Overhead
                <el-tooltip
                  content="每个工具/函数 schema 的固定 token 开销"
                  placement="top"
                >
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </label>
              <el-input-number
                v-model="formData.perToolOverhead"
                :min="0"
                :max="500"
                :step="1"
                :precision="0"
                controls-position="right"
              />
              <span class="form-tip">默认 0</span>
            </div>

            <div class="form-row">
              <label class="form-label">
                Reserve Ratio
                <el-tooltip
                  content="上下文截断时为输出预留的安全比例（0~1），context-pipeline 可选读取"
                  placement="top"
                >
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </label>
              <el-input-number
                v-model="formData.reserveRatio"
                :min="0"
                :max="1"
                :step="0.05"
                :precision="2"
                controls-position="right"
              />
              <span class="form-tip">默认 0，不预留</span>
            </div>
          </div>

          <!-- 实时预览 -->
          <div class="preview-section">
            <div class="preview-header">
              <el-icon :size="14"><DataAnalysis /></el-icon>
              <span>实时预览</span>
            </div>
            <el-input
              v-model="previewText"
              type="textarea"
              :rows="2"
              placeholder="输入文本预览校准前后的差异..."
            />
            <div class="preview-result">
              <div class="preview-row">
                <span class="preview-label">字符数</span>
                <span class="preview-value">{{ previewText.length }}</span>
              </div>
              <div class="preview-row">
                <span class="preview-label">原始 Token</span>
                <span class="preview-value">
                  {{ previewResult.rawCount ?? "—" }}
                </span>
              </div>
              <div class="preview-row highlight">
                <span class="preview-label">校准后</span>
                <span class="preview-value">
                  {{ previewCalibratedCount ?? "—" }}
                </span>
              </div>
              <div v-if="previewDelta !== null" class="preview-row delta">
                <span class="preview-label">差值</span>
                <span
                  class="preview-value"
                  :class="{
                    'delta-positive': previewDelta > 0,
                    'delta-negative': previewDelta < 0,
                  }"
                >
                  {{ previewDelta > 0 ? "+" : "" }}{{ previewDelta }}
                </span>
              </div>
            </div>
          </div>

          <!-- 底部操作 -->
          <div class="editor-actions">
            <el-button :disabled="!isDirty" @click="resetForm">
              撤销改动
            </el-button>
            <el-button
              v-if="hasCalibration(selectedProfile) || isResettable"
              type="danger"
              plain
              :icon="RefreshLeft"
              @click="onClearCalibration"
            >
              清除校准
            </el-button>
            <el-button
              type="primary"
              :icon="Check"
              :loading="saving"
              :disabled="!isDirty"
              @click="onSave"
            >
              保存
            </el-button>
          </div>
        </template>
        <template v-else>
          <div class="editor-placeholder">
            <el-icon :size="40" color="var(--text-color-light)">
              <SetUp />
            </el-icon>
            <p>从左侧选择一个分词器开始校准</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from "vue";
import {
  SetUp,
  Search,
  Check,
  RefreshLeft,
  QuestionFilled,
  DataAnalysis,
} from "@element-plus/icons-vue";
import { storeToRefs } from "pinia";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useTokenizerRegistryStore } from "../../stores/tokenizerRegistryStore";
import { tokenCalculatorEngine } from "../../core/tokenCalculatorEngine";
import type {
  TokenizerProfile,
  TokenizerCalibration,
  TokenizerConfidence,
  TokenizerSource,
} from "../../types/tokenizer-profile";

const registryStore = useTokenizerRegistryStore();
const { allProfiles } = storeToRefs(registryStore);
const errorHandler = createModuleErrorHandler(
  "token-calculator/calibration-tab"
);

// =================================================================
// 列表 / 筛选
// =================================================================

const searchKeyword = ref("");
const onlyShowCalibrated = ref(false);
const selectedProfileId = ref<string | null>(null);

function hasCalibration(profile: TokenizerProfile): boolean {
  const c = profile.calibration;
  if (!c) return false;
  return (
    (c.multiplier !== undefined && c.multiplier !== 1) ||
    (c.fixedOverhead !== undefined && c.fixedOverhead !== 0) ||
    (c.perMessageOverhead !== undefined && c.perMessageOverhead !== 0) ||
    (c.perToolOverhead !== undefined && c.perToolOverhead !== 0) ||
    (c.reserveRatio !== undefined && c.reserveRatio !== 0)
  );
}

const calibratedCount = computed(
  () => allProfiles.value.filter((p) => hasCalibration(p)).length
);

const filteredProfiles = computed<TokenizerProfile[]>(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  return allProfiles.value.filter((p) => {
    if (onlyShowCalibrated.value && !hasCalibration(p)) return false;
    if (kw) {
      const hay = [p.id, p.name, p.description ?? ""].join("|").toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
});

const selectedProfile = computed<TokenizerProfile | null>(() => {
  if (!selectedProfileId.value) return null;
  return registryStore.getProfile(selectedProfileId.value) ?? null;
});

/**
 * 当前选中的内置 profile 是否有任意覆盖（即使没 calibration 也可能有 enabled 覆盖）
 *
 * 用于判断"清除校准"按钮是否需要显示——
 * 没 calibration 但有 enabled 覆盖时，清除校准实际上要清除 calibration 字段而非整个覆盖。
 */
const isResettable = computed<boolean>(() => {
  const p = selectedProfile.value;
  if (!p) return false;
  return (
    registryStore.isBuiltinProfile(p.id) &&
    registryStore.hasBuiltinOverride(p.id)
  );
});

// 选中第一个 profile
watch(
  () => allProfiles.value,
  (list) => {
    if (!selectedProfileId.value && list.length > 0) {
      selectedProfileId.value = list[0].id;
    }
  },
  { immediate: true }
);

// =================================================================
// 表单
// =================================================================

interface CalibrationForm {
  multiplier: number;
  fixedOverhead: number;
  perMessageOverhead: number;
  perToolOverhead: number;
  reserveRatio: number;
}

const defaultForm: CalibrationForm = {
  multiplier: 1,
  fixedOverhead: 0,
  perMessageOverhead: 0,
  perToolOverhead: 0,
  reserveRatio: 0,
};

const formData = reactive<CalibrationForm>({ ...defaultForm });

function calibrationToForm(
  c: TokenizerCalibration | undefined
): CalibrationForm {
  return {
    multiplier: c?.multiplier ?? 1,
    fixedOverhead: c?.fixedOverhead ?? 0,
    perMessageOverhead: c?.perMessageOverhead ?? 0,
    perToolOverhead: c?.perToolOverhead ?? 0,
    reserveRatio: c?.reserveRatio ?? 0,
  };
}

/**
 * 把表单转回 calibration 对象。如果所有字段都是默认值则返回 null（清除）。
 */
function formToCalibration(form: CalibrationForm): TokenizerCalibration | null {
  const result: TokenizerCalibration = {};
  if (form.multiplier !== 1) result.multiplier = form.multiplier;
  if (form.fixedOverhead !== 0) result.fixedOverhead = form.fixedOverhead;
  if (form.perMessageOverhead !== 0)
    result.perMessageOverhead = form.perMessageOverhead;
  if (form.perToolOverhead !== 0) result.perToolOverhead = form.perToolOverhead;
  if (form.reserveRatio !== 0) result.reserveRatio = form.reserveRatio;
  return Object.keys(result).length === 0 ? null : result;
}

/** 用选中 profile 的当前值填充表单 */
function resetForm() {
  const p = selectedProfile.value;
  Object.assign(formData, calibrationToForm(p?.calibration));
}

// 切换选中 profile 时自动加载其 calibration
watch(
  selectedProfileId,
  () => {
    resetForm();
  },
  { immediate: true }
);

const isDirty = computed<boolean>(() => {
  const p = selectedProfile.value;
  if (!p) return false;
  const current = calibrationToForm(p.calibration);
  return (
    current.multiplier !== formData.multiplier ||
    current.fixedOverhead !== formData.fixedOverhead ||
    current.perMessageOverhead !== formData.perMessageOverhead ||
    current.perToolOverhead !== formData.perToolOverhead ||
    current.reserveRatio !== formData.reserveRatio
  );
});

// =================================================================
// 实时预览
// =================================================================

const previewText = ref(
  "Hello, world! 你好，世界！🌍\nThis is a sample text for token calibration preview."
);
const previewResult = ref<{ rawCount: number | null }>({ rawCount: null });

async function recomputePreview() {
  const p = selectedProfile.value;
  if (!p) {
    previewResult.value = { rawCount: null };
    return;
  }
  if (!previewText.value.trim()) {
    previewResult.value = { rawCount: 0 };
    return;
  }
  try {
    // 直接用主线程 engine 计算原始 token，避免每次校准调整都打扰 Worker
    const result = await tokenCalculatorEngine.calculateTokensByTokenizer(
      previewText.value,
      p.id
    );
    previewResult.value = { rawCount: result.rawCount ?? result.count };
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "预览计算失败",
      showToUser: false,
    });
    previewResult.value = { rawCount: null };
  }
}

// 文本或 profile 变化时重算（节流避免抖动）
let previewTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  [previewText, selectedProfileId],
  () => {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(recomputePreview, 200);
  },
  { immediate: true }
);

/** 用表单值算"如果保存后"的最终 count */
const previewCalibratedCount = computed<number | null>(() => {
  const raw = previewResult.value.rawCount;
  if (raw === null) return null;
  const result = Math.round(raw * formData.multiplier + formData.fixedOverhead);
  return Math.max(0, result);
});

const previewDelta = computed<number | null>(() => {
  if (
    previewResult.value.rawCount === null ||
    previewCalibratedCount.value === null
  )
    return null;
  return previewCalibratedCount.value - previewResult.value.rawCount;
});

// =================================================================
// 保存 / 清除
// =================================================================

const saving = ref(false);

async function onSave() {
  const p = selectedProfile.value;
  if (!p) return;
  saving.value = true;
  try {
    const calibration = formToCalibration(formData);
    await registryStore.setProfileCalibration(p.id, calibration);
    customMessage.success(
      calibration ? "校准已保存" : "校准已清除（全是默认值）"
    );
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "保存校准失败",
    });
  } finally {
    saving.value = false;
  }
}

async function onClearCalibration() {
  const p = selectedProfile.value;
  if (!p) return;
  try {
    await registryStore.setProfileCalibration(p.id, null);
    Object.assign(formData, defaultForm);
    customMessage.success("已清除该分词器的校准");
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "清除校准失败",
    });
  }
}

// =================================================================
// 工具
// =================================================================

function buildCalibrationSummary(c: TokenizerCalibration): string {
  const parts: string[] = [];
  if (c.multiplier !== undefined && c.multiplier !== 1) {
    parts.push(`×${c.multiplier.toFixed(2)}`);
  }
  if (c.fixedOverhead !== undefined && c.fixedOverhead !== 0) {
    parts.push(`+${c.fixedOverhead}`);
  }
  if (c.perMessageOverhead !== undefined && c.perMessageOverhead !== 0) {
    parts.push(`msg+${c.perMessageOverhead}`);
  }
  if (c.perToolOverhead !== undefined && c.perToolOverhead !== 0) {
    parts.push(`tool+${c.perToolOverhead}`);
  }
  if (c.reserveRatio !== undefined && c.reserveRatio !== 0) {
    parts.push(`reserve ${(c.reserveRatio * 100).toFixed(0)}%`);
  }
  return parts.join(" · ");
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

function getSourceLabel(t: TokenizerSource["type"]): string {
  switch (t) {
    case "bundled":
      return "内置";
    case "local":
      return "本地";
    case "remote":
      return "远端";
  }
}
</script>

<style scoped>
.tokenizer-calibration-tab {
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

.calibration-header {
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

.header-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.header-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.header-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-secondary);
}

.header-desc code {
  padding: 1px 6px;
  font-family: "Consolas", monospace;
  font-size: 11px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border-radius: 4px;
  color: var(--primary-color);
}

.header-stats {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 60px;
  padding: 6px 12px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border-radius: 8px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--primary-color);
  font-family: "Consolas", monospace;
}

/* ============ Body ============ */

.calibration-body {
  flex: 1;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 12px;
  overflow: hidden;
  min-height: 0;
}

/* ============ 左：列表 ============ */

.profile-list-wrapper {
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
  min-height: 0;
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.profile-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-row {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s;
  border: 1px solid transparent;
}

.profile-row:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.06)
  );
}

.profile-row.active {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.3)
  );
}

.profile-row.calibrated {
  border-left: 3px solid var(--el-color-warning);
  padding-left: 9px;
}

.profile-row-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-row-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.profile-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.profile-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.profile-id {
  font-family: "Consolas", monospace;
  padding: 1px 6px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border-radius: 4px;
}

.profile-summary {
  font-size: 11px;
  font-family: "Consolas", monospace;
  color: var(--el-color-warning);
  margin-top: 2px;
}

.profile-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--text-color-light);
  gap: 8px;
}

.profile-empty p {
  margin: 0;
  font-size: 13px;
}

/* ============ 右：编辑面板 ============ */

.calibration-editor {
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
  overflow-y: auto;
  min-height: 0;
}

.editor-header {
  padding: 16px 18px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.editor-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.editor-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
}

.editor-profile-id {
  display: inline-block;
  font-family: "Consolas", monospace;
  font-size: 11px;
  padding: 1px 6px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  color: var(--text-color-secondary);
  border-radius: 4px;
  margin-bottom: 6px;
}

.editor-description {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color-secondary);
}

.editor-form {
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  gap: 14px;
}

.form-row {
  display: grid;
  grid-template-columns: 180px 200px 1fr;
  align-items: center;
  gap: 12px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.form-label .el-icon {
  color: var(--text-color-secondary);
  font-size: 13px;
}

.form-tip {
  font-size: 11px;
  color: var(--text-color-secondary);
}

/* ============ 预览区 ============ */

.preview-section {
  margin: 0 18px 16px;
  padding: 14px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.preview-result {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.preview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--card-bg);
  border-radius: 6px;
  font-size: 12px;
}

.preview-row.highlight {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  border: 1px solid
    rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.3));
}

.preview-row.delta .preview-value {
  font-weight: 600;
}

.preview-label {
  color: var(--text-color-secondary);
}

.preview-value {
  font-family: "Consolas", monospace;
  font-weight: 500;
  color: var(--text-color);
}

.preview-row.highlight .preview-value {
  color: var(--primary-color);
  font-weight: 600;
}

.delta-positive {
  color: var(--el-color-warning) !important;
}

.delta-negative {
  color: var(--el-color-success) !important;
}

/* ============ 底部 ============ */

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
  margin-top: auto;
}

.editor-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 24px;
  color: var(--text-color-light);
}

.editor-placeholder p {
  margin: 0;
  font-size: 13px;
}

/* ============ 响应式 ============ */

@media (max-width: 1080px) {
  .calibration-body {
    grid-template-columns: 1fr;
    grid-template-rows: 280px 1fr;
  }
  .form-row {
    grid-template-columns: 160px 1fr;
  }
  .form-tip {
    grid-column: 1 / -1;
    margin-left: 160px;
  }
}
</style>
