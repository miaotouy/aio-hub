<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { useI18n } from "@/i18n";

const logger = createModuleLogger("ProfileEditor");

import {
  Settings2,
  Globe,
  Key,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ExternalLink,
  Sparkles,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-vue-next";
import { Snackbar, Dialog } from "@varlet/ui";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { providerTypes } from "../config/llm-providers";
import { fetchModelsFromApi } from "../core/model-fetcher";
import { generateLlmApiEndpointPreview, getLlmEndpointHint } from "../utils/url";
import type { LlmProfile, LlmModelInfo } from "../types";

// 导入子组件
import CustomHeadersEditor from "./CustomHeadersEditor.vue";
import CustomEndpointsEditor from "./CustomEndpointsEditor.vue";
import IconSelector from "./IconSelector.vue";
import ModelList from "./ModelList.vue";
import ModelFetcherPopup from "./ModelFetcherPopup.vue";
import ModelEditorPopup from "./ModelEditorPopup.vue";
import KeyStatusManagerPopup from "./KeyStatusManagerPopup.vue";

// 密码可见性
const showApiKey = ref(false);

const props = defineProps<{
  show: boolean;
  profile: LlmProfile | null;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "update:profile", value: LlmProfile | null): void;
  (e: "save", profile: LlmProfile): void;
  (e: "delete", id: string): void;
}>();

const { t, tRaw } = useI18n();
const isFetchingModels = ref(false);
const showHeadersPopup = ref(false);
const showEndpointsPopup = ref(false);
const showIconSelectorPopup = ref(false);
const showModelFetcherPopup = ref(false);
const showModelEditorPopup = ref(false);
const showKeyManagerPopup = ref(false);
const editingModel = ref<LlmModelInfo | null>(null);
const fetchedModels = ref<LlmModelInfo[]>([]);

const innerProfile = ref<LlmProfile | null>(null);

watch(
  () => props.show,
  (val) => {
    if (val && props.profile) {
      innerProfile.value = JSON.parse(JSON.stringify(props.profile));
    }
  },
  { immediate: true }
);

const saveEdit = () => {
  if (innerProfile.value) {
    if (!innerProfile.value.name.trim()) {
      Snackbar.warning(tRaw("tools.llm-api.ProfileEditor.请输入渠道名称"));
      return;
    }
    emit("save", innerProfile.value);
  }
};

const handleDelete = async () => {
  if (!innerProfile.value) return;
  const confirm = await Dialog({
    title: t("common.确认"),
    message: tRaw("tools.llm-api.ProfileEditor.删除确认", { name: innerProfile.value.name }),
    confirmButtonText: t("common.确定"),
    cancelButtonText: t("common.取消"),
  });

  if (confirm === "confirm") {
    emit("delete", innerProfile.value.id);
  }
};

const handleFetchModels = async () => {
  if (!innerProfile.value) return;
  isFetchingModels.value = true;
  try {
    const models = await fetchModelsFromApi(innerProfile.value);
    fetchedModels.value = models;
    showModelFetcherPopup.value = true;
  } catch (err: any) {
    Snackbar.error(`${t("common.获取失败")}: ${err.message}`);
  } finally {
    isFetchingModels.value = false;
  }
};

const handleAddModels = (models: LlmModelInfo[]) => {
  if (!innerProfile.value) return;
  const existingIds = new Set(innerProfile.value.models.map((m: LlmModelInfo) => m.id));
  const newModels = models.filter((m: LlmModelInfo) => !existingIds.has(m.id));
  innerProfile.value.models = [...innerProfile.value.models, ...newModels];

  // 自动展开新添加模型的分组
  const newGroups = new Set(newModels.map((m) => m.group).filter((g): g is string => !!g));
  if (newGroups.size > 0) {
    const currentExpandState = new Set(innerProfile.value.modelGroupsExpandState || []);
    newGroups.forEach((g) => currentExpandState.add(g));
    innerProfile.value.modelGroupsExpandState = Array.from(currentExpandState);
  }

  Snackbar.success(
    tRaw("tools.llm-api.ProfileEditor.成功添加N个模型", { count: newModels.length })
  );
};

const handleAddSingleModel = () => {
  editingModel.value = null;
  showModelEditorPopup.value = true;
};

const handleEditModel = (model: LlmModelInfo) => {
  editingModel.value = model;
  showModelEditorPopup.value = true;
};

