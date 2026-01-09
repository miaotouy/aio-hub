<script setup lang="ts">
import { computed } from "vue";
import { Trash2, Edit, Plus, List } from "lucide-vue-next";
import { Dialog, Snackbar } from "@varlet/ui";
import { useI18n } from "@/i18n";
import type { LlmModelInfo } from "../types";
import { useModelMetadata } from "../composables/useModelMetadata";
import { useTranslatedCapabilities, type CapabilityConfig } from "../config/model-capabilities";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

interface Props {
  models: LlmModelInfo[];
  editable?: boolean;
  expandState?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  expandState: () => [],
});

interface Emits {
  (e: "add"): void;
  (e: "edit", model: LlmModelInfo): void;
  (e: "delete", modelId: string): void;
  (e: "delete-group", modelIds: string[]): void;
  (e: "clear"): void;
  (e: "fetch"): void;
  (e: "update:expandState", state: string[]): void;
}

const emit = defineEmits<Emits>();

const { getModelIcon, getModelGroup } = useModelMetadata();
const { capabilities: translatedCapabilities } = useTranslatedCapabilities();

const modelGroups = computed(() => {
  const groups = new Map<string, Array<{ model: LlmModelInfo }>>();

  props.models.forEach((model) => {
    const group = getModelGroup(model);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push({ model });
  });

  const result = Array.from(groups.entries()).map(([name, items]) => ({
    name,
    models: items,
  }));

  return result;
});

const handleExpandChange = (value: any) => {
  const state = Array.isArray(value) ? value : value ? [value] : [];
  emit("update:expandState", state);
};

const { t, tRaw } = useI18n();

const deleteGroup = async (group: { name: string; models: { model: LlmModelInfo }[] }) => {
  const confirm = await Dialog({
    title: tRaw("tools.llm-api.ModelList.确认删除分组"),
    message: tRaw("tools.llm-api.ModelList.确定要删除分组N下的所有M个模型吗", {
      name: group.name,
      count: group.models.length,
    }),
    confirmButtonText: t("common.确认"),
    cancelButtonText: t("common.取消"),
  });

  if (confirm === "confirm") {
    const modelIds = group.models.map((item) => item.model.id);
    emit("delete-group", modelIds);
  }
};
const getEnabledCapabilities = (model: LlmModelInfo): CapabilityConfig[] => {
  return translatedCapabilities.value.filter((cap) => model.capabilities?.[cap.key]);
};

const showCapabilityDesc = (capability: CapabilityConfig) => {
  Snackbar.info({
    content: capability.description,
    duration: 4000,
  });
};
</script>

