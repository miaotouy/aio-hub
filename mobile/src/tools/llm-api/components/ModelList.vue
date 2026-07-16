<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ChevronRight,
  CircleCheck,
  CircleX,
  Edit,
  List,
  MoreVertical,
  Plus,
  ScanSearch,
  Trash2,
} from "lucide-vue-next";
import type { ChannelProbeResult } from "@aiohub/llm-core";
import { customDialog, customMessage } from "@/utils/feedback";
import { useI18n } from "@/i18n";
import type { LlmModelInfo } from "../types";
import { useModelMetadata } from "../composables/useModelMetadata";
import {
  useTranslatedCapabilities,
  type CapabilityConfig,
} from "../config/model-capabilities";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

interface Props {
  models: LlmModelInfo[];
  editable?: boolean;
  expandState?: string[];
  loading?: boolean;
  probeResults?: Record<string, ChannelProbeResult>;
  probeStale?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  expandState: () => [],
  loading: false,
  probeResults: () => ({}),
  probeStale: false,
});

interface Emits {
  (e: "add"): void;
  (e: "edit", model: LlmModelInfo): void;
  (e: "delete", modelId: string): void;
  (e: "delete-group", modelIds: string[]): void;
  (e: "clear"): void;
  (e: "fetch"): void;
  (e: "probe", modelId?: string): void;
  (e: "update:expandState", state: string[]): void;
}

const emit = defineEmits<Emits>();
const showHeaderMenu = ref(false);
const activeModelMenu = ref<string>();

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

const deleteGroup = async (group: {
  name: string;
  models: { model: LlmModelInfo }[];
}) => {
  const confirm = await customDialog({
    title: tRaw("tools.llm-api.ModelList.确认删除分组"),
    message: tRaw("tools.llm-api.ModelList.确定要删除分组N下的所有M个模型吗", {
      name: group.name,
      count: group.models.length,
    }),
    confirmButtonText: t("common.确认"),
    cancelButtonText: t("common.取消"),
  });

  if (confirm) {
    const modelIds = group.models.map((item) => item.model.id);
    emit("delete-group", modelIds);
  }
};
const getEnabledCapabilities = (model: LlmModelInfo): CapabilityConfig[] => {
  return translatedCapabilities.value.filter(
    (cap) => model.capabilities?.[cap.key]
  );
};

const showCapabilityDesc = (capability: CapabilityConfig) => {
  customMessage(capability.description, "info");
};

const resultSummary = (modelId: string) => {
  const result = props.probeResults[modelId];
  if (!result) return "尚未检查";
  if (props.probeStale) return "配置已变化";
  return result.success
    ? `检查成功  ${Math.round(result.totalMs)} ms`
    : result.errorMessage || "检查失败";
};

const closeMenus = () => {
  showHeaderMenu.value = false;
  activeModelMenu.value = undefined;
};

const handleHeaderAction = (action: "fetch" | "add" | "clear") => {
  closeMenus();
  if (action === "fetch") emit("fetch");
  if (action === "add") emit("add");
  if (action === "clear") emit("clear");
};

const handleModelAction = (
  action: "probe" | "edit" | "delete",
  model: LlmModelInfo
) => {
  closeMenus();
  if (action === "probe") emit("probe", model.id);
  if (action === "edit") emit("edit", model);
  if (action === "delete") emit("delete", model.id);
};
</script>