const handleSaveModel = (model: LlmModelInfo) => {
  if (!innerProfile.value) return;
  const index = innerProfile.value.models.findIndex((m: LlmModelInfo) => m.id === model.id);
  if (index > -1) {
    innerProfile.value.models[index] = model;
  } else {
    innerProfile.value.models = [...innerProfile.value.models, model];
  }
  Snackbar.success(tRaw("tools.llm-api.ProfileEditor.模型已保存"));
};

const handleDeleteModel = (modelId: string) => {
  if (!innerProfile.value) return;
  innerProfile.value.models = innerProfile.value.models.filter(
    (m: LlmModelInfo) => m.id !== modelId
  );
  Snackbar.success(tRaw("tools.llm-api.ProfileEditor.模型已删除"));
};

const handleDeleteGroup = (modelIds: string[]) => {
  if (!innerProfile.value) return;
  innerProfile.value.models = innerProfile.value.models.filter(
    (m: LlmModelInfo) => !modelIds.includes(m.id)
  );
  Snackbar.success(tRaw("tools.llm-api.ProfileEditor.已删除N个模型", { count: modelIds.length }));
};

const handleClearModels = () => {
  if (!innerProfile.value) return;
  innerProfile.value.models = [];
  Snackbar.success(tRaw("tools.llm-api.ProfileEditor.已清空所有模型"));
};

const apiEndpointPreview = computed(() => {
  if (!innerProfile.value?.baseUrl) return "";
  return generateLlmApiEndpointPreview(innerProfile.value.baseUrl, innerProfile.value.type);
});

const endpointHint = computed(() => {
  if (!innerProfile.value) return "";
  return getLlmEndpointHint(innerProfile.value.type);
});

// 为 var-input 创建独立的 computed 属性，避免嵌套对象导致的 placeholder 偏移和粘贴 bug
const profileName = computed({
  get: () => innerProfile.value?.name || "",
  set: (val: string) => {
    if (innerProfile.value) {
      innerProfile.value.name = val;
    }
  },
});

const profileType = computed({
  get: () => innerProfile.value?.type || "openai",
  set: (val: string) => {
    if (innerProfile.value) {
      innerProfile.value.type = val as any;
    }
  },
});

const profileIcon = computed({
  get: () => innerProfile.value?.icon || "",
  set: (val: string) => {
    if (innerProfile.value) {
      innerProfile.value.icon = val;
    }
  },
});

const profileBaseUrl = computed({
  get: () => innerProfile.value?.baseUrl || "",
  set: (val: string) => {
    if (innerProfile.value) {
      innerProfile.value.baseUrl = val;
    }
  },
});

const apiKeyString = computed({
  get: () => innerProfile.value?.apiKeys.join(", ") || "",
  set: (val: string) => {
    if (innerProfile.value) {
      innerProfile.value.apiKeys = val
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
    }
  },
});

const handleIconSelect = (icon: { path: string }) => {
  if (innerProfile.value) {
    innerProfile.value.icon = icon.path;
    showIconSelectorPopup.value = false;
    Snackbar.success(tRaw("tools.llm-api.ProfileEditor.已选择图标"));
  }
};

// 处理输入框聚焦时滚动到可见区域
const scrollIntoViewOnFocus = (event: FocusEvent) => {
  const target = event.target as HTMLElement;
  const group = (target.closest(".native-input-group") || target) as HTMLElement;

  // 找到滚动容器
  const scrollContainer = target.closest(".editor-content") as HTMLElement;
  if (!scrollContainer) return;

  // 延迟执行，等待键盘弹出、Padding 撑开以及 CSS 变量更新
  // 增加重试机制，如果第一次计算时键盘高度还没出来，再试一次
  const tryScroll = (retryCount = 0) => {
    const keyboardHeight =
      parseInt(getComputedStyle(document.documentElement).getPropertyValue("--keyboard-height")) ||
      0;

    // 如果高度还是0且重试次数少于3次，延迟再试
    if (keyboardHeight === 0 && retryCount < 3) {
      setTimeout(() => tryScroll(retryCount + 1), 100);
      return;
    }

    const viewportHeight = window.innerHeight;
    const availableHeight = viewportHeight - keyboardHeight;

    const groupRect = group.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();

    // 计算输入框组中心点在滚动容器坐标系中的位置
    const groupCenterInContainer =
      groupRect.top - containerRect.top + scrollContainer.scrollTop + groupRect.height / 2;

    // 目标：将输入框组中心滚动到可用视口区域的中部偏上位置 (约 40% 处)
    // 同时避开顶部 AppBar (54px)
    const targetScrollTop = groupCenterInContainer - availableHeight * 0.4;

    logger.debug("Auto-scrolling calculation", {
      keyboardHeight,
      viewportHeight,
      availableHeight,
      groupRect: { top: groupRect.top, bottom: groupRect.bottom },
      targetScrollTop,
    });

    // 判定是否需要滚动：如果输入框在屏幕下半部或者快被遮挡了
    // 在模拟模式下，我们需要更积极地滚动
    const isSimulated = document.documentElement.classList.contains("keyboard-simulated");
    const threshold = isSimulated ? availableHeight - 20 : availableHeight - 40;

    if (groupRect.bottom > threshold || groupRect.top < 100) {
      scrollContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: "smooth",
      });
    }
  };

  setTimeout(() => tryScroll(), 300);
};
</script>

