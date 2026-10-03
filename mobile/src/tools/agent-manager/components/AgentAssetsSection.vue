<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  FileAudio,
  FileText,
  FileVideo,
  Pencil,
  Plus,
  Trash2,
} from "lucide-vue-next";
import { customDialog, customMessage } from "@/utils/feedback";
import { useI18n } from "@/i18n";
import { useAgentStorage } from "../composables/useAgentStorage";
import type {
  AgentAsset,
  AgentAssetGroup,
  AgentAssetType,
  GreetingMessage,
  PresetMessage,
} from "../types/agent";

const props = defineProps<{
  agentId: string;
  assets: AgentAsset[];
  groups: AgentAssetGroup[];
  /** 用于删除前引用扫描：预设消息与开局消息附件。 */
  presetMessages?: PresetMessage[];
  greetings?: GreetingMessage[];
}>();

const emit = defineEmits<{
  "update:assets": [assets: AgentAsset[]];
  /** 删除已确认且文件清理成功后通知页面级联清理引用。 */
  "asset-removed": [asset: AgentAsset];
}>();

const { tRaw } = useI18n();
const agentStorage = useAgentStorage();

const UNGROUPED = "__ungrouped__";
const filterGroup = ref("");
const editingId = ref("");
const editingAsset = ref<AgentAsset | null>(null);
const editDescription = ref("");
const editGroupId = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const adding = ref(false);

const aliveIds = ref(new Set<string>());
/** 私有资产图片缩略图 Blob URL，替换与卸载时回收。 */
const previewUrls = ref(new Map<string, string>());

watch(
  () => props.assets,
  (assets) => {
    aliveIds.value = new Set(assets.map((asset) => asset.id));
    for (const [id, url] of previewUrls.value) {
      if (!aliveIds.value.has(id)) {
        URL.revokeObjectURL(url);
        previewUrls.value.delete(id);
      }
    }
    for (const asset of assets) {
      if (asset.type === "image" && !previewUrls.value.has(asset.id)) {
        void loadPreviewUrl(asset);
      }
    }
  },
  { immediate: true, deep: true }
);

onBeforeUnmount(() => {
  for (const url of previewUrls.value.values()) URL.revokeObjectURL(url);
  previewUrls.value.clear();
});

async function loadPreviewUrl(asset: AgentAsset): Promise<void> {
  try {
    const bytes = await agentStorage.readAgentAsset(
      props.agentId,
      asset.path
    );
    if (!bytes?.length) return;
    if (!aliveIds.value.has(asset.id)) return;
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], {
        type: asset.mimeType || "application/octet-stream",
      })
    );
    previewUrls.value.set(asset.id, url);
  } catch {
    // 缩略图失败静默跳过，列表仍显示类型图标。
  }
}

const filteredAssets = computed(() =>
  filterGroup.value === ""
    ? props.assets
    : props.assets.filter((asset) =>
        filterGroup.value === UNGROUPED
          ? !asset.group
          : asset.group === filterGroup.value
      )
);

const groupFilterOptions = computed(() => {
  const options: Array<{ id: string; label: string; count: number }> = [
    {
      id: "",
      label: tRaw("tools.agent-manager.AgentAssets.全部"),
      count: props.assets.length,
    },
  ];
  for (const group of props.groups) {
    options.push({
      id: group.id,
      label: group.displayName,
      count: props.assets.filter((asset) => asset.group === group.id).length,
    });
  }
  if (props.assets.some((asset) => !asset.group)) {
    options.push({
      id: UNGROUPED,
      label: tRaw("tools.agent-manager.AgentAssets.未分组"),
      count: props.assets.filter((asset) => !asset.group).length,
    });
  }
  return options;
});

function groupLabel(groupId: string | undefined): string {
  if (!groupId) return tRaw("tools.agent-manager.AgentAssets.未分组");
  return (
    props.groups.find((group) => group.id === groupId)?.displayName ?? groupId
  );
}