<template>
  <div class="model-list">
    <div class="list-header">
      <span class="model-count">模型 {{ models.length }}</span>
      <div class="list-actions">
        <button
          v-if="editable"
          class="header-action probe-action"
          :disabled="models.length === 0"
          @click="emit('probe')"
        >
          <ScanSearch :size="17" /> 检查
        </button>
        <div v-if="editable" class="menu-wrap">
          <button
            class="header-action icon-only"
            aria-label="更多模型操作"
            @click="showHeaderMenu = !showHeaderMenu"
          >
            <MoreVertical :size="20" />
          </button>
          <div v-if="showHeaderMenu" class="action-menu header-menu">
            <button @click="handleHeaderAction('fetch')">
              <List :size="17" />{{
                tRaw("tools.llm-api.ModelList.从 API 获取")
              }}
            </button>
            <button @click="handleHeaderAction('add')">
              <Plus :size="17" />{{ tRaw("tools.llm-api.ModelList.手动添加") }}
            </button>
            <button
              v-if="models.length"
              class="danger"
              @click="handleHeaderAction('clear')"
            >
              <Trash2 :size="17" />{{ t("common.清空") }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="list-content">
      <div v-if="models.length === 0" class="list-empty">
        <p>{{ tRaw("tools.llm-api.ModelList.还没有添加任何模型") }}</p>
        <p class="hint">
          {{
            tRaw("tools.llm-api.ModelList.点击手动添加或从API获取来添加模型")
          }}
        </p>
        <button
          class="empty-fetch-button"
          :disabled="loading"
          @click="emit('fetch')"
        >
          <List :size="17" />
          {{
            loading ? "正在获取" : tRaw("tools.llm-api.ModelList.从 API 获取")
          }}
        </button>
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
              <div
                v-for="item in group.models"
                :key="item.model.id"
                class="model-card"
                v-ripple
              >
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

                  <div v-if="editable" class="model-actions menu-wrap">
                    <button
                      class="model-menu-button"
                      :aria-label="`${item.model.name} 的更多操作`"
                      @click.stop="
                        activeModelMenu =
                          activeModelMenu === item.model.id
                            ? undefined
                            : item.model.id
                      "
                    >
                      <MoreVertical :size="19" />
                    </button>
                    <div
                      v-if="activeModelMenu === item.model.id"
                      class="action-menu model-menu"
                    >
                      <button
                        @click.stop="handleModelAction('probe', item.model)"
                      >
                        <ScanSearch :size="17" />检查模型
                      </button>
                      <button
                        @click.stop="handleModelAction('edit', item.model)"
                      >
                        <Edit :size="17" />编辑模型
                      </button>
                      <button
                        class="danger"
                        @click.stop="handleModelAction('delete', item.model)"
                      >
                        <Trash2 :size="17" />删除模型
                      </button>
                    </div>
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
                      <span class="capability-label">{{
                        capability.label
                      }}</span>
                    </div>
                  </template>
                </div>

                <button
                  class="probe-summary"
                  @click.stop="emit('probe', item.model.id)"
                >
                  <component
                    :is="
                      probeResults[item.model.id]?.success
                        ? CircleCheck
                        : probeResults[item.model.id]
                          ? CircleX
                          : ScanSearch
                    "
                    :size="15"
                  />
                  <span>{{ resultSummary(item.model.id) }}</span>
                  <ChevronRight :size="16" />
                </button>
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
  min-height: 44px;
  padding: 0 2px;
}

.model-count {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-on-surface);
}

.list-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-action,
.model-menu-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border: 0;
  border-radius: var(--app-radius-md, 10px);
  color: var(--color-on-surface);
  background: transparent;
}

.header-action {
  gap: 6px;
  padding: 0 10px;
  color: var(--color-primary);
  font-weight: 700;
}

.header-action:disabled {
  opacity: 0.4;
}

.header-action.icon-only,
.model-menu-button {
  width: 44px;
  padding: 0;
}

.menu-wrap {
  position: relative;
}

.action-menu {
  position: absolute;
  z-index: 15;
  display: grid;
  min-width: 170px;
  overflow: hidden;
  padding: 5px;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--app-radius-md, 10px);
  background: var(--container-bg, var(--color-surface-container));
  box-shadow: 0 8px 24px
    color-mix(in srgb, var(--color-on-surface) 15%, transparent);
}

.header-menu,
.model-menu {
  top: 44px;
  right: 0;
}

.action-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 11px;
  border: 0;
  border-radius: calc(var(--app-radius-md, 10px) - 3px);
  color: var(--color-on-surface);
  text-align: left;
  background: transparent;
  white-space: nowrap;
}

.action-menu button:active {
  background: var(--color-surface-container-high);
}

.action-menu button.danger {
  color: var(--danger-color);
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

.empty-fetch-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  margin-top: 16px;
  padding: 0 16px;
  border: 1px solid var(--color-primary);
  border-radius: var(--app-radius-md, 10px);
  color: var(--color-on-primary);
  background: var(--color-primary);
  font-weight: 700;
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
  transition:
    transform 0.18s,
    opacity 0.18s;
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

.probe-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 44px;
  padding: 7px 2px 0;
  border: 0;
  border-top: 1px dashed var(--color-outline-variant);
  color: var(--color-on-surface-variant);
  text-align: left;
  background: transparent;
  font-size: 0.76rem;
}

.probe-summary span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 340px) {
  .probe-action {
    padding-inline: 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .model-card {
    transition: none;
  }
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
  background: color-mix(
    in srgb,
    var(--cap-color, currentColor) 12%,
    transparent
  );
  font-size: 0.8rem;
}

.capability-label {
  font-weight: 500;
}
</style>