<template>
  <var-popup
    :show="show"
    @update:show="(val) => emit('update:show', val)"
    position="right"
    style="width: 100%; height: 100%"
  >
    <div class="editor-popup">
      <var-app-bar :title="tRaw('tools.llm-api.ProfileEditor.编辑渠道')" fixed safe-area>
        <template #left>
          <var-button round text @click="emit('update:show', false)">
            <ChevronLeft :size="24" />
          </var-button>
        </template>
        <template #right>
          <var-button text @click="saveEdit">{{ t("common.保存") }}</var-button>
        </template>
      </var-app-bar>

      <div class="editor-content" v-if="innerProfile">
        <!-- 基础信息 -->
        <div class="section-header">{{ tRaw("tools.llm-api.ProfileEditor.基础信息") }}</div>
        <div class="config-card">
          <!-- 头像选择区域 -->
          <div class="avatar-select-section">
            <div class="avatar-preview-large" v-ripple @click="showIconSelectorPopup = true">
              <DynamicIcon :src="innerProfile.icon || ''" :alt="innerProfile.name" />
            </div>
            <div class="avatar-info">
              <div class="avatar-label">{{ tRaw("tools.llm-api.ProfileEditor.渠道图标") }}</div>
              <div class="avatar-hint">
                {{ tRaw("tools.llm-api.ProfileEditor.点击图标选择预设") }}
              </div>
            </div>
          </div>

          <div class="native-input-group form-item">
            <label class="native-input-label">{{
              tRaw("tools.llm-api.ProfileEditor.渠道名称")
            }}</label>
            <input
              v-model="profileName"
              type="text"
              class="native-input"
              :placeholder="tRaw('tools.llm-api.ProfileEditor.请输入渠道名称')"
              @focus="scrollIntoViewOnFocus"
            />
          </div>

          <div class="native-input-group form-item">
            <label class="native-input-label">{{
              tRaw("tools.llm-api.ProfileEditor.提供商类型")
            }}</label>
            <select v-model="profileType" class="native-select">
              <option v-for="t in providerTypes" :key="t.type" :value="t.type">
                {{ t.name }}
              </option>
            </select>
          </div>

          <div class="native-input-group form-item">
            <label class="native-input-label">{{
              tRaw("tools.llm-api.ProfileEditor.图标路径")
            }}</label>
            <div class="native-input-with-action">
              <input
                v-model="profileIcon"
                type="text"
                class="native-input"
                :placeholder="tRaw('tools.llm-api.ProfileEditor.输入图标路径或URL')"
                @focus="scrollIntoViewOnFocus"
              />
              <button class="input-action-btn" @click="showIconSelectorPopup = true">
                <Sparkles :size="18" />
              </button>
            </div>
          </div>
        </div>

        <!-- 连接配置 -->
        <div class="section-header">{{ tRaw("tools.llm-api.ProfileEditor.连接配置") }}</div>
        <div class="config-card">
          <div class="native-input-group form-item">
            <label class="native-input-label"
              ><Globe :size="16" class="label-icon" />
              {{ tRaw("tools.llm-api.ProfileEditor.API 基础地址") }}
            </label>

            <div v-if="apiEndpointPreview" class="url-preview in-group">
              <div class="preview-text">
                {{ t("common.预览") }}: {{ apiEndpointPreview }}
              </div>
              <div class="preview-hint">{{ endpointHint }}</div>
            </div>

            <input
              v-model="profileBaseUrl"
              type="url"
              class="native-input mono"
              :placeholder="tRaw('tools.llm-api.ProfileEditor.请输入基础 URL')"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
              @focus="scrollIntoViewOnFocus"
            />
          </div>

          <div class="native-input-group form-item">
            <div class="label-row">
              <label class="native-input-label">
                <Key :size="16" class="label-icon" />
                {{ tRaw("tools.llm-api.ProfileEditor.API Key") }}
              </label>
              <var-button
                v-if="innerProfile && innerProfile.apiKeys.length > 0"
                type="primary"
                size="mini"
                text
                class="manage-keys-btn"
                @click="showKeyManagerPopup = true"
              >
                <ShieldCheck :size="14" class="mr-1" />
                {{ tRaw("tools.llm-api.ProfileEditor.状态管理") }}
              </var-button>
            </div>
            <div class="native-input-with-action">
              <input
                v-model="apiKeyString"
                :type="showApiKey ? 'text' : 'password'"
                class="native-input mono"
                :placeholder="tRaw('tools.llm-api.ProfileEditor.API Key 占位符')"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="none"
                spellcheck="false"
                @focus="scrollIntoViewOnFocus"
              />
              <button class="input-action-btn" @click="showApiKey = !showApiKey">
                <Eye v-if="showApiKey" :size="18" />
                <EyeOff v-else :size="18" />
              </button>
            </div>
          </div>

          <div class="cell-group">
            <var-cell ripple class="custom-cell" @click="showHeadersPopup = true">
              <template #icon><Settings2 :size="18" class="field-icon" /></template>
              {{ tRaw("tools.llm-api.ProfileEditor.自定义请求头") }}
              <template #description>
                {{ tRaw("tools.llm-api.ProfileEditor.已配置") }}
                {{
                  tRaw("common.N个", {
                    count: Object.keys(innerProfile.customHeaders || {}).length,
                  })
                }}
              </template>
              <template #extra><ChevronRight :size="18" /></template>
            </var-cell>

            <var-cell ripple class="custom-cell" @click="showEndpointsPopup = true">
              <template #icon><ExternalLink :size="18" class="field-icon" /></template>
              {{ tRaw("tools.llm-api.ProfileEditor.高级端点配置") }}
              <template #description>
                {{ tRaw("tools.llm-api.ProfileEditor.针对不同功能的路径微调") }}
              </template>
              <template #extra><ChevronRight :size="18" /></template>
            </var-cell>
          </div>
        </div>

        <!-- 模型管理 -->
        <div class="model-management-section">
          <ModelList
            v-if="innerProfile"
            :models="innerProfile.models"
            :expand-state="innerProfile.modelGroupsExpandState || []"
            :loading="isFetchingModels"
            @update:expand-state="
              (state) => {
                if (innerProfile) {
                  innerProfile.modelGroupsExpandState = state;
                }
              }
            "
            @add="handleAddSingleModel"
            @edit="handleEditModel"
            @delete="handleDeleteModel"
            @delete-group="handleDeleteGroup"
            @clear="handleClearModels"
            @fetch="handleFetchModels"
          />
        </div>

        <!-- 危险操作 -->
        <div class="danger-zone">
          <var-button block type="danger" outline @click="handleDelete">
            <Trash2 :size="18" /> {{ tRaw("tools.llm-api.ProfileEditor.删除此渠道") }}
          </var-button>
        </div>
      </div>
    </div>

    <!-- 子编辑器 -->
    <CustomHeadersEditor
      v-if="innerProfile && innerProfile.customHeaders"
      v-model:show="showHeadersPopup"
      v-model:headers="innerProfile.customHeaders"
    />

    <CustomEndpointsEditor
      v-if="innerProfile && innerProfile.customEndpoints"
      v-model:show="showEndpointsPopup"
      v-model:endpoints="innerProfile.customEndpoints"
    />

    <!-- 图标选择 -->
    <IconSelector v-model:show="showIconSelectorPopup" @select="handleIconSelect" />

    <!-- 多 Key 状态管理 -->
    <KeyStatusManagerPopup v-model:show="showKeyManagerPopup" :profile="innerProfile" />

    <!-- 模型获取弹窗 -->
    <ModelFetcherPopup
      v-model:show="showModelFetcherPopup"
      :models="fetchedModels"
      :existing-models="innerProfile?.models || []"
      @add-models="handleAddModels"
    />

    <!-- 模型编辑弹窗 -->
    <ModelEditorPopup
      v-model:show="showModelEditorPopup"
      :model="editingModel"
      @save="handleSaveModel"
      @delete="handleDeleteModel"
    />
  </var-popup>
