<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { BookOpen, ChevronLeft, Pencil, Plus, Trash2 } from "lucide-vue-next";
import SafeTop from "@/components/SafeTop.vue";
import { useI18n } from "@/i18n";
import { customDialog, customMessage } from "@/utils/feedback";
import { useWorldbookStore } from "../stores/worldbookStore";
import type {
  MobileWorldbook,
  MobileWorldbookEntry,
  WorldbookEntryPosition,
} from "../types";

const router = useRouter();
const store = useWorldbookStore();
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.llm-chat.Worldbooks.${key}`);
const editorOpen = ref(false);
const entryEditorOpen = ref(false);
const editingId = ref<string | null>(null);
const entryWorldbookId = ref<string | null>(null);
const entryEditingId = ref<string | null>(null);
const saving = ref(false);
const draft = ref({ name: "", description: "", enabled: true });
const entryDraft = ref({
  name: "",
  keys: "",
  content: "",
  enabled: true,
  constant: false,
  order: 100,
  position: "before_history" as WorldbookEntryPosition,
  depth: 4,
  scanDepth: 8,
  caseSensitive: false,
  matchWholeWords: false,
});

onMounted(async () => {
  await store.init();
});

function openCreate() {
  editingId.value = null;
  draft.value = { name: "", description: "", enabled: true };
  editorOpen.value = true;
}

function openEdit(worldbook: MobileWorldbook) {
  editingId.value = worldbook.id;
  draft.value = {
    name: worldbook.name,
    description: worldbook.description ?? "",
    enabled: worldbook.enabled,
  };
  editorOpen.value = true;
}

async function saveWorldbook() {
  saving.value = true;
  try {
    if (editingId.value)
      await store.updateWorldbook(editingId.value, draft.value);
    else await store.createWorldbook(draft.value);
    editorOpen.value = false;
    customMessage(t("已保存"), "success");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    customMessage(
      code === "WORLDBOOK_NAME_DUPLICATE"
        ? t("名称重复")
        : code === "WORLDBOOK_NAME_REQUIRED"
          ? t("名称必填")
          : t("保存失败"),
      "error"
    );
  } finally {
    saving.value = false;
  }
}

async function removeWorldbook(worldbook: MobileWorldbook) {
  const confirmed = await customDialog({
    title: t("删除世界书"),
    message: t("删除提示").replace("{name}", worldbook.name),
    confirmButtonText: t("删除"),
    cancelButtonText: t("取消"),
  });
  if (!confirmed) return;
  await store.removeWorldbook(worldbook.id);
  customMessage(t("已删除"), "success");
}

async function toggleWorldbook(worldbook: MobileWorldbook) {
  await store.updateWorldbook(worldbook.id, { enabled: !worldbook.enabled });
}

function openCreateEntry(worldbook: MobileWorldbook) {
  entryWorldbookId.value = worldbook.id;
  entryEditingId.value = null;
  entryDraft.value = {
    name: "",
    keys: "",
    content: "",
    enabled: true,
    constant: false,
    order: 100,
    position: "before_history",
    depth: 4,
    scanDepth: 8,
    caseSensitive: false,
    matchWholeWords: false,
  };
  entryEditorOpen.value = true;
}

function openEditEntry(
  worldbook: MobileWorldbook,
  entry: MobileWorldbookEntry
) {
  entryWorldbookId.value = worldbook.id;
  entryEditingId.value = entry.id;
  entryDraft.value = {
    name: entry.name ?? "",
    keys: entry.keys.join(", "),
    content: entry.content,
    enabled: entry.enabled,
    constant: entry.constant,
    order: entry.order,
    position: entry.position,
    depth: entry.depth ?? 4,
    scanDepth: entry.scanDepth ?? 8,
    caseSensitive: entry.caseSensitive ?? false,
    matchWholeWords: entry.matchWholeWords ?? false,
  };
  entryEditorOpen.value = true;
}

async function saveEntry() {
  if (!entryWorldbookId.value || !entryDraft.value.content.trim()) {
    customMessage(t("条目内容必填"), "warning");
    return;
  }
  saving.value = true;
  try {
    await store.upsertEntry(entryWorldbookId.value, {
      id: entryEditingId.value ?? undefined,
      ...entryDraft.value,
      keys: entryDraft.value.keys.split(",").map((key) => key.trim()),
    });
    entryEditorOpen.value = false;
    customMessage(t("条目已保存"), "success");
  } finally {
    saving.value = false;
  }
}

async function removeEntry(
  worldbook: MobileWorldbook,
  entry: MobileWorldbookEntry
) {
  const confirmed = await customDialog({
    title: t("删除条目"),
    message: t("删除条目提示").replace(
      "{name}",
      entry.name || entry.content.slice(0, 24)
    ),
    confirmButtonText: t("删除"),
    cancelButtonText: t("取消"),
  });
  if (!confirmed) return;
  await store.removeEntry(worldbook.id, entry.id);
  customMessage(t("条目已删除"), "success");
}
</script>

<template>
  <div class="worldbooks-view" data-testid="chat-worldbooks">
    <SafeTop />
    <header class="page-header">
      <button
        class="icon-button"
        type="button"
        :aria-label="t('返回')"
        @click="router.back()"
      >
        <ChevronLeft :size="24" />
      </button>
      <div>
        <h1>{{ t("世界书") }}</h1>
        <p>{{ t("说明") }}</p>
      </div>
      <button
        class="icon-button primary"
        type="button"
        data-testid="worldbook-create"
        :aria-label="t('新建')"
        @click="openCreate"
      >
        <Plus :size="22" />
      </button>
    </header>

    <main class="worldbook-list">
      <div v-if="store.isLoading" class="empty-state"><var-loading /></div>
      <div v-else-if="!store.sortedWorldbooks.length" class="empty-state">
        <BookOpen :size="42" />
        <strong>{{ t("暂无世界书") }}</strong>
        <span>{{ t("暂无世界书提示") }}</span>
        <button type="button" class="create-button" @click="openCreate">
          {{ t("新建") }}
        </button>
      </div>
      <article
        v-for="worldbook in store.sortedWorldbooks"
        v-else
        :key="worldbook.id"
        class="worldbook-card"
        :class="{ disabled: !worldbook.enabled }"
        :data-testid="`worldbook-${worldbook.id}`"
      >
        <div class="worldbook-copy">
          <div class="worldbook-title">
            <strong>{{ worldbook.name }}</strong>
            <span>{{ worldbook.entries.length }} {{ t("条目") }}</span>
          </div>
          <p>{{ worldbook.description || t("无描述") }}</p>
        </div>
        <div class="card-actions">
          <button type="button" :title="t('编辑')" @click="openEdit(worldbook)">
            <Pencil :size="18" />
          </button>
          <button
            type="button"
            class="danger"
            :title="t('删除')"
            @click="removeWorldbook(worldbook)"
          >
            <Trash2 :size="18" />
          </button>
        </div>
        <label class="enabled-toggle"
          ><input
            type="checkbox"
            :checked="worldbook.enabled"
            @change="toggleWorldbook(worldbook)"
          />{{ worldbook.enabled ? t("已启用") : t("已禁用") }}</label
        >
        <section class="entry-list">
          <div
            v-for="entry in worldbook.entries"
            :key="entry.id"
            class="entry-card"
            :class="{ disabled: !entry.enabled }"
          >
            <div>
              <strong>{{ entry.name || t("未命名条目") }}</strong>
              <small
                >{{
                  entry.constant
                    ? t("常量")
                    : entry.keys.join(", ") || t("无关键词")
                }}
                · {{ entry.position }} · {{ t("顺序") }}
                {{ entry.order }}</small
              >
              <p>{{ entry.content }}</p>
            </div>
            <div class="entry-actions">
              <button
                type="button"
                :title="t('编辑')"
                @click="openEditEntry(worldbook, entry)"
              >
                <Pencil :size="16" /></button
              ><button
                type="button"
                class="danger"
                :title="t('删除')"
                @click="removeEntry(worldbook, entry)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
          <button
            type="button"
            class="add-entry"
            @click="openCreateEntry(worldbook)"
          >
            <Plus :size="16" />{{ t("添加条目") }}
          </button>
        </section>
      </article>
    </main>

    <var-dialog
      v-model:show="editorOpen"
      :title="editingId ? t('编辑世界书') : t('新建世界书')"
      :show-confirm-button="false"
      :show-cancel-button="false"
    >
      <form class="editor-form" @submit.prevent="saveWorldbook">
        <label
          >{{ t("名称")
          }}<input
            v-model="draft.name"
            data-testid="worldbook-name"
            :placeholder="t('名称提示')"
        /></label>
        <label
          >{{ t("描述") }}<textarea v-model="draft.description" rows="3" />
        </label>
        <label class="check-label"
          ><input v-model="draft.enabled" type="checkbox" />{{
            t("启用")
          }}</label
        >
        <div class="form-actions">
          <var-button text native-type="button" @click="editorOpen = false">{{
            t("取消")
          }}</var-button
          ><var-button type="primary" native-type="submit" :loading="saving">{{
            t("保存")
          }}</var-button>
        </div>
      </form>
    </var-dialog>

    <var-dialog
      v-model:show="entryEditorOpen"
      :title="entryEditingId ? t('编辑条目') : t('添加条目')"
      :show-confirm-button="false"
      :show-cancel-button="false"
    >
      <form class="editor-form" @submit.prevent="saveEntry">
        <label>{{ t("条目名称") }}<input v-model="entryDraft.name" /></label>
        <label
          >{{ t("关键词")
          }}<input v-model="entryDraft.keys" :placeholder="t('关键词提示')"
        /></label>
        <label
          >{{ t("条目内容") }}<textarea v-model="entryDraft.content" rows="7" />
        </label>
        <div class="form-grid">
          <label
            >{{ t("位置")
            }}<select v-model="entryDraft.position">
              <option value="before_history">before_history</option>
              <option value="after_character">after_character</option>
              <option value="depth">depth</option>
            </select></label
          ><label
            >{{ t("深度")
            }}<input
              v-model.number="entryDraft.depth"
              type="number"
              min="0" /></label
          ><label
            >{{ t("扫描深度")
            }}<input
              v-model.number="entryDraft.scanDepth"
              type="number"
              min="1" /></label
          ><label
            >{{ t("顺序")
            }}<input v-model.number="entryDraft.order" type="number"
          /></label>
        </div>
        <div class="check-grid">
          <label class="check-label"
            ><input v-model="entryDraft.enabled" type="checkbox" />{{
              t("启用")
            }}</label
          ><label class="check-label"
            ><input v-model="entryDraft.constant" type="checkbox" />{{
              t("常量")
            }}</label
          ><label class="check-label"
            ><input v-model="entryDraft.caseSensitive" type="checkbox" />{{
              t("区分大小写")
            }}</label
          ><label class="check-label"
            ><input v-model="entryDraft.matchWholeWords" type="checkbox" />{{
              t("全词匹配")
            }}</label
          >
        </div>
        <div class="form-actions">
          <var-button
            text
            native-type="button"
            @click="entryEditorOpen = false"
            >{{ t("取消") }}</var-button
          ><var-button type="primary" native-type="submit" :loading="saving">{{
            t("保存")
          }}</var-button>
        </div>
      </form>
    </var-dialog>
  </div>
</template>

<style scoped>
.worldbooks-view {
  min-height: 100%;
  padding: 18px 16px 32px;
  background: var(--color-surface);
}
.page-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  margin: 6px 0 20px;
}
.page-header h1 {
  margin: 0;
  color: var(--color-on-surface);
  font-size: 1.35rem;
}
.page-header p {
  margin: 3px 0 0;
  color: var(--color-on-surface-variant);
  font-size: 0.82rem;
}
.icon-button,
.card-actions button,
.entry-actions button {
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--color-on-surface-variant);
}
.icon-button {
  width: 42px;
  height: 42px;
  border-radius: 50%;
}
.icon-button.primary,
.create-button {
  color: var(--color-on-primary);
  background: var(--color-primary);
}
.worldbook-list {
  display: grid;
  gap: 12px;
}
.empty-state {
  min-height: 45vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  color: var(--color-on-surface-variant);
  text-align: center;
}
.create-button,
.add-entry {
  border: 0;
  border-radius: 20px;
  padding: 9px 16px;
}
.worldbook-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 9px;
  padding: 14px;
  border-radius: 14px;
  background: var(--color-surface-container-high);
}
.worldbook-card.disabled,
.entry-card.disabled {
  opacity: 0.58;
}
.worldbook-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--color-on-surface);
}
.worldbook-title span {
  padding: 2px 6px;
  border-radius: 9px;
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
  font-size: 0.68rem;
}
.worldbook-copy p,
.entry-card p,
.entry-card small {
  color: var(--color-on-surface-variant);
}
.worldbook-copy p {
  margin: 5px 0 0;
  font-size: 0.82rem;
}
.card-actions,
.entry-actions {
  display: flex;
  gap: 2px;
}
.card-actions button {
  width: 30px;
  height: 30px;
  border-radius: 50%;
}
.danger {
  color: var(--color-error) !important;
}
.enabled-toggle {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-on-surface-variant);
  font-size: 0.76rem;
}
.entry-list {
  grid-column: 1 / -1;
  display: grid;
  gap: 8px;
  margin-top: 3px;
}
.entry-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  background: var(--color-surface-container-low);
}
.entry-card small {
  display: block;
  margin-top: 3px;
  font-size: 0.68rem;
}
.entry-card p {
  display: -webkit-box;
  margin: 5px 0 0;
  overflow: hidden;
  white-space: pre-wrap;
  font-size: 0.78rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.entry-actions button {
  width: 27px;
  height: 27px;
}
.add-entry {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  color: var(--color-primary);
  background: transparent;
  border: 1px dashed var(--color-outline);
}
.editor-form {
  display: grid;
  gap: 12px;
  padding: 4px 0;
}
.editor-form label {
  display: grid;
  gap: 6px;
  color: var(--color-on-surface);
  font-size: 0.85rem;
}
.editor-form input:not([type="checkbox"]),
.editor-form textarea,
.editor-form select {
  width: 100%;
  box-sizing: border-box;
  padding: 9px;
  border: 1px solid var(--color-outline-variant);
  border-radius: 8px;
  color: var(--color-on-surface);
  background: var(--color-surface-container-low);
  font: inherit;
}
.editor-form textarea {
  resize: vertical;
}
.check-label {
  display: flex !important;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 7px !important;
}
.form-grid,
.check-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
