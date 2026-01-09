<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "@/i18n";
import { useLlmKeyManager } from "../composables/useLlmKeyManager";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import type { LlmProfile } from "../types";
import { ChevronLeft, ShieldCheck, RotateCcw, Clock, AlertCircle, Plus } from "lucide-vue-next";
import { Snackbar, Dialog } from "@varlet/ui";

const props = defineProps<{
  show: boolean;
  profile: LlmProfile | null;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
}>();

const { t, tRaw } = useI18n();
const keyManager = useLlmKeyManager();
const profilesStore = useLlmProfilesStore();

const showImportDialog = ref(false);
const importText = ref("");

const keyStatuses = computed(() => {
  if (!props.profile) return [];
  const statuses = keyManager.getKeyStatuses(props.profile.id);

  // 按照 profile.apiKeys 的顺序返回，确保一致性
  return props.profile.apiKeys.map((key) => {
    return (
      statuses[key] || {
        key,
        isEnabled: true,
        isBroken: false,
        errorCount: 0,
      }
    );
  });
});

const formatTime = (timestamp?: number) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString();
};

const maskKey = (key: string) => {
  if (key.length <= 12) return key;
  return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
};

const handleResetBroken = () => {
  if (!props.profile) return;
  keyManager.resetAllBroken(props.profile.id);
  Snackbar.success(tRaw("tools.llm-api.KeyManager.已重置所有熔断"));
};

const toggleKeyEnabled = (key: string, current: boolean) => {
  if (!props.profile) return;
  keyManager.updateKeyStatus(props.profile.id, key, { isEnabled: !current });
};

const handleResetSingle = (key: string) => {
  if (!props.profile) return;
  keyManager.updateKeyStatus(props.profile.id, key, {
    isBroken: false,
    errorCount: 0,
    disabledTime: undefined,
    lastErrorMessage: undefined,
  });
};

const showDetails = (status: any) => {
  if (!status.lastErrorMessage) return;
  Dialog({
    title: t("common.错误详情"),
    message: status.lastErrorMessage,
    confirmButtonText: t("common.确定"),
  });
};

const hasBrokenKeys = computed(() => {
  return keyStatuses.value.some((s) => s.isBroken);
});

const handleBatchImport = () => {
  if (!props.profile || !importText.value) {
    showImportDialog.value = false;
    return;
  }

  // 支持换行、中英文逗号、中英文分号、空格分隔
  const newKeys = importText.value
    .split(/[,\n，;；\s]+/)
    .map((k) => k.trim())
    .filter((k) => k && !props.profile!.apiKeys.includes(k));

  if (newKeys.length > 0) {
    const uniqueNewKeys = Array.from(new Set(newKeys));
    const updatedKeys = [...props.profile.apiKeys, ...uniqueNewKeys];

    profilesStore.updateProfile(props.profile.id, {
      apiKeys: updatedKeys,
    });

    Snackbar.success(tRaw("tools.llm-api.KeyManager.导入成功N个", { count: uniqueNewKeys.length }));
  }

  importText.value = "";
  showImportDialog.value = false;
};
</script>

