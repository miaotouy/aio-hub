<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUpdate, nextTick } from "vue";
import { ElScrollbar } from "element-plus";
import type { MediaMessage } from "../../types";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useAssetManager, assetManagerEngine } from "@/composables/useAssetManager";
import { useUserProfileStore } from "@/tools/llm-chat/stores/userProfileStore";
import Avatar from "@/components/common/Avatar.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { Bot, Image as ImageIcon, Film, Music, Play, Volume2 } from "lucide-vue-next";

interface Props {
  message: MediaMessage;
  siblings: MediaMessage[];
  currentSiblingIndex: number;
}

interface Emits {
  (e: "switch-branch", nodeId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { getIconPath, getDisplayIconPath } = useModelMetadata();
const { getProfileById } = useLlmProfiles();
const { getAssetUrl } = useAssetManager();
const userProfileStore = useUserProfileStore();

const assetBasePath = ref("");
const scrollbarRef = ref<InstanceType<typeof ElScrollbar> | null>(null);
const branchItemsRef = ref<HTMLDivElement[]>([]);
const thumbnailMap = ref<Record<string, string>>({});

onBeforeUpdate(() => {
  branchItemsRef.value = [];
});

/**
 * 加载资产缩略图
 */
const loadThumbnails = async () => {
  for (const sibling of props.siblings) {
    const task = sibling.metadata?.taskSnapshot;
    if (task?.status === "completed" && task.resultAssets) {
      for (const asset of task.resultAssets) {
        if (asset.id && !thumbnailMap.value[asset.id]) {
          const url = await getAssetUrl(asset, true);
          if (url) thumbnailMap.value[asset.id] = url;
        }
      }
    }
  }
};

onMounted(async () => {
  assetBasePath.value = await assetManagerEngine.getAssetBasePath();
  loadThumbnails();
  nextTick(() => {
    const currentItemEl = branchItemsRef.value[props.currentSiblingIndex];
    if (scrollbarRef.value && currentItemEl) {
      const scrollbarEl = scrollbarRef.value.wrapRef as HTMLElement;
      if (!scrollbarEl) return;
      const scrollbarHeight = scrollbarEl.clientHeight;
      const itemHeight = currentItemEl.clientHeight;
      const scrollTop = currentItemEl.offsetTop - scrollbarHeight / 2 + itemHeight / 2;
      scrollbarRef.value.setScrollTop(Math.max(0, scrollTop));
    }
  });
});

// 获取消息预览文本
const getMessagePreview = (content: string): string => {
  const plainText = content.replace(/[#*`\n]/g, " ").trim();
  return plainText.length > 50 ? plainText.slice(0, 50) + "..." : plainText;
};

// 为每个 sibling 构建显示信息
const siblingsWithDisplayInfo = computed(() => {
  return props.siblings.map((sibling) => {
    const metadata = sibling.metadata;
    const task = metadata?.taskSnapshot;

    let displayName = "";
    let avatarSrc: string | null = null;
    let modelIcon: string | null = null;
    let profileInfo: { name: string; icon: string | null } | null = null;
    let previewUrls: { url: string; assetId?: string }[] = [];
    let mediaType: string | null = null;

    if (sibling.role === "user") {
      displayName =
        userProfileStore.globalProfile?.displayName || userProfileStore.globalProfile?.name || "你";
      avatarSrc = userProfileStore.globalProfile?.icon || "";
    } else {
      // 助手侧逻辑
      const modelId = metadata?.modelId || task?.input?.modelId;
      displayName =
        metadata?.modelDisplayName || metadata?.modelName || task?.input?.modelId || "AI";

      if (modelId) {
        const iconPath = getIconPath(modelId);
        modelIcon = iconPath ? getDisplayIconPath(iconPath) : null;
      }

      const profileId = metadata?.profileId || task?.input?.profileId;
      const profile = profileId ? getProfileById(profileId) : null;
      profileInfo = {
        name: metadata?.profileDisplayName || profile?.name || profileId || "",
        icon: profile?.icon || profile?.logoUrl || null,
      };

      // 媒体预览
      if (task) {
        mediaType = task.type;
        if (task.status === "completed") {
          // 统一获取资产列表 (多资产范式)
          const assets = task.resultAssets || (task.resultAsset ? [task.resultAsset] : []);

          if (assets.length > 0) {
            previewUrls = assets.slice(0, 3).map((asset) => {
              // 优先使用已加载的缩略图
              let url = thumbnailMap.value[asset.id] || "";

              // 如果缩略图还没加载完，回退到 path 转换
              if (!url && asset.path && assetBasePath.value) {
                url = assetManagerEngine.convertToAssetProtocol(asset.path, assetBasePath.value);
              }

              return { url, assetId: asset.id };
            });
          }

          // 如果依然没有预览图，尝试从 previewUrls 兜底 (兼容生成过程中的临时预览)
          if (previewUrls.length === 0 || previewUrls.every((p) => !p.url)) {
            const rawPreviews = task.previewUrls || (task.previewUrl ? [task.previewUrl] : []);
            previewUrls = rawPreviews.slice(0, 3).map((rawPath) => {
              let url = rawPath;
              if (
                !rawPath.startsWith("http") &&
                !rawPath.startsWith("appdata://") &&
                !rawPath.startsWith("asset://") &&
                assetBasePath.value
              ) {
                url = assetManagerEngine.convertToAssetProtocol(rawPath, assetBasePath.value);
              }
              return { url };
            });
          }
        }
      }
    }

    return {
      ...sibling,
      displayName,
      avatarSrc,
      modelIcon,
      profileInfo,
      previewUrls,
      mediaType,
      taskStatus: task?.status,
    };
  });
});

const handleSwitchToBranch = (nodeId: string) => {
  emit("switch-branch", nodeId);
};
</script>

<template>
  <div class="branch-selector-content">
    <div class="branch-selector-header">选择生成版本</div>
    <el-scrollbar ref="scrollbarRef" max-height="400px">
      <div class="branch-list">
        <div
          v-for="(item, index) in siblingsWithDisplayInfo"
          :key="item.id"
          :ref="
            (el) => {
              if (el) branchItemsRef[index] = el as HTMLDivElement;
            }
          "
          class="branch-item"
          :class="{
            'is-current': index === currentSiblingIndex,
            'is-assistant': item.role === 'assistant',
          }"
          @click="handleSwitchToBranch(item.id)"
        >
          <div class="branch-item-main">
            <div class="branch-item-header">
              <!-- 第一行：编号、当前标识、模型/用户头像及名称 -->
              <div class="header-top">
                <div class="header-left">
                  <span
                    class="branch-number"
                    :class="{ 'is-current-number': index === currentSiblingIndex }"
                  >
                    #{{ index + 1 }}
                  </span>

                  <!-- 助手侧使用模型图标 -->
                  <div v-if="item.role === 'assistant'" class="mini-model-icon">
                    <DynamicIcon
                      v-if="item.modelIcon"
                      :src="item.modelIcon"
                      :alt="item.displayName"
                      class="model-img"
                    />
                    <Bot v-else :size="14" />
                  </div>
                  <!-- 用户侧使用头像 -->
                  <Avatar
                    v-else
                    :src="item.avatarSrc || ''"
                    :alt="item.displayName"
                    :size="20"
                    shape="square"
                    :radius="4"
                  />

                  <span class="branch-name">{{ item.displayName }}</span>
                </div>
                <span v-if="item.taskStatus" class="status-dot" :class="item.taskStatus"></span>
              </div>
            </div>

            <div class="branch-preview">{{ getMessagePreview(item.content) }}</div>

            <!-- 媒体预览图 (单独一行) -->
            <div
              v-if="item.previewUrls.length > 0 || item.mediaType"
              class="branch-media-row"
              :class="{ 'is-multi': item.previewUrls.length > 1 }"
            >
              <template v-if="item.previewUrls.some((p) => p.url)">
                <div
                  v-for="(preview, i) in item.previewUrls"
                  :key="i"
                  class="media-preview-box"
                  :class="[`is-${item.mediaType}`]"
                >
                  <img v-if="preview.url" :src="preview.url" class="preview-img" />
                  <div v-if="item.mediaType === 'video'" class="media-type-overlay">
                    <Play :size="16" fill="currentColor" />
                  </div>
                  <div v-else-if="item.mediaType === 'audio'" class="media-type-overlay">
                    <Volume2 :size="16" />
                  </div>
                </div>
              </template>
              <div v-else class="media-preview-box is-placeholder">
                <div class="preview-placeholder">
                  <ImageIcon v-if="item.mediaType === 'image'" :size="20" />
                  <Film v-else-if="item.mediaType === 'video'" :size="20" />
                  <Music v-else-if="item.mediaType === 'audio'" :size="20" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style>
.branch-selector-popover {
  padding: 2px !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
}

.branch-selector-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.branch-selector-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  padding: 10px 14px 6px;
  border-bottom: 1px solid var(--border-color-light);
}

.branch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.branch-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid var(--border-color);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: var(--card-bg);
  position: relative;
}

.branch-item:hover {
  background-color: var(--hover-bg);
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.branch-item.is-current {
  background-color: var(--primary-color-light);
  border-color: var(--primary-color);
}

.branch-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.branch-item-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  width: 100%;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.header-bottom {
  display: flex;
  align-items: center;
  padding-left: 28px; /* 对齐编号后的图标位置 */
  width: 100%;
}

.branch-number {
  font-weight: 700;
  color: var(--text-color-secondary);
  font-family: var(--font-family-mono);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  transition: all 0.2s;
}

.branch-number.is-current-number {
  background-color: color-mix(in srgb, var(--el-color-primary) 15%, transparent);
  color: var(--el-color-primary);
  border: 1px solid var(--el-color-primary);
}

.mini-model-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color-soft);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.model-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.branch-name {
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-preview {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.branch-meta-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.profile-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--primary-color);
  background-color: var(--primary-color-light);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  max-width: 100%;
}

.meta-icon {
  width: 12px;
  height: 12px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--text-color-tertiary);
}

.status-dot.completed {
  background-color: var(--success-color);
}
.status-dot.processing {
  background-color: var(--warning-color);
  animation: pulse 1.5s infinite;
}
.status-dot.error {
  background-color: var(--error-color);
}

@keyframes pulse {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.branch-media-row {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  width: 100%;
}

.branch-media-row.is-multi .media-preview-box {
  flex: 1;
  aspect-ratio: 1 / 1;
  height: auto;
}

.media-preview-box {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-color-soft);
  border: 1px solid var(--border-color);
  flex-shrink: 0;
  transition: transform 0.2s;
}

.media-preview-box:hover {
  transform: scale(1.05);
}

.media-preview-box.is-placeholder {
  width: 64px;
}

.media-type-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  color: white;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.media-preview-box:hover .media-type-overlay {
  opacity: 1;
  background: rgba(0, 0, 0, 0.3);
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-tertiary);
  opacity: 0.5;
}
</style>
