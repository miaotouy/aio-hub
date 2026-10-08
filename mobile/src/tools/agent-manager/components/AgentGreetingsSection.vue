<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, ChevronLeft, MessageCircle, Plus, Trash2 } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { customMessage } from "@/utils/feedback";
import { generateUuid } from "@/utils/uuid";
import type { GreetingMessage } from "../types/agent";

const props = defineProps<{
  greetings: GreetingMessage[] | undefined;
  defaultGreetingId?: string;
}>();
const emit = defineEmits<{
  "update:greetings": [greetings: GreetingMessage[]];
  "update:defaultGreetingId": [id?: string];
}>();

const { useScopedT } = useI18n();
const t = useScopedT("tools.agent-manager.Greetings");

const roles: Array<"assistant" | "user"> = ["assistant", "user"];

const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const form = ref<GreetingMessage>(createEmptyGreeting());

function createEmptyGreeting(): GreetingMessage {
  return {
    id: generateUuid(),
    role: "assistant",
    content: "",
  };
}

const isNew = computed(() => editingId.value === null);

const greetings = computed(() => props.greetings ?? []);

function openCreate(): void {
  editingId.value = null;
  form.value = createEmptyGreeting();
  editorOpen.value = true;
}

function openEdit(greeting: GreetingMessage): void {
  editingId.value = greeting.id;
  form.value = structuredClone(greeting);
  editorOpen.value = true;
}

watch(editorOpen, (open) => {
  if (!open) return;
  form.value = isNew.value
    ? createEmptyGreeting()
    : structuredClone(
        greetings.value.find((item) => item.id === editingId.value) ||
          createEmptyGreeting()
      );
});

function save(): void {
  if (!form.value.content.trim()) {
    customMessage(t("内容不能为空"), "warning");
    return;
  }
  const saved = structuredClone({
    ...form.value,
    content: form.value.content.trim(),
  });
  if (isNew.value) {
    emit("update:greetings", [...greetings.value, saved]);
    if (!props.defaultGreetingId) emit("update:defaultGreetingId", saved.id);
  } else {
    emit(
      "update:greetings",
      greetings.value.map((item) => (item.id === saved.id ? saved : item))
    );
  }
  editorOpen.value = false;
}

function remove(greeting: GreetingMessage): void {
  emit(
    "update:greetings",
    greetings.value.filter((item) => item.id !== greeting.id)
  );
  if (props.defaultGreetingId === greeting.id) {
    emit("update:defaultGreetingId", undefined);
  }
}

function setDefault(greeting: GreetingMessage): void {
  emit("update:defaultGreetingId", greeting.id);
}

