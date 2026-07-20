<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Check,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Paperclip,
  Search,
  X,
} from "lucide-vue-next";
import { v4 as uuidv4 } from "uuid";
import { customMessage } from "@/utils/feedback";
import { listAssets } from "../../asset-manager/services/assetService";
import type { AssetRecord } from "../../asset-manager/types";
import type { ChatMessageAttachment } from "../types";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  select: [attachments: ChatMessageAttachment[]];
}>();

const assets = ref<AssetRecord[]>([]);
const selectedIds = ref<string[]>([]);
const search = ref("");
const loading = ref(false);

const filteredAssets = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return query
    ? assets.value.filter((asset) =>
        asset.displayName.toLocaleLowerCase().includes(query)
      )
    : assets.value;
});

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    selectedIds.value = [];
    search.value = "";
    loading.value = true;
    try {
      assets.value = await listAssets({
        libraryState: "visible",
        includeHidden: false,
        includeUnavailable: false,
        limit: 100,
        offset: 0,
      });
    } catch (error) {
      customMessage(
        error instanceof Error ? error.message : "无法读取资产列表",
        "error"
      );
    } finally {
      loading.value = false;
    }
  }
);

function toggle(assetId: string) {
  selectedIds.value = selectedIds.value.includes(assetId)
    ? selectedIds.value.filter((id) => id !== assetId)
    : [...selectedIds.value, assetId];
}

function confirm() {
  const selected = assets.value
    .filter((asset) => selectedIds.value.includes(asset.id))
    .map((asset): ChatMessageAttachment => ({
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      assetId: asset.id,
      usagePolicy: "advisory",
      snapshot: {
        displayName: asset.displayName,
        kind: asset.kind,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      },
    }));
  emit("select", selected);
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="picker-backdrop" @click.self="emit('close')">
      <section
        class="picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="选择资产"
      >
        <header>
          <h2>选择资产</h2>
          <button
            type="button"
            class="icon-button"
            aria-label="关闭"
            @click="emit('close')"
          >
            <X :size="21" />
          </button>
        </header>

        <label class="search-field">
          <Search :size="17" />
          <input v-model="search" type="search" placeholder="搜索资产" />
        </label>

        <div class="asset-list">
          <div v-if="loading" class="empty-state">加载中...</div>
          <div v-else-if="!filteredAssets.length" class="empty-state">
            暂无可用资产
          </div>
          <button
            v-for="asset in filteredAssets"
            v-else
            :key="asset.id"
            type="button"
            class="asset-row"
            :aria-pressed="selectedIds.includes(asset.id)"
            @click="toggle(asset.id)"
          >
            <FileImage v-if="asset.kind === 'image'" :size="20" />
            <FileAudio v-else-if="asset.kind === 'audio'" :size="20" />
            <FileVideo v-else-if="asset.kind === 'video'" :size="20" />
            <FileText v-else-if="asset.kind === 'document'" :size="20" />
            <Paperclip v-else :size="20" />
            <span>{{ asset.displayName }}</span>
            <Check v-if="selectedIds.includes(asset.id)" :size="19" />
          </button>
        </div>

        <footer>
          <button type="button" class="secondary" @click="emit('close')">
            取消
          </button>
          <button
            type="button"
            class="primary"
            :disabled="!selectedIds.length"
            @click="confirm"
          >
            添加<span v-if="selectedIds.length"> {{ selectedIds.length }}</span>
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  background: var(--color-scrim, rgb(0 0 0 / 42%));
}

.picker-sheet {
  width: 100%;
  max-height: min(78vh, 680px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  border-radius: 8px 8px 0 0;
  background: var(--color-surface);
  color: var(--color-on-surface);
}

header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h2 {
  margin: 0;
  font-size: 1.05rem;
  letter-spacing: 0;
}

button {
  min-height: 42px;
  border: 0;
  color: inherit;
  font: inherit;
}

.icon-button {
  width: 42px;
  display: grid;
  place-items: center;
  background: transparent;
}

.search-field {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  min-height: 44px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  color: var(--color-on-surface-variant);
}

.search-field input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-on-surface);
  font: inherit;
}

.asset-list {
  min-height: 180px;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: 4px;
}

.asset-row {
  width: 100%;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 6px;
  text-align: left;
  background: transparent;
}

.asset-row[aria-pressed="true"] {
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
}

.asset-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: var(--color-on-surface-variant);
}

footer {
  justify-content: flex-end;
}

footer button {
  min-width: 88px;
  padding: 0 16px;
  border-radius: 6px;
}

footer .secondary {
  background: var(--color-surface-container-high);
}

footer .primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
}

footer .primary:disabled {
  opacity: 0.45;
}
</style>
