<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Check,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Import,
  LoaderCircle,
  Paperclip,
  Search,
  X,
} from "lucide-vue-next";
import { v4 as uuidv4 } from "uuid";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/feedback";
import { useI18n } from "@/i18n";
import ImportSourceSheet from "../../asset-manager/components/ImportSourceSheet.vue";
import {
  importAssetSources,
  listAssets,
} from "../../asset-manager/services/assetService";
import {
  resolveAssetImportSources,
  type AssetImportPickerSource,
} from "../../asset-manager/services/assetImportEntry";
import { resolveAttachmentTextSnapshot } from "../../asset-manager/services/assetTextSnapshotService";
import type { AssetRecord } from "../../asset-manager/types";
import type { ChatMessageAttachment } from "../types";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  select: [attachments: ChatMessageAttachment[]];
}>();

const logger = createModuleLogger("llm-chat/asset-picker");
const assets = ref<AssetRecord[]>([]);
const selectedIds = ref<string[]>([]);
const search = ref("");
const loading = ref(false);
const importing = ref(false);
const confirming = ref(false);
const importSourceOpen = ref(false);
const { useScopedT } = useI18n();
const t = useScopedT("tools.llm-chat.AssetPicker");

const filteredAssets = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return query
    ? assets.value.filter((asset) =>
        asset.displayName.toLocaleLowerCase().includes(query)
      )
    : assets.value;
});

async function loadAssets() {
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
      error instanceof Error ? error.message : t("无法读取资产列表"),
      "error"
    );
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    selectedIds.value = [];
    search.value = "";
    importSourceOpen.value = false;
    await loadAssets();
  }
);

function toggle(assetId: string) {
  selectedIds.value = selectedIds.value.includes(assetId)
    ? selectedIds.value.filter((id) => id !== assetId)
    : [...selectedIds.value, assetId];
}

function closeImportSource() {
  importSourceOpen.value = false;
}

async function pickImportSource(source: AssetImportPickerSource) {
  importSourceOpen.value = false;
  if (importing.value) return;
  importing.value = true;
  try {
    const sources = await resolveAssetImportSources(source, {
      sourceModule: "llm-chat",
    });
    if (!sources?.length) return;

    const results = await importAssetSources(sources);
    const successCount = results.filter((result) => result.asset).length;
    const failedCount = results.filter(
      (result) => result.status === "failed"
    ).length;
    if (successCount === 0 && failedCount > 0) {
      throw new Error(results[0]?.errorCode ?? "ASSET_IMPORT_FAILED");
    }
    customMessage(
      failedCount > 0
        ? t("已导入 {ok} 项，{failed} 项失败")
            .replace("{ok}", String(successCount))
            .replace("{failed}", String(failedCount))
        : t("已导入 {count} 项资产").replace("{count}", String(successCount)),
      failedCount > 0 ? "warning" : "success"
    );
    await loadAssets();
  } catch (cause) {
    logger.warn("聊天内导入资产失败", {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    customMessage(
      cause instanceof Error ? cause.message : t("导入失败"),
      "error"
    );
  } finally {
    importing.value = false;
  }
}

async function confirm() {
  if (!selectedIds.value.length || confirming.value || importing.value) return;
  confirming.value = true;
  try {
    const selectedAssets = assets.value.filter((asset) =>
      selectedIds.value.includes(asset.id)
    );
    const snapshots = await Promise.all(
      selectedAssets.map((asset) => resolveAttachmentTextSnapshot(asset))
    );
    const warnings = snapshots
      .map((snapshot) => snapshot.warning)
      .filter((warning): warning is string => Boolean(warning));
    if (warnings.length) {
      customMessage([...new Set(warnings)].join("；"), "warning");
    }

    const selected = selectedAssets.map((asset, index): ChatMessageAttachment => {
      const extractedText = snapshots[index]?.text;
      return {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        assetId: asset.id,
        usagePolicy: "advisory",
        snapshot: {
          displayName: asset.displayName,
          kind: asset.kind,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          ...(extractedText ? { extractedText } : {}),
        },
      };
    });
    emit("select", selected);
    emit("close");
  } finally {
    confirming.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="picker-backdrop" @click.self="emit('close')">
      <section
        class="picker-sheet"
        data-testid="chat-asset-picker"
        role="dialog"
        aria-modal="true"
        :aria-label="t('选择资产')"
      >
        <header>
          <h2>{{ t("选择资产") }}</h2>
          <div class="header-actions">
            <button
              type="button"
              class="import-button"
              data-testid="chat-asset-import"
              :disabled="importing"
              @click="importSourceOpen = true"
            >
              <LoaderCircle v-if="importing" class="spin" :size="18" />
              <Import v-else :size="18" />
              <span>{{ importing ? t("导入中") : t("导入") }}</span>
            </button>
            <button
              type="button"
              class="icon-button"
              :aria-label="t('关闭')"
              @click="emit('close')"
            >
              <X :size="21" />
            </button>
          </div>
        </header>

        <label class="search-field">
          <Search :size="17" />
          <input
            v-model="search"
            type="search"
            :placeholder="t('搜索资产')"
            data-testid="chat-asset-search"
          />
        </label>

        <div class="asset-list">
          <div v-if="loading" class="empty-state">{{ t("加载中...") }}</div>
          <div v-else-if="!filteredAssets.length" class="empty-state">
            {{ t("暂无可用资产") }}
          </div>
          <button
            v-for="asset in filteredAssets"
            v-else
            :key="asset.id"
            type="button"
            class="asset-row"
            data-testid="chat-asset-row"
            :data-asset-id="asset.id"
            :data-asset-name="asset.displayName"
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
          <button
            type="button"
            class="secondary"
            data-testid="chat-asset-cancel"
            @click="emit('close')"
          >
            {{ t("取消") }}
          </button>
          <button
            type="button"
            class="primary"
            data-testid="chat-asset-confirm"
            :disabled="!selectedIds.length || confirming || importing"
            @click="confirm"
          >
            <LoaderCircle v-if="confirming" class="spin" :size="16" />
            <span v-else>{{ t("添加") }}</span>
            <span v-if="selectedIds.length && !confirming">
              {{ selectedIds.length }}</span
            >
          </button>
        </footer>
      </section>

      <ImportSourceSheet
        v-if="importSourceOpen"
        @close="closeImportSource"
        @pick="pickImportSource"
      />
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

.picker-backdrop :deep(.sheet-layer) {
  z-index: 1300;
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
  background: var(--bg-color);
  color: var(--text-color);
}

header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
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

.import-button {
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 6px;
  background: var(--color-primary-container, var(--input-bg));
  color: var(--color-on-primary-container, inherit);
  font-size: 13px;
}

.import-button:disabled {
  opacity: 0.6;
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
  color: var(--text-color-light);
}

.search-field input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-color);
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
  color: var(--text-color-light);
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
  background: var(--input-bg);
}

footer .primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--primary-color);
  color: var(--color-on-primary);
}

footer .primary:disabled {
  opacity: 0.45;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