function excerpt(content: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
</script>

<template>
  <section class="form-section" data-testid="agent-greetings">
    <div class="section-heading">
      <div>
        <h2>{{ t("标题") }}</h2>
        <p>{{ t("说明") }}</p>
      </div>
      <button
        class="add-button"
        type="button"
        data-testid="agent-greeting-add"
        @click="openCreate"
      >
        <Plus :size="16" />
        {{ t("新增") }}
      </button>
    </div>

    <p v-if="greetings.length === 0" class="greeting-empty">
      {{ t("暂无") }}
    </p>

    <div
      v-for="greeting in greetings"
      :key="greeting.id"
      class="greeting-item"
      data-testid="agent-greeting-item"
      :data-greeting-id="greeting.id"
    >
      <div class="greeting-copy">
        <div class="greeting-meta">
          <span class="role-badge">{{ greeting.role }}</span>
          <span
            v-if="defaultGreetingId === greeting.id"
            class="default-badge"
            data-testid="agent-greeting-default-badge"
          >
            <Check :size="12" />
            {{ t("默认") }}
          </span>
          <span v-if="greeting.name" class="greeting-name">{{ greeting.name }}</span>
        </div>
        <p>{{ excerpt(greeting.content) || t("空内容") }}</p>
        <span
          v-if="Array.isArray(greeting.attachments) && greeting.attachments.length"
          class="attachment-count"
        >
          {{ t("附件数量", { count: greeting.attachments.length }) }}
        </span>
      </div>
      <div class="greeting-actions">
        <button
          type="button"
          class="icon-button"
          :title="t('设为默认')"
          :aria-label="t('设为默认')"
          data-testid="agent-greeting-set-default"
          @click="setDefault(greeting)"
        >
          <Check :size="17" />
        </button>
        <button
          type="button"
          class="icon-button"
          :title="t('编辑')"
          :aria-label="t('编辑')"
          data-testid="agent-greeting-edit"
          @click="openEdit(greeting)"
        >
          <MessageCircle :size="17" />
        </button>
        <button
          type="button"
          class="icon-button danger"
          :title="t('删除')"
          :aria-label="t('删除')"
          data-testid="agent-greeting-delete"
          @click="remove(greeting)"
        >
          <Trash2 :size="17" />
        </button>
      </div>
    </div>

    <Transition name="sheet">
      <section
        v-if="editorOpen"
        class="editor-overlay"
        role="dialog"
        aria-modal="true"
        data-testid="agent-greeting-editor"
      >
        <header>
          <button
            type="button"
            class="icon-button"
            :aria-label="t('返回')"
            @click="editorOpen = false"
          >
            <ChevronLeft :size="24" />
          </button>
          <strong>{{ isNew ? t("新增开局消息") : t("编辑开局消息") }}</strong>
          <button
            class="save-button"
            type="button"
            data-testid="agent-greeting-save"
            @click="save"
          >
            {{ t("保存") }}
          </button>
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
                :data-testid="`agent-greeting-role-${role}`"
                @click="form.role = role"
              >
                {{ role }}
              </button>
            </div>
          </div>
          <label class="field">
            <span>{{ t("名称") }}</span>
            <input
              v-model="form.name"
              data-testid="agent-greeting-name"
              :placeholder="t('名称占位')"
            />
          </label>
          <label class="field content-field">
            <span>{{ t("内容") }}</span>
            <textarea
              v-model="form.content"
              rows="12"
              data-testid="agent-greeting-content"
              :placeholder="t('内容占位')"
            />
          </label>
        </main>
      </section>
    </Transition>
  </section>
</template>

<style scoped>
.form-section {
  display: grid;
  gap: 12px;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.section-heading h2 {
  margin: 0;
  color: var(--text-color);
  font-size: var(--font-size-md);
}
.section-heading p,
.greeting-empty {
  margin: 4px 0 0;
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.add-button {
  min-height: 40px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: var(--app-radius-md);
  color: white;
  background: var(--primary-color);
  font-size: var(--font-size-sm);
}
.greeting-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--app-radius-md);
  background: var(--input-bg);
}
.greeting-copy {
  min-width: 0;
}
.greeting-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.role-badge {
  padding: 2px 8px;
  border-radius: var(--app-radius-sm, 6px);
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  font-size: var(--font-size-xs);
  text-transform: capitalize;
}
.default-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: var(--app-radius-sm, 6px);
  color: white;
  background: var(--primary-color);
  font-size: var(--font-size-xs);
}
.greeting-name {
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.greeting-copy p {
  margin: 6px 0 0;
  color: var(--text-color);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  word-break: break-all;
}
.attachment-count {
  display: block;
  margin-top: 4px;
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.greeting-actions {
  display: flex;
  gap: 2px;
}
.icon-button {
  width: 38px;
  height: 38px;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--text-color);
  background: transparent;
}
.icon-button.danger {
  color: var(--danger-color);
}
.editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  color: var(--text-color);
  background: var(--card-bg);
}
.editor-overlay header {
  min-height: 58px;
  padding: env(safe-area-inset-top) 14px 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  border-bottom: var(--border-width) solid var(--border-color);
}
.editor-overlay header strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.editor-overlay main {
  flex: 1;
  overflow: auto;
  padding: 18px 16px max(30px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.save-button {
  padding: 8px 13px;
  min-height: 44px;
  border: 0;
  border-radius: var(--app-radius-md);
  color: white;
  background: var(--primary-color);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
}
input,
textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 11px;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  color: var(--text-color);
  background: var(--input-bg);
  font: inherit;
}
.content-field textarea {
  min-height: 34vh;
  line-height: 1.55;
  resize: vertical;
}
.role-tabs {
  display: flex;
  gap: 7px;
}
.role-tabs button {
  flex: 1;
  padding: 9px;
  min-height: 44px;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  color: var(--text-color);
  background: transparent;
  text-transform: capitalize;
}
.role-tabs .active {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.22s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>