</template>

<style scoped>
.editor-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

.close-icon {
  font-size: 28px;
  line-height: 1;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  /* 避让 fixed AppBar: 54px (AppBar) + 24px (原padding) */
  padding: 78px 24px 24px;
  /* 键盘弹出时的额外空间由全局 CSS 控制 */
  scroll-behavior: smooth;
}

.section-header {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.section-header.no-margin {
  margin-bottom: 0;
}

.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.model-management-section {
  margin-bottom: 32px;
}

.config-card {
  background: var(--color-surface-container);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 32px;
}

.config-card.no-padding {
  padding: 0;
}

.config-card.overflow-hidden {
  overflow: hidden;
}

.form-item {
  margin-bottom: 20px;
}

.form-item:last-child {
  margin-bottom: 0;
}

/* 原生输入框样式 */
.native-input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.native-input-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-on-surface);
  display: flex;
  align-items: center;
  gap: 6px;
}

.manage-keys-btn {
  padding: 0 4px;
  height: 24px;
}

.label-icon {
  opacity: 0.7;
}

.native-input,
.native-select {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  line-height: 1.5;
  color: var(--color-on-surface);
  background: var(--color-surface-container);
  border: 1.5px solid var(--color-outline);
  border-radius: 12px;
  outline: none;
  transition: all 0.2s ease;
  -webkit-appearance: none;
  appearance: none;
  box-sizing: border-box;
}

