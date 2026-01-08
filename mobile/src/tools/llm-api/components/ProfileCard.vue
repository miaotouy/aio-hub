<script setup lang="ts">
import { ShieldCheck, Layers } from "lucide-vue-next";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { useI18n } from "@/i18n";
import type { LlmProfile } from "../types";

const { tRaw } = useI18n();

defineProps<{
  profile: LlmProfile;
  isSelected: boolean; // 是否是当前选中的首选渠道
  isManagementMode?: boolean; // 是否处于批量管理模式
  isMultiSelected?: boolean; // 在管理模式下是否被勾选
}>();

defineEmits<{
  (e: "click"): void;
  (e: "select"): void;
  (e: "toggle-enabled", enabled: boolean): void;
  (e: "toggle-multi-select"): void;
}>();
</script>

<template>
  <div
    class="profile-card"
    :class="{ 'is-disabled': !profile.enabled }"
    @click="$emit('click')"
  >
    <div class="card-content">
      <div class="icon-wrapper">
        <DynamicIcon :src="profile.icon || ''" :alt="profile.name" />
      </div>

      <div class="info-wrapper">
        <div class="title-row">
          <span class="profile-name">{{ profile.name }}</span>
          <var-chip size="mini" type="primary" plain>{{ profile.type }}</var-chip>
        </div>
        <div class="profile-url">{{ profile.baseUrl }}</div>
      </div>

      <div class="action-wrapper" @click.stop>
        <var-checkbox
          v-if="isManagementMode"
          :model-value="isMultiSelected"
          @change="$emit('toggle-multi-select')"
        />
        <var-switch
          v-else
          :model-value="profile.enabled"
          @change="(val) => $emit('toggle-enabled', val)"
        />
      </div>
    </div>

    <div class="card-footer">
      <span class="model-count">
        <Layers :size="12" />
        {{ tRaw("tools.llm-api.ProfileCard.N个可用模型", { count: profile.models.length }) }}
      </span>
      <div class="status-wrapper">
        <span v-if="profile.enabled" class="status-enabled">
          <ShieldCheck :size="12" /> {{ tRaw("tools.llm-api.common.已启用") }}
        </span>
        <span v-else class="status-disabled">{{ tRaw("tools.llm-api.common.已禁用") }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-card {
  background: var(--color-surface-container-low);
  border: 1px solid var(--color-outline-variant);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.2s ease;
}

.profile-card:active {
  transform: scale(0.98);
  opacity: 0.9;
}


.profile-card.is-disabled {
  opacity: 0.7;
}

.card-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--color-surface-container);
  overflow: hidden;
  padding: 8px;
  border: 1px solid var(--color-outline-variant);
  flex-shrink: 0;
}

.info-wrapper {
  flex: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.profile-name {
  font-weight: bold;
  font-size: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-url {
  font-size: 12px;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-outline-variant);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  opacity: 0.5;
}

.model-count {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-wrapper {
  display: flex;
  align-items: center;
}

.status-enabled {
  color: var(--color-success);
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-disabled {
  color: var(--color-warning);
}
</style>