<template>
  <var-popup
    :show="show"
    @update:show="(val) => emit('update:show', val)"
    position="right"
    style="width: 100%; height: 100%"
  >
    <div class="manager-popup">
      <var-app-bar :title="tRaw('tools.llm-api.KeyManager.多Key状态管理')" fixed safe-area>
        <template #left>
          <var-button round text @click="emit('update:show', false)">
            <ChevronLeft :size="24" />
          </var-button>
        </template>
        <template #right>
          <div class="flex items-center">
            <var-button text @click="showImportDialog = true">
              <Plus :size="18" class="mr-1" />
              {{ tRaw("tools.llm-api.KeyManager.批量导入") }}
            </var-button>
            <var-button v-if="hasBrokenKeys" text @click="handleResetBroken">
              <RotateCcw :size="18" class="mr-1" />
              {{ t("common.全部重置") }}
            </var-button>
          </div>
        </template>
      </var-app-bar>

      <div class="manager-content">
        <div class="info-banner">
          <ShieldCheck :size="20" class="banner-icon" />
          <div class="banner-text">
            {{ tRaw("tools.llm-api.KeyManager.提示说明") }}
          </div>
        </div>

        <div class="settings-group">
          <div class="section-header">{{ tRaw("tools.llm-api.KeyManager.策略设置") }}</div>
          <div class="config-card">
            <var-cell>
              {{ tRaw("tools.llm-api.KeyManager.自动熔断") }}
              <template #description>{{ tRaw("tools.llm-api.KeyManager.自动熔断说明") }}</template>
              <template #extra>
                <var-switch
                  :model-value="keyManager.getEnableAutoDisable()"
                  @update:model-value="(val) => keyManager.setEnableAutoDisable(val as boolean)"
                />
              </template>
            </var-cell>
            <var-cell>
              {{ tRaw("tools.llm-api.KeyManager.自动恢复时长") }}
              <template #description>{{ tRaw("tools.llm-api.KeyManager.自动恢复说明") }}</template>
              <template #extra>
                <var-select
                  :model-value="keyManager.getAutoRecoveryTime()"
                  @update:model-value="(val) => keyManager.setAutoRecoveryTime(val as number)"
                  size="small"
                  style="width: 100px"
                >
                  <var-option :label="tRaw('tools.llm-api.KeyManager.1分钟')" :value="60000" />
                  <var-option :label="tRaw('tools.llm-api.KeyManager.5分钟')" :value="300000" />
                  <var-option :label="tRaw('tools.llm-api.KeyManager.30分钟')" :value="1800000" />
                  <var-option :label="tRaw('tools.llm-api.KeyManager.从不')" :value="0" />
                </var-select>
              </template>
            </var-cell>
          </div>
        </div>

        <div v-if="keyStatuses.length === 0" class="empty-state">
          <AlertCircle :size="48" class="empty-icon" />
          <p>{{ tRaw("tools.llm-api.KeyManager.暂无Key") }}</p>
        </div>

        <div v-else class="key-list">
          <div class="section-header">{{ tRaw("tools.llm-api.KeyManager.Key列表") }}</div>
          <div
            v-for="status in keyStatuses"
            :key="status.key"
            class="key-item-card"
            :class="{ 'is-broken': status.isBroken, 'is-disabled': !status.isEnabled }"
          >
            <div class="key-header">
              <div class="key-info">
                <div class="key-name-row">
                  <span class="key-text mono">{{ maskKey(status.key) }}</span>
                  <var-chip v-if="status.isBroken" type="danger" size="mini" class="status-chip">
                    {{ tRaw("tools.llm-api.KeyManager.已熔断") }}
                  </var-chip>
                  <var-chip
                    v-else-if="!status.isEnabled"
                    type="default"
                    size="mini"
                    class="status-chip"
                  >
                    {{ t("common.已禁用") }}
                  </var-chip>
                  <var-chip v-else type="success" size="mini" class="status-chip">
                    {{ t("common.正常") }}
                  </var-chip>
                </div>
                <div class="key-meta">
                  <span v-if="status.lastUsedTime" class="meta-item">
                    <Clock :size="12" /> {{ formatTime(status.lastUsedTime) }}
                  </span>
                  <span v-if="status.errorCount > 0" class="meta-item error">
                    <AlertCircle :size="12" />
                    {{ tRaw("tools.llm-api.KeyManager.N次失败", { count: status.errorCount }) }}
                  </span>
                </div>
              </div>
              <var-switch
                :model-value="status.isEnabled"
                @update:model-value="toggleKeyEnabled(status.key, status.isEnabled)"
                size="20"
              />
            </div>

            <div v-if="status.isBroken || status.lastErrorMessage" class="key-footer">
              <div class="error-msg text-truncate" @click="showDetails(status)">
                {{
                  status.lastErrorMessage ||
                  status.note ||
                  t("common.未知错误")
                }}
              </div>
              <var-button
                v-if="status.isBroken"
                type="primary"
                size="mini"
                text
                @click="handleResetSingle(status.key)"
              >
                {{ t("common.重置") }}
              </var-button>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 批量导入弹窗 -->
    <var-dialog
      v-model:show="showImportDialog"
      :title="tRaw('tools.llm-api.KeyManager.批量导入')"
      @confirm="handleBatchImport"
    >
      <div class="import-dialog-content">
        <p class="import-tip">{{ tRaw("tools.llm-api.KeyManager.批量导入提示") }}</p>
        <var-input
          v-model="importText"
          textarea
          :rows="8"
          variant="outlined"
          :placeholder="tRaw('tools.llm-api.ProfileEditor.API Key 占位符')"
        />
      </div>
    </var-dialog>
  </var-popup>
</template>

<style scoped>
.manager-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

.manager-content {
  flex: 1;
  overflow-y: auto;
  padding: 78px 16px 24px;
}

.info-banner {
  display: flex;
  gap: 12px;
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 20px;
  align-items: flex-start;
}

.banner-icon {
  margin-top: 2px;
  flex-shrink: 0;
}

.banner-text {
  font-size: 0.9rem;
  line-height: 1.5;
}

.key-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.key-item-card {
  background: var(--color-surface-container);
  border-radius: 16px;
  padding: 16px;
  border: 1.5px solid var(--color-outline-variant);
  transition: all 0.2s ease;
}

.key-item-card.is-broken {
  border-color: var(--color-danger);
  background: var(--color-danger-container);
}

.key-item-card.is-disabled {
  opacity: 0.6;
}

.key-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.key-info {
  flex: 1;
}

.key-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.key-text {
  font-size: 1.05rem;
  font-weight: 600;
}

.mono {
  font-family: monospace;
}

.key-meta {
  display: flex;
  gap: 12px;
  font-size: 0.85rem;
  color: var(--color-on-surface-variant);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-item.error {
  color: var(--color-danger);
}

.key-footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-outline-variant);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.error-msg {
  font-size: 0.85rem;
  color: var(--color-danger);
  flex: 1;
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: var(--color-on-surface-variant);
}

.empty-icon {
  opacity: 0.2;
  margin-bottom: 12px;
}

.settings-group {
  margin-bottom: 24px;
}

.section-header {
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.config-card {
  background: var(--color-surface-container);
  border-radius: 16px;
  overflow: hidden;
  border: 1.5px solid var(--color-outline-variant);
}

.mr-1 {
  margin-right: 4px;
}
</style>