.native-input::placeholder {
  color: var(--color-on-surface);
  opacity: 0.4;
}

.native-input:focus,
.native-select:focus {
  border-color: var(--color-primary);
  background: var(--color-surface-container-high);
  box-shadow: 0 0 0 3px var(--color-primary-container);
}

.native-input.mono {
  font-family: "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace;
  font-size: 14px;
}

.native-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 18px;
  padding-right: 40px;
  cursor: pointer;
}

.native-input-with-action {
  display: flex;
  align-items: stretch;
  gap: 0;
  background: var(--color-surface-container);
  border: 1.5px solid var(--color-outline);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.native-input-with-action:focus-within {
  border-color: var(--color-primary);
  background: var(--color-surface-container-high);
  box-shadow: 0 0 0 3px var(--color-primary-container);
}

.native-input-with-action .native-input {
  flex: 1;
  border: none;
  border-radius: 0;
  background: transparent;
}

.native-input-with-action .native-input:focus {
  box-shadow: none;
}

.input-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  background: transparent;
  border: none;
  color: var(--color-on-surface);
  opacity: 0.6;
  cursor: pointer;
  transition:
    opacity 0.2s,
    background 0.2s;
}

.input-action-btn:hover {
  opacity: 1;
  background: var(--color-surface-container-highest);
}

.input-action-btn:active {
  background: var(--color-surface-container);
}

.avatar-select-section {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  padding: 4px;
}

.avatar-preview-large {
  position: relative;
  width: 80px;
  height: 80px;
  background: var(--color-surface-container-high);
  border-radius: 20px;
  padding: 16px;
  border: 1.5px solid var(--color-outline);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.edit-badge {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 28px;
  height: 28px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-surface-container);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.avatar-info {
  flex: 1;
}

.avatar-label {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.avatar-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.field-icon {
  margin-right: 8px;
}

.url-preview {
  margin-top: -12px;
  margin-bottom: 20px;
  padding: 0 4px;
}

.url-preview.in-group {
  margin-top: 0;
  margin-bottom: 4px;
}

.preview-text {
  font-size: 10px;
  opacity: 0.5;
  font-family: monospace;
  word-break: break-all;
  line-height: 1.4;
}

.preview-hint {
  font-size: 11px;
  color: var(--color-primary);
  margin-top: 4px;
}

.cell-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.custom-cell {
  border-radius: 12px;
  border: 1.5px solid var(--color-outline);
  background: var(--color-surface-container);
}

.danger-zone {
  margin-top: 16px;
  padding-bottom: 48px;
}
</style>