function formatSize(size?: number): string {
  if (!size && size !== 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function inferAssetType(mimeType?: string, filename?: string): AgentAssetType {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (mimeType?.startsWith("video/")) return "video";
  const extension = filename?.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(extension))
    return "image";
  if (["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(extension))
    return "audio";
  if (["mp4", "webm", "mkv", "avi", "mov"].includes(extension)) return "video";
  return "file";
}

/** 资产 id 即宏 Handle；对齐桌面语义用文件基名，冲突时追加序号。 */
function uniqueAssetId(filename: string): string {
  const existing = new Set(props.assets.map((asset) => asset.id));
  const base =
    filename.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-") || "asset";
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

async function onAddFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  if (!files.length || adding.value) return;
  adding.value = true;
  try {
    const records: AgentAsset[] = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const savedPath = await agentStorage.saveAgentAsset(
          props.agentId,
          `assets/${file.name}`,
          bytes
        );
        records.push({
          id: uniqueAssetId(file.name),
          filename: file.name,
          path: savedPath,
          type: inferAssetType(file.type, file.name),
          ...(file.type ? { mimeType: file.type } : {}),
          size: file.size,
        });
      } catch {
        customMessage(
          `${tRaw("tools.agent-manager.AgentAssets.添加失败")}${file.name}`,
          "error"
        );
      }
    }
    if (records.length) {
      emit(
        "update:assets",
        props.assets.concat(records.map((record) => ({ ...record })))
      );
      customMessage(
        `${tRaw("tools.agent-manager.AgentAssets.添加成功")}${records.length}`,
        "success"
      );
    }
  } finally {
    adding.value = false;
  }
}

function startEdit(asset: AgentAsset): void {
  editingAsset.value = asset;
  editDescription.value = asset.description ?? "";
  editGroupId.value = asset.group ?? "";
}

function confirmEdit(): void {
  const asset = editingAsset.value;
  if (!asset) return;
  const next = props.assets.map((item) => {
    if (item.id !== asset.id) return item;
    const patched: AgentAsset = {
      ...item,
      description: editDescription.value.trim() || undefined,
    };
    if (editGroupId.value) patched.group = editGroupId.value;
    else delete patched.group;
    return patched;
  });
  emit("update:assets", next);
  editingAsset.value = null;
}

function assetPreviewSrc(asset: AgentAsset): string | undefined {
  return previewUrls.value.get(asset.id);
}

function toggleExpand(asset: AgentAsset): void {
  editingId.value = editingId.value === asset.id ? "" : asset.id;
}

/** 扫描预设消息与开局消息对该资产的引用，返回可读摘要或空串。 */
function collectAttachmentReferences(assetId: string): string {
  const presetMessages = props.presetMessages ?? [];
  const greetings = props.greetings ?? [];
  const presetCount = presetMessages.filter((message) =>
    (message.presetAttachments ?? []).some(
      (attachment) => attachment.assetId === assetId
    )
  ).length;
  const greetingCount = greetings.filter((greeting) =>
    normalizeGreetingRefs(greeting.attachments).includes(assetId)
  ).length;
  if (!presetCount && !greetingCount) return "";
  const parts: string[] = [];
  if (presetCount)
    parts.push(
      `${tRaw("tools.agent-manager.AgentAssets.预设消息引用")}×${presetCount}`
    );
  if (greetingCount)
    parts.push(
      `${tRaw("tools.agent-manager.AgentAssets.开局消息引用")}×${greetingCount}`
    );
  return parts.join("，");
}

function normalizeGreetingRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && "assetId" in item) {
      const id = (item as { assetId?: unknown }).assetId;
      if (typeof id === "string") ids.push(id);
    }
  }
  return ids;
}

async function removeAsset(asset: AgentAsset): Promise<void> {
  const references = collectAttachmentReferences(asset.id);
  const confirmText = references
    ? `${tRaw("tools.agent-manager.AgentAssets.删除确认引用")}${references}`
    : tRaw("tools.agent-manager.AgentAssets.删除确认");
  const confirmed = await customDialog({
    title: tRaw("tools.agent-manager.AgentAssets.删除"),
    message: confirmText,
  });
  if (!confirmed) return;
  try {
    await agentStorage.deleteAgentAsset(props.agentId, asset.path);
  } catch {
    customMessage(
      tRaw("tools.agent-manager.AgentAssets.删除文件失败"),
      "error"
    );
    return;
  }
  const url = previewUrls.value.get(asset.id);
  if (url) {
    URL.revokeObjectURL(url);
    previewUrls.value.delete(asset.id);
  }
  emit(
    "update:assets",
    props.assets.filter((item) => item.id !== asset.id)
  );
  emit("asset-removed", asset);
  customMessage(tRaw("tools.agent-manager.AgentAssets.删除成功"), "success");
}

