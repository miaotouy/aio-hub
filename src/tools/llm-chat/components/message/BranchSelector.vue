<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUpdate, nextTick } from "vue";
import { ElScrollbar } from "element-plus";
import type { ChatMessageNode } from "../../types";
import { useAgentStore } from "../../agentStore";
import { useUserProfileStore } from "../../userProfileStore";
import { useResolvedAvatar } from "../../composables/useResolvedAvatar";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import Avatar from "@/components/common/Avatar.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

interface Props {
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
}

interface Emits {
  (e: "switch-branch", nodeId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const agentStore = useAgentStore();
const userProfileStore = useUserProfileStore();
const { getProfileById } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();

const scrollbarRef = ref<InstanceType<typeof ElScrollbar> | null>(null);
const branchItemsRef = ref<HTMLDivElement[]>([]);

// 每次更新前重置 refs，以避免引用失效
onBeforeUpdate(() => {
  branchItemsRef.value = [];
});

// 组件挂载时滚动到当前分支项
onMounted(() => {
  nextTick(() => {
    const currentItemEl = branchItemsRef.value[props.currentSiblingIndex];
    if (scrollbarRef.value && currentItemEl) {
      const scrollbarEl = scrollbarRef.value.wrapRef as HTMLElement;
      if (!scrollbarEl) return;

      const scrollbarHeight = scrollbarEl.clientHeight;
      const itemHeight = currentItemEl.clientHeight;

      // 计算期望的滚动位置以使项目居中
      const scrollTop = currentItemEl.offsetTop - scrollbarHeight / 2 + itemHeight / 2;

      // 确保滚动位置不为负
      const finalScrollTop = Math.max(0, scrollTop);

      scrollbarRef.value.setScrollTop(finalScrollTop);
    }
  });
});

// 处理切换到指定分支
const handleSwitchToBranch = (nodeId: string) => {
  emit("switch-branch", nodeId);
};

// 获取消息预览文本（截取前50个字符）
const getMessagePreview = (content: string): string => {
  const plainText = content.replace(/[#*`\n]/g, " ").trim();
  return plainText.length > 50 ? plainText.slice(0, 50) + "..." : plainText;
};

// 为每个 sibling 构建显示信息（类似 MessageHeader 的逻辑）
const siblingsWithDisplayInfo = computed(() => {
  return props.siblings.map((sibling) => {
    let displayName = "";
    let avatarSrc: string | null = null;
    let modelInfo: {
      modelName: string;
      profileName: string;
      modelIcon?: string;
      profileIcon?: string;
    } | null = null;

    if (sibling.role === "user") {
      // 用户消息：优先使用快照，否则回退到当前用户档案
      if (sibling.metadata?.userProfileName) {
        displayName = sibling.metadata.userProfileName;
      } else {
        displayName =
          userProfileStore.globalProfile?.displayName ||
          userProfileStore.globalProfile?.name ||
          "你";
      }

      // 解析头像
      const avatarTarget = computed(() => {
        if (sibling.metadata?.userProfileIcon && sibling.metadata.userProfileId) {
          return {
            id: sibling.metadata.userProfileId,
            icon: sibling.metadata.userProfileIcon,
          };
        }
        return userProfileStore.globalProfile;
      });
      avatarSrc = useResolvedAvatar(avatarTarget, "user-profile").value;
    } else if (sibling.role === "assistant") {
      // 助手消息：优先使用快照，否则回退到当前智能体
      const agentId = sibling.metadata?.agentId;
      const agent = agentId ? agentStore.getAgentById(agentId) : null;

      displayName =
        sibling.metadata?.agentName || agent?.displayName || agent?.name || "助手";

      // 解析头像
      const avatarTarget = computed(() => {
        if (sibling.metadata?.agentIcon && sibling.metadata.agentId) {
          return {
            id: sibling.metadata.agentId,
            icon: sibling.metadata.agentIcon,
          };
        }
        return agent;
      });
      avatarSrc = useResolvedAvatar(avatarTarget, "agent").value;

      // 获取模型信息
      const metadata = sibling.metadata;
      if (metadata) {
        const profileId = metadata.profileId;
        const modelId = metadata.modelId;

        if (profileId && modelId) {
          const profile = getProfileById(profileId);
          if (profile) {
            const model = profile.models.find((m) => m.id === modelId);
            if (model) {
              modelInfo = {
                modelName: metadata.modelName || model.name || model.id,
                profileName: profile.name,
                modelIcon: getModelIcon(model) || undefined,
                profileIcon: profile.icon || profile.logoUrl || undefined,
              };
            }
          }
        }
      }
    } else {
      displayName = "系统";
      avatarSrc = "⚙️";
    }

    return {
      ...sibling,
      displayName,
      avatarSrc,
      modelInfo,
    };
  });
});
</script>

<template>
  <div class="branch-selector-content">
    <div class="branch-selector-header">选择分支版本</div>
    <el-scrollbar ref="scrollbarRef" max-height="300px">
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
          :class="{ 'is-current': index === currentSiblingIndex }"
          @click="handleSwitchToBranch(item.id)"
        >
          <div class="branch-item-header">
            <span class="branch-number">#{{ index + 1 }}</span>
            <span v-if="index === currentSiblingIndex" class="current-badge">当前</span>

            <!-- 头像 -->
            <Avatar
              :src="item.avatarSrc || ''"
              :alt="item.displayName"
              :size="24"
              shape="square"
              :radius="4"
              class="branch-avatar"
            />

            <!-- 名称 -->
            <span class="branch-name">{{ item.displayName }}</span>
          </div>

          <!-- 消息预览 -->
          <div class="branch-preview">{{ getMessagePreview(item.content) }}</div>

          <!-- 模型信息（仅助手消息） -->
          <div v-if="item.modelInfo" class="branch-meta">
            <div class="meta-item">
              <DynamicIcon
                :src="item.modelInfo.modelIcon || ''"
                :alt="item.modelInfo.modelName"
                class="meta-icon"
              />
              <span class="meta-text">{{ item.modelInfo.modelName }}</span>
            </div>
            <span class="meta-separator">·</span>
            <div class="meta-item">
              <DynamicIcon
                :src="item.modelInfo.profileIcon || ''"
                :alt="item.modelInfo.profileName"
                class="meta-icon"
              />
              <span class="meta-text">{{ item.modelInfo.profileName }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style>
/* Branch Selector Styles - Non-scoped for Popover content */
.branch-selector-popover {
  padding: 2px !important;
  border-radius: 8px !important;
}

.branch-selector-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px;
}

.branch-selector-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  padding: 4px;
}

.branch-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 8px;
  margin: 12px;
}

.branch-item {
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
  background-color: var(--card-bg);
  position: relative;
  overflow: hidden;
}

.branch-item:hover {
  background-color: var(--el-fill-color-light);
  border-color: var(--primary-color);
  transform: translateY(-1px);
  box-shadow: var(--el-box-shadow-light);
}

.branch-item.is-current {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  border-color: var(--primary-color);
}

.branch-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}

.branch-number {
  font-weight: 600;
  color: var(--text-color-secondary);
  font-family: monospace;
  background: var(--el-fill-color);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  flex-shrink: 0;
}

.branch-item.is-current .branch-number {
  color: var(--primary-color);
  background: var(--card-bg);
}

.current-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  background-color: var(--primary-color);
  color: #ffffff;
  line-height: 1;
  font-weight: 500;
  box-shadow: var(--el-box-shadow-light);
  flex-shrink: 0;
}

.branch-avatar {
  flex-shrink: 0;
}

.branch-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.branch-preview {
  font-size: 13px;
  color: var(--text-color);
  line-height: 1.5;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  opacity: 0.85;
}

.branch-item:hover .branch-preview {
  opacity: 1;
}

.branch-meta {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px dashed var(--border-color);
  padding-top: 6px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

.branch-meta .meta-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
  flex-shrink: 0;
}

.meta-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-separator {
  color: var(--text-color-tertiary);
  opacity: 0.5;
}
</style>
