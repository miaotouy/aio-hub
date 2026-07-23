<script setup lang="ts">
import {
  ArchiveRestore,
  Download,
  Eye,
  EyeOff,
  FileText,
  LoaderCircle,
  Pin,
  PinOff,
  Share2,
  Trash2,
  X,
} from "lucide-vue-next";
import { computed } from "vue";
import { formatAssetBytes } from "../composables/useAssetLibrary";
import type { AssetDetail, AssetPreviewSource } from "../types";

const props = defineProps<{
  detail: AssetDetail;
  preview: AssetPreviewSource | null;
  saving?: boolean;
  sharing?: boolean;
  replacingText?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  preview: [assetId: string];
  save: [assetId: string];
  share: [assetId: string];
  replaceText: [assetId: string];
  visibility: [assetId: string, hidden: boolean];
  retention: [assetId: string, pinned: boolean];
  remove: [assetId: string];
}>();

const canPreview = computed(
  () =>
    props.detail.availability === "ready" &&
    ["image", "audio", "video"].includes(props.detail.kind)
);

const createdAt = computed(() => new Date(props.detail.createdAt).toLocaleString());
</script>

<template>
  <div class="sheet-layer" role="presentation" @click.self="emit('close')">
    <section class="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="asset-detail-title" data-testid="asset-detail" :data-asset-id="detail.id" :data-asset-mime="detail.mimeType" :data-asset-size="detail.sizeBytes" :data-origin-count="detail.origins.length" :data-origin-kinds="detail.origins.map((origin) => origin.originKind).join(',')" :data-source-modules="detail.origins.map((origin) => origin.sourceModule).join(',')">
      <header class="sheet-header">
        <div class="header-copy">
          <h2 id="asset-detail-title">{{ detail.displayName }}</h2>
          <p>{{ formatAssetBytes(detail.sizeBytes) }} · {{ detail.mimeType }}</p>
        </div>
        <div class="header-actions">
          <button
            v-if="detail.availability === 'ready'"
            class="icon-button"
            data-testid="asset-detail-save"
            type="button"
            aria-label="保存到文件"
            :disabled="props.saving || props.sharing || props.busy"
            @click="emit('save', detail.id)"
          >
            <LoaderCircle v-if="props.saving" class="spin" :size="21" />
            <Download v-else :size="21" />
          </button>
          <button
            v-if="detail.availability === 'ready'"
            class="icon-button"
            data-testid="asset-detail-share"
            type="button"
            aria-label="分享资产"
            :disabled="props.saving || props.sharing || props.busy"
            @click="emit('share', detail.id)"
          >
            <LoaderCircle v-if="props.sharing" class="spin" :size="21" />
            <Share2 v-else :size="21" />
          </button>
          <button class="icon-button" type="button" data-testid="asset-detail-close" aria-label="关闭详情" :disabled="props.busy" @click="emit('close')">
            <X :size="22" />
          </button>
        </div>
      </header>

      <div class="sheet-scroll">
        <div v-if="preview" class="preview-stage" data-testid="asset-preview-ready">
          <img v-if="detail.kind === 'image'" :src="preview.url" :alt="detail.displayName" data-testid="asset-preview-image" />
          <video v-else-if="detail.kind === 'video'" :src="preview.url" controls playsinline />
          <audio v-else-if="detail.kind === 'audio'" :src="preview.url" controls />
        </div>
        <button v-else-if="canPreview" class="preview-button" type="button" data-testid="asset-detail-preview" :disabled="props.busy" @click="emit('preview', detail.id)">
          <Eye :size="18" />
          打开临时预览
        </button>

        <div class="detail-actions" role="toolbar" aria-label="资产操作">
          <button
            type="button"
            :disabled="props.busy"
            @click="emit('retention', detail.id, detail.retentionPolicy !== 'pinned')"
          >
            <PinOff v-if="detail.retentionPolicy === 'pinned'" :size="17" />
            <Pin v-else :size="17" />
            {{ detail.retentionPolicy === 'pinned' ? "取消固定" : "固定原件" }}
          </button>
          <button
            type="button"
            :disabled="props.busy"
            @click="emit('visibility', detail.id, detail.libraryState !== 'hidden')"
          >
            <ArchiveRestore v-if="detail.libraryState === 'hidden'" :size="17" />
            <EyeOff v-else :size="17" />
            {{ detail.libraryState === 'hidden' ? "恢复可见" : "隐藏资产" }}
          </button>
          <button
            class="danger-action"
            data-testid="asset-detail-delete"
            type="button"
            :disabled="props.busy"
            @click="emit('remove', detail.id)"
          >
            <Trash2 :size="17" />
            清理原件
          </button>
        </div>

        <button
          v-if="detail.kind === 'document' && detail.availability === 'ready'"
          class="text-replacement-button"
          type="button"
          :disabled="props.replacingText || props.busy"
          @click="emit('replaceText', detail.id)"
        >
          <LoaderCircle v-if="props.replacingText" class="spin" :size="18" />
          <FileText v-else :size="18" />
          {{ props.replacingText ? "处理中" : "提取文本并清理原件" }}
        </button>

        <dl class="facts">
          <div><dt>状态</dt><dd>{{ detail.availability }}</dd></div>
          <div><dt>保留策略</dt><dd>{{ detail.retentionPolicy === "pinned" ? "固定保留" : "可回收" }}</dd></div>
          <div><dt>资产库</dt><dd>{{ detail.libraryState === "hidden" ? "已隐藏" : "可见" }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ createdAt }}</dd></div>
          <div><dt>内容哈希</dt><dd class="hash">{{ detail.contentHash }}</dd></div>
        </dl>

        <section
          class="detail-section"
          data-testid="asset-usage-list"
          :data-usage-count="detail.usages.length"
        >
          <h3>来源</h3>
          <p v-if="!detail.origins.length" class="quiet">无来源记录</p>
          <div v-for="origin in detail.origins" :key="origin.id" class="detail-row">
            <strong>{{ origin.originalName }}</strong>
            <span>{{ origin.sourceModule }} · {{ origin.originKind }}</span>
          </div>
        </section>

        <section class="detail-section">
          <h3>使用关系</h3>
          <p v-if="!detail.usages.length" class="quiet">当前没有工具引用此资产</p>
          <div
            v-for="usage in detail.usages"
            :key="usage.id"
            class="detail-row"
            data-testid="asset-usage-row"
            :data-usage-entity-id="usage.entityId"
          >
            <strong>{{ usage.moduleId }} / {{ usage.role }}</strong>
            <span>{{ usage.usagePolicy === "blocking" ? "阻止删除" : "删除前提醒" }}</span>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sheet-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.42);
}