defineExpose({ collectAttachmentReferences });
</script>

<template>
  <section class="form-section assets-section" data-testid="agent-assets">
    <div class="section-heading">
      <div>
        <h2>{{ tRaw("tools.agent-manager.AgentAssets.标题") }}</h2>
        <p>{{ tRaw("tools.agent-manager.AgentAssets.说明") }}</p>
      </div>
      <button
        class="add-button"
        type="button"
        data-testid="agent-assets-add"
        :disabled="adding"
        @click="fileInput?.click()"
      >
        <Plus :size="16" />
        {{ tRaw("tools.agent-manager.AgentAssets.添加") }}
      </button>
      <input
        ref="fileInput"
        type="file"
        data-testid="agent-assets-input"
        multiple
        hidden
        @change="onAddFiles"
      />
    </div>

    <div v-if="groups.length" class="group-filter">
      <button
        v-for="option in groupFilterOptions"
        :key="option.id"
        class="group-chip"
        :class="{ active: filterGroup === option.id }"
        type="button"
        data-testid="agent-asset-group-chip"
        :data-group-id="option.id"
        @click="filterGroup = option.id"
      >
        {{ option.label }} ({{ option.count }})
      </button>
    </div>

    <p v-if="!assets.length" class="assets-empty">
      {{ tRaw("tools.agent-manager.AgentAssets.暂无资产") }}
    </p>
    <p v-else-if="!filteredAssets.length" class="assets-empty">
      {{ tRaw("tools.agent-manager.AgentAssets.分组无资产") }}
    </p>

    <ul v-else class="asset-list">
      <li
        v-for="asset in filteredAssets"
        :key="asset.id"
        class="asset-card"
        :data-testid="`agent-asset-${asset.id}`"
      >
        <div class="asset-row">
          <img
            v-if="assetPreviewSrc(asset)"
            class="asset-thumb"
            :src="assetPreviewSrc(asset)"
            :alt="asset.filename"
          />
          <span v-else class="asset-icon">
            <FileVideo v-if="asset.type === 'video'" :size="20" />
            <FileAudio v-else-if="asset.type === 'audio'" :size="20" />
            <FileText v-else :size="20" />
          </span>
          <span class="asset-meta" @click="toggleExpand(asset)">
            <strong>{{ asset.filename }}</strong>
            <small>
              {{ groupLabel(asset.group) }}<template v-if="asset.size">
                · {{ formatSize(asset.size) }}</template
              ><template v-if="asset.description">
                · {{ asset.description }}</template
              >
            </small>
          </span>
          <span class="asset-actions">
            <button
              class="icon-action"
              type="button"
              :data-testid="`agent-asset-edit-button-${asset.id}`"
              :aria-label="tRaw('tools.agent-manager.AgentAssets.编辑')"
              @click="startEdit(asset)"
            >
              <Pencil :size="16" />
            </button>
            <button
              class="icon-action danger"
              type="button"
              :data-testid="`agent-asset-delete-${asset.id}`"
              :aria-label="tRaw('tools.agent-manager.AgentAssets.删除')"
              @click="removeAsset(asset)"
            >
              <Trash2 :size="16" />
            </button>
          </span>
        </div>
        <img
          v-if="editingId === asset.id && asset.type === 'image' && assetPreviewSrc(asset)"
          class="asset-preview"
          :src="assetPreviewSrc(asset)"
          :alt="asset.filename"
        />
        <audio
          v-if="editingId === asset.id && asset.type === 'audio' && assetPreviewSrc(asset)"
          class="asset-player"
          controls
          :src="assetPreviewSrc(asset)"
        ></audio>
        <video
          v-if="editingId === asset.id && asset.type === 'video' && assetPreviewSrc(asset)"
          class="asset-player"
          controls
          :src="assetPreviewSrc(asset)"
        ></video>
      </li>
    </ul>

    <Teleport to="body">
      <div
        v-if="editingAsset"
        class="edit-overlay"
        @click.self="editingAsset = null"
      >
        <div class="edit-sheet" data-testid="agent-asset-edit">
          <h3>{{ tRaw("tools.agent-manager.AgentAssets.编辑") }}</h3>
          <p class="edit-filename">{{ editingAsset.filename }}</p>
          <label>
            <span>{{ tRaw("tools.agent-manager.AgentAssets.描述") }}</span>
            <input
              v-model="editDescription"
              data-testid="agent-asset-edit-description"
            />
          </label>
          <label>
            <span>{{ tRaw("tools.agent-manager.AgentAssets.分组") }}</span>
            <select v-model="editGroupId" data-testid="agent-asset-edit-group">
              <option value="">
                {{ tRaw("tools.agent-manager.AgentAssets.未分组") }}
              </option>
              <option v-for="group in groups" :key="group.id" :value="group.id">
                {{ group.displayName }}
              </option>
            </select>
          </label>
          <div class="edit-actions">
            <button type="button" @click="editingAsset = null">
              {{ tRaw("tools.agent-manager.AgentAssets.取消") }}
            </button>
            <button
              type="button"
              data-testid="agent-asset-edit-confirm"
              @click="confirmEdit"
            >
              {{ tRaw("tools.agent-manager.AgentAssets.保存") }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.assets-section {
  gap: 10px;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.section-heading h2 {
  margin: 0;
  color: var(--color-on-surface);
  font-size: 1rem;
}
.section-heading p {
  margin: 4px 0 0;
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
}
.add-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: var(--border-width) solid var(--color-primary);
  border-radius: 8px;
  padding: 7px 12px;
  background: transparent;
  color: var(--color-primary);
  font: inherit;
  font-size: 0.8rem;
  white-space: nowrap;
}
.group-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.group-chip {
  border: var(--border-width) solid var(--border-color);
  border-radius: 999px;
  padding: 6px 12px;
  background: transparent;
  color: var(--color-on-surface-variant);
  font: inherit;
  font-size: 0.76rem;
}
.group-chip.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}
.assets-empty {
  margin: 0;
  padding: 14px;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  color: var(--color-on-surface-variant);
  font-size: 0.8rem;
  text-align: center;
}
.asset-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.asset-card {
  display: grid;
  gap: 8px;
  padding: 9px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
  background: var(--input-bg);
}
.asset-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.asset-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.asset-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  color: var(--color-primary);
  flex-shrink: 0;
}
.asset-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
  cursor: pointer;
}
.asset-meta strong {
  font-size: 0.84rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-meta small {
  color: var(--color-on-surface-variant);
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-actions {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}
.icon-action {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--color-on-surface-variant);
}
.icon-action.danger {
  color: var(--color-error, #d32f2f);
}
.asset-preview {
  max-width: 100%;
  border-radius: 8px;
  display: block;
}
.asset-player {
  width: 100%;
}
.edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 45%);
}
.edit-sheet {
  width: 100%;
  box-sizing: border-box;
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  border-radius: 16px 16px 0 0;
  background: var(--card-bg, var(--input-bg));
  display: grid;
  gap: 12px;
}
.edit-sheet h3 {
  margin: 0;
  font-size: 1rem;
}
.edit-filename {
  margin: 0;
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
}
.edit-sheet label {
  display: grid;
  gap: 6px;
}
.edit-sheet label span {
  font-size: 0.8rem;
  color: var(--color-on-surface-variant);
}
.edit-sheet input,
.edit-sheet select {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--input-bg);
  color: var(--text-color);
  font: inherit;
}
.edit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 4px;
}
.edit-actions button {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 11px;
  background: transparent;
  color: var(--text-color);
  font: inherit;
}
.edit-actions button:last-child {
  border: var(--border-width) solid var(--color-primary);
  background: var(--color-primary);
  color: white;
}
</style>