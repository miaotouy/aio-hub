<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronDown, ChevronLeft } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { customMessage } from "@/utils/feedback";
import type { PresetMessage, PresetMessageGroup } from "../types/agent";

const props = defineProps<{
  open: boolean;
  message?: PresetMessage | null;
  groups: PresetMessageGroup[];
}>();
const emit = defineEmits<{ close: []; save: [message: PresetMessage] }>();
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.agent-manager.PresetEditor.${key}`);
const roles: PresetMessage["role"][] = ["system", "user", "assistant"];
const form = ref<PresetMessage>(createEmptyMessage());
const advancedOpen = ref(false);
const modelOpen = ref(false);
const isNew = computed(() => !props.message);

function createEmptyMessage(): PresetMessage {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    childrenIds: [],
    role: "system",
    status: "complete",
    content: "",
    timestamp: new Date().toISOString(),
    isEnabled: true,
  };
}

watch(
  () => [props.open, props.message] as const,
  ([open, message]) => {
    if (!open) return;
    form.value = structuredClone(message || createEmptyMessage());
    advancedOpen.value = false;
    modelOpen.value = false;
  },
  { immediate: true }
);

const strategyType = computed({
  get: () => {
    const strategy = form.value.injectionStrategy;
    if (!strategy) return "default";
    if (strategy.type) return strategy.type;
    if (strategy.depthConfig) return "advanced_depth";
    if (strategy.depth !== undefined) return "depth";
    if (strategy.anchorTarget) return "anchor";
    return "default";
  },
  set: (value: "default" | "depth" | "advanced_depth" | "anchor") => {
    if (value === "default") {
      form.value.injectionStrategy = undefined;
      return;
    }
    const current = form.value.injectionStrategy || {};
    form.value.injectionStrategy = { ...current, type: value };
    if (value === "depth" && current.depth === undefined) form.value.injectionStrategy.depth = 0;
    if (value === "advanced_depth" && !current.depthConfig) form.value.injectionStrategy.depthConfig = "0";
    if (value === "anchor") {
      form.value.injectionStrategy.anchorTarget ||= "chat_history";
      form.value.injectionStrategy.anchorPosition ||= "before";
    }
  },
});

const modelMatchEnabled = computed({
  get: () => form.value.modelMatch?.enabled === true,
  set: (enabled: boolean) => {
    form.value.modelMatch = {
      ...(form.value.modelMatch || { patterns: [] }),
      enabled,
      patterns: form.value.modelMatch?.patterns || [],
    };
  },
});

function joinLines(values?: string[]): string {
  return values?.join("\n") || "";
}

function updatePatterns(key: "patterns" | "profilePatterns", event: Event): void {
  if (!form.value.modelMatch) return;
  form.value.modelMatch[key] = (event.target as HTMLTextAreaElement).value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function save(): void {
  if (!form.value.content.trim()) {
    customMessage(t("消息内容不能为空"), "warning");
    return;
  }
  emit("save", structuredClone(form.value));
}
</script>

<template>
  <Transition name="sheet">
    <section v-if="open" class="editor-overlay" role="dialog" aria-modal="true">
      <header>
        <button type="button" class="icon-button" :aria-label="t('返回')" @click="emit('close')">
          <ChevronLeft :size="24" />
        </button>
        <strong>{{ isNew ? t("新增预设消息") : t("编辑预设消息") }}</strong>
        <button class="save-button" type="button" @click="save">{{ t("保存") }}</button>
      </header>

      <main>
        <div class="field">
          <span>{{ t("角色") }}</span>
          <div class="role-tabs">
            <button
              v-for="role in roles"
              :key="role"
              type="button"
              :class="{ active: form.role === role }"
              @click="form.role = role"
            >
              {{ role }}
            </button>
          </div>
        </div>

        <label class="field">
          <span>{{ t("消息名称") }}</span>
          <input v-model="form.name" :placeholder="t('消息名称占位')" />
        </label>
        <label class="field">
          <span>{{ t("所属组") }}</span>
          <select v-model="form.groupId">
            <option :value="undefined">{{ t("不分组") }}</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
          </select>
        </label>
        <label class="field content-field">
          <span>{{ t("内容") }}</span>
          <textarea v-model="form.content" rows="14" :placeholder="t('内容占位')" />
        </label>

        <section class="advanced">
          <button type="button" @click="advancedOpen = !advancedOpen">
            {{ t("注入策略") }}
            <ChevronDown :class="{ rotate: advancedOpen }" :size="17" />
          </button>
          <div v-show="advancedOpen" class="advanced-body">
            <label>
              {{ t("策略") }}
              <select v-model="strategyType">
                <option value="default">{{ t("默认顺序") }}</option>
                <option value="depth">{{ t("按上下文深度") }}</option>
                <option value="advanced_depth">{{ t("高级深度") }}</option>
                <option value="anchor">{{ t("锚点附近") }}</option>
              </select>
            </label>
            <label v-if="strategyType === 'depth'">
              {{ t("深度") }}
              <input v-model.number="form.injectionStrategy!.depth" type="number" min="0" />
            </label>
            <label v-if="strategyType === 'advanced_depth'">
              {{ t("高级深度规则") }}
              <input v-model="form.injectionStrategy!.depthConfig" :placeholder="t('高级深度占位')" />
            </label>
            <template v-if="strategyType === 'anchor'">
              <label>
                {{ t("锚点") }}
                <input v-model="form.injectionStrategy!.anchorTarget" />
              </label>
              <label>
                {{ t("锚点位置") }}
                <select v-model="form.injectionStrategy!.anchorPosition">
                  <option value="before">{{ t("之前") }}</option>
                  <option value="after">{{ t("之后") }}</option>
                </select>
              </label>
            </template>
            <label v-if="strategyType !== 'default'">
              {{ t("排序权重") }}
              <input v-model.number="form.injectionStrategy!.order" type="number" />
            </label>
          </div>
        </section>

        <section class="advanced">
          <button type="button" @click="modelOpen = !modelOpen">
            {{ t("模型匹配") }}
            <ChevronDown :class="{ rotate: modelOpen }" :size="17" />
          </button>
          <div v-show="modelOpen" class="advanced-body">
            <label class="check">
              <input v-model="modelMatchEnabled" type="checkbox" />
              {{ t("启用模型匹配") }}
            </label>
            <template v-if="form.modelMatch?.enabled">
              <label>
                {{ t("匹配模式") }}
                <select v-model="form.modelMatch.mode">
                  <option value="any">{{ t("任一规则") }}</option>
                  <option value="all">{{ t("全部规则") }}</option>
                </select>
              </label>
              <label class="check">
                <input v-model="form.modelMatch.exclude" type="checkbox" />
                {{ t("排除匹配项") }}
              </label>
              <label>
                {{ t("模型规则") }}
                <textarea
                  :value="joinLines(form.modelMatch.patterns)"
                  rows="4"
                  :placeholder="t('每行一个规则')"
                  @input="updatePatterns('patterns', $event)"
                />
              </label>
              <label>
                {{ t("渠道规则") }}
                <textarea
                  :value="joinLines(form.modelMatch.profilePatterns)"
                  rows="4"
                  :placeholder="t('每行一个规则')"
                  @input="updatePatterns('profilePatterns', $event)"
                />
              </label>
              <label class="check">
                <input v-model="form.modelMatch.matchProfileName" type="checkbox" />
                {{ t("兼容渠道名称匹配") }}
              </label>
            </template>
          </div>
        </section>
      </main>
    </section>
  </Transition>
</template>

<style scoped>
.editor-overlay { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column; color: var(--text-color); background: var(--card-bg); }
.editor-overlay header { min-height: 58px; padding: env(safe-area-inset-top) 14px 0; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; border-bottom: var(--border-width) solid var(--border-color); }
.editor-overlay header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor-overlay main { flex: 1; overflow: auto; padding: 18px 16px max(30px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 18px; }
.icon-button { padding: 8px; border: 0; color: inherit; background: transparent; }
.save-button { padding: 8px 13px; border: 0; border-radius: 7px; color: white; background: var(--color-primary); }
.field { display: flex; flex-direction: column; gap: 7px; color: var(--color-on-surface-variant); font-size: .82rem; }
input, select, textarea { box-sizing: border-box; width: 100%; padding: 11px; border: var(--border-width) solid var(--border-color); border-radius: 8px; color: var(--text-color); background: var(--input-bg); font: inherit; }
.content-field textarea { min-height: 40vh; line-height: 1.55; resize: vertical; }
.role-tabs { display: flex; gap: 7px; }
.role-tabs button { flex: 1; padding: 9px; border: var(--border-width) solid var(--border-color); border-radius: 7px; color: var(--text-color); background: transparent; text-transform: capitalize; }
.role-tabs .active { border-color: var(--color-primary); color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
.advanced { overflow: hidden; border: var(--border-width) solid var(--border-color); border-radius: 8px; }
.advanced > button { width: 100%; padding: 12px; display: flex; align-items: center; justify-content: space-between; border: 0; color: var(--text-color); background: var(--input-bg); text-align: left; }
.advanced-body { padding: 12px; display: flex; flex-direction: column; gap: 12px; font-size: .8rem; }
.advanced-body label { display: flex; flex-direction: column; gap: 6px; }
.advanced-body .check { flex-direction: row; align-items: center; }
.advanced-body .check input { width: auto; }
.rotate { transform: rotate(180deg); }
.sheet-enter-active, .sheet-leave-active { transition: transform .22s ease; }
.sheet-enter-from, .sheet-leave-to { transform: translateY(100%); }
</style>