.detail-sheet {
  width: 100%;
  max-height: min(82vh, 760px);
  display: flex;
  flex-direction: column;
  color: var(--text-color);
  background: var(--overlay-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-top: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-xl) var(--app-radius-xl) 0 0;
}

.sheet-header {
  min-height: 64px;
  padding: 14px 12px 10px 18px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.header-copy {
  min-width: 0;
  flex: 1;
}

.header-copy h2 {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 17px;
  line-height: 1.35;
}

.header-copy p {
  margin: 4px 0 0;
  color: var(--text-color-light);
  font-size: 12px;
}

.icon-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  color: var(--text-color);
  background: transparent;
  border: 0;
}

.icon-button:disabled {
  opacity: 0.45;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.header-actions {
  display: flex;
  align-items: center;
}

.sheet-scroll {
  min-height: 0;
  padding: 16px 18px calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto;
}

.preview-stage {
  min-height: 164px;
  margin-bottom: 18px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #101214;
  border-radius: var(--app-radius-md);
}

.preview-stage img,
.preview-stage video {
  width: 100%;
  max-height: 42vh;
  object-fit: contain;
}

.preview-stage audio {
  width: calc(100% - 24px);
}

.preview-button {
  min-height: 48px;
  margin-bottom: 18px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 34%, transparent);
  border-radius: var(--app-radius-md);
}

.detail-actions {
  margin: 0 0 18px;
  display: flex;
  gap: 7px;
  overflow-x: auto;
  scrollbar-width: none;
}

.detail-actions::-webkit-scrollbar {
  display: none;
}

.detail-actions button {
  min-height: 42px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  color: var(--text-color-light);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--app-radius-md);
  white-space: nowrap;
}

.detail-actions button.danger-action {
  color: var(--danger-color);
  border-color: color-mix(in srgb, var(--danger-color) 35%, transparent);
}

.detail-actions button:disabled {
  opacity: 0.58;
}

.text-replacement-button {
  min-height: 48px;
  width: 100%;
  margin-bottom: 18px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 34%, transparent);
  border-radius: var(--app-radius-md);
}

.text-replacement-button:disabled {
  opacity: 0.55;
}

.facts {
  margin: 0;
}

.facts div {
  min-height: 42px;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: start;
  padding: 9px 0;
  border-bottom: var(--border-width) solid var(--border-color);
}

.facts dt,
.facts dd {
  margin: 0;
}

.facts dt {
  color: var(--text-color-light);
}

.facts dd {
  overflow-wrap: anywhere;
  text-align: right;
}

.hash {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
}

.detail-section {
  margin-top: 22px;
}

.detail-section h3 {
  margin: 0 0 10px;
  font-size: 14px;
}

.detail-row {
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.detail-row strong {
  overflow-wrap: anywhere;
  font-size: 13px;
}

.detail-row span,
.quiet {
  color: var(--text-color-light);
  font-size: 12px;
}
</style>