<template>
  <div class="model-list">
    <div class="list-header">
      <span class="model-count">{{
        tRaw("tools.llm-api.ModelList.已添加N个模型", { count: models.length })
      }}</span>
      <div class="list-actions">
        <var-button v-if="editable" size="mini" type="primary" plain @click="emit('fetch')">
          <List :size="14" /> {{ tRaw("tools.llm-api.ModelList.从 API 获取") }}
        </var-button>
        <var-button v-if="editable" size="mini" type="primary" @click="emit('add')">
          <Plus :size="14" /> {{ tRaw("tools.llm-api.ModelList.手动添加") }}
        </var-button>
        <var-button
          v-if="editable && models.length > 0"
          size="mini"
          type="danger"
          plain
          @click="emit('clear')"
        >
          <Trash2 :size="14" /> {{ t("common.清空") }}
        </var-button>
      </div>
    </div>

    <div class="list-content">
      <div v-if="models.length === 0" class="list-empty">
        <p>{{ tRaw("tools.llm-api.ModelList.还没有添加任何模型") }}</p>
        <p class="hint">{{ tRaw("tools.llm-api.ModelList.点击手动添加或从API获取来添加模型") }}</p>
      </div>

      <div v-else class="model-groups">
        <var-collapse
          :model-value="expandState"
          @update:model-value="handleExpandChange"
          :offset-top="false"
          :divider="false"
        >
          <var-collapse-item
            v-for="group in modelGroups"
            :key="group.name"
            :name="group.name"
            class="model-group"
          >
            <template #title>
              <div class="group-title">
                <span class="group-name">{{ group.name }}</span>
                <span class="group-count">{{ group.models.length }}</span>
              </div>
            </template>

            <template #icon>
              <var-button
                v-if="editable"
                size="mini"
                type="danger"
                plain
                round
                @click.stop="deleteGroup(group)"
              >
                <Trash2 :size="14" />
              </var-button>
            </template>

            <div class="group-content">
              <div v-for="item in group.models" :key="item.model.id" class="model-card" v-ripple>
                <div class="model-card-main">
                  <DynamicIcon
                    class="model-logo"
                    :src="getModelIcon(item.model) || ''"
                    :alt="item.model.name"
                  />

                  <div class="model-info">
                    <div class="model-name">{{ item.model.name }}</div>
                    <div class="model-id">{{ item.model.id }}</div>
                  </div>

                  <div v-if="editable" class="model-actions">
                    <var-button
                      size="mini"
                      type="primary"
                      plain
                      round
                      @click="emit('edit', item.model)"
                    >
                      <Edit :size="14" />
                    </var-button>
                    <var-button
                      size="mini"
                      type="danger"
                      plain
                      round
                      @click="emit('delete', item.model.id)"
                    >
                      <Trash2 :size="14" />
                    </var-button>
                  </div>
                </div>

                <div
                  v-if="getEnabledCapabilities(item.model).length > 0"
                  class="model-capabilities"
                >
                  <template
                    v-for="capability in getEnabledCapabilities(item.model)"
                    :key="capability.key"
                  >
                    <div
                      class="capability-tag"
                      :style="{
                        '--cap-color': capability.color,
                        color: capability.color,
                      }"
                      v-ripple
                      @click.stop="showCapabilityDesc(capability)"
                    >
                      <component :is="capability.icon" :size="12" />
                      <span class="capability-label">{{ capability.label }}</span>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </var-collapse-item>
        </var-collapse>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.model-count {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-on-surface);
}

.list-actions {
  display: flex;
  gap: 8px;
}

.list-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list-empty {
  text-align: center;
  padding: 48px 24px;
  color: var(--color-on-surface-variant);
  background: var(--color-surface-container);
  border-radius: 16px;
  border: 1px dashed var(--color-outline-variant);
}

.list-empty .hint {
  font-size: 0.85rem;
  margin-top: 8px;
  opacity: 0.7;
}

.model-groups {
  display: flex;
  flex-direction: column;
}

.model-group {
  border-radius: 16px;
  overflow: hidden;
  background: var(--color-surface-container);
  margin-bottom: 12px;
}

.model-group:last-child {
  margin-bottom: 0;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.group-name {
  font-weight: 600;
  font-size: 1rem;
  color: var(--color-on-surface);
}

.group-count {
  font-size: 0.85rem;
  color: var(--color-primary);
  padding: 2px 8px;
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
  border-radius: 10px;
  line-height: 1.4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
}

.group-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 4px 8px;
}

.model-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--color-outline-variant);
  background: var(--color-surface);
  transition: all 0.2s;
}

.model-card:active {
  background: var(--color-surface-container-high);
}

.model-card-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-on-surface);
  margin-bottom: 2px;
  line-height: 1.4;
}

.model-id {
  font-size: 0.85rem;
  color: var(--color-on-surface-variant);
  font-family: monospace;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.model-capabilities {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  border-top: 1px dashed var(--color-outline-variant);
  padding-top: 8px;
}

.capability-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--cap-color, currentColor) 12%, transparent);
  font-size: 0.8rem;
}

.capability-label {
  font-weight: 500;
}
</style>
