<script setup lang="ts">
import { ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import BaseDialog from "@/components/common/BaseDialog.vue";
import IconPresetSelector from "@/components/common/IconPresetSelector.vue";
import Avatar from "@/components/common/Avatar.vue";
import { PRESET_ICONS } from "@/config/preset-icons";
import { open } from "@tauri-apps/plugin-dialog";
import { Star, Upload, RefreshLeft, Clock } from "@element-plus/icons-vue";
import { useImageViewer } from "@/composables/useImageViewer";
import { useElementSize, createReusableTemplate } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { extname } from "@tauri-apps/api/path";
import { resolveAvatarPath } from "@/tools/llm-chat/composables/useResolvedAvatar";

interface Props {
  modelValue: string;
  /** 用于上传专属头像，必须提供才能使用上传功能 */
  entityId?: string;
  /** 历史头像列表（由父组件传入，数据驱动） */
  avatarHistory?: string[];
  /** 用于确定上传目录 */
  profileType?: "agent" | "user";
  /** 用于 Avatar 的回退文本，建议使用 name 而非 displayName */
  nameForFallback?: string;
}
const props = withDefaults(defineProps<Props>(), {
  entityId: "",
  avatarHistory: () => [],
  profileType: "agent",
  nameForFallback: "图标",
});

const errorHandler = createModuleErrorHandler("AvatarSelector");

export interface IconUpdatePayload {
  value: string;
  source: "input" | "upload" | "preset" | "clear";
}

interface Emits {
  (e: "update:modelValue", value: string): void;
  (e: "update:icon", payload: IconUpdatePayload): void;
  /** 当上传新头像导致历史记录变化时触发 */
  (e: "update:avatarHistory", value: string[]): void;
}
const emit = defineEmits<Emits>();

// 图片查看器
const imageViewer = useImageViewer();

// 响应式布局
const containerRef = ref<HTMLElement | null>(null);
const controlsContainerRef = ref<HTMLElement | null>(null);

const { width: containerWidth } = useElementSize(containerRef);
const { width: controlsContainerWidth } = useElementSize(controlsContainerRef);

// 控制整体布局 (横向/纵向)
const isCompact = computed(() => containerWidth.value < 500);
const avatarSize = computed(() => (isCompact.value ? 100 : 128));

// 单独控制按钮组是否换行
const shouldWrapButtons = computed(() => controlsContainerWidth.value < 560);

// 复用按钮组模板
const [DefineActionButtons, ReuseActionButtons] = createReusableTemplate();

// 预设图标对话框
const showPresetIconDialog = ref(false);

// 历史头像按钮引用
const historyButtonRef = ref();

// 图像上传中状态
const isUploadingImage = ref(false);

// 历史头像列表
const isLoadingHistory = ref(false);

const historyAvatars = computed(() => {
  // 过滤并排序历史头像
  return [...props.avatarHistory].sort((a, b) => {
    const getTimestamp = (name: string) => {
      const match = name.match(/avatar-(\d+)/) || name.match(/avatar_migrated_(\d+)/);
      return match ? parseInt(match[1]) : 0;
    };

    const timeA = getTimestamp(a);
    const timeB = getTimestamp(b);

    if (timeA && timeB) return timeB - timeA;
    return b.localeCompare(a);
  });
});

// 加载历史头像 (现在仅用于 UI 反馈，数据已由 props 驱动)
const loadHistoryAvatars = async () => {
  if (!props.entityId) return;
  isLoadingHistory.value = true;
  // 模拟一个微小的延迟以显示加载状态，或者未来可以在这里进行校验
  await new Promise((resolve) => setTimeout(resolve, 50));
  isLoadingHistory.value = false;
};

// 选择历史头像
const selectHistoryAvatar = (filename: string) => {
  emit("update:icon", { value: filename, source: "input" });
  // 自动关闭 popover (通过点击 document body 实现，或者让用户自己点击外部)
  customMessage.success("已切换为历史头像");
};

// 打开预设图标选择器
const openPresetIconSelector = () => {
  showPresetIconDialog.value = true;
};

// 选择预设图标
const selectPresetIcon = (icon: any) => {
  // 恢复使用完整路径，保留 /model-icons/ 前缀
  const iconId = icon.path;
  emit("update:icon", { value: iconId, source: "preset" });
  showPresetIconDialog.value = false;
  customMessage.success("已选择预设图标");
};

// 上传自定义图像
const uploadCustomImage = async () => {
  try {
    const selectedPath = await open({
      multiple: false,
      filters: [
        { name: "图像文件", extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"] },
      ],
    });

    if (!selectedPath) return;

    // **上传逻辑：与 assets 解耦**
    if (!props.entityId) {
      errorHandler.error("缺少 entityId", "上传失败");
      return;
    }

    isUploadingImage.value = true;

    const extension = await extname(selectedPath);
    // 使用时间戳作为文件名的一部分，解决缓存问题并保留历史
    const timestamp = Date.now();
    const newFilename = `avatar-${timestamp}${extension ? `.${extension}` : ""}`;

    let subdirectory = "";
    if (props.profileType === "agent") {
      subdirectory = `llm-chat/agents/${props.entityId}`;
    } else if (props.profileType === "user") {
      subdirectory = `llm-chat/user-profiles/${props.entityId}`;
    } else {
      errorHandler.error(`未知的 profileType '${props.profileType}'`, "上传失败");
      return;
    }

    await invoke("copy_file_to_app_data", {
      sourcePath: selectedPath,
      subdirectory,
      newFilename,
    });

    // v-model 只存储文件名
    emit("update:icon", { value: newFilename, source: "upload" });

    // 更新历史记录
    const newHistory = [newFilename, ...props.avatarHistory.filter((h) => h !== newFilename)];
    emit("update:avatarHistory", newHistory);

    customMessage.success("专属头像上传成功");
  } catch (error) {
    errorHandler.error(error, "上传图像失败");
  } finally {
    isUploadingImage.value = false;
  }
};

// 清除图标
const clearIcon = () => {
  // 清空图标，让 Avatar 组件自动显示回退文本
  emit("update:icon", { value: "", source: "clear" });
  customMessage.info("已重置为默认图标");
};

// 解析最终的头像显示路径
const resolvedAvatarSrc = computed(() => {
  const icon = props.modelValue?.trim();
  if (!icon) return "";

  // 构造一个临时对象来复用 resolveAvatarPath 的逻辑
  // 如果有 entityId，resolveAvatarPath 会自动处理 appdata:// 路径
  if (props.entityId) {
    const type = props.profileType === "agent" ? "agent" : "user-profile";
    const resolved = resolveAvatarPath({ id: props.entityId, icon }, type);
    if (resolved) return resolved;
  }

  // 如果没有 entityId 或者解析结果为空（理论上 resolveAvatarPath 会返回 icon 本身如果不是文件名），
  // 但为了保险，我们直接返回原值
  return icon;
});

// 检查图标是否为可点击的图片路径
const sanitizedModelValue = computed(() => {
  return resolvedAvatarSrc.value.trim().replace(/^"|"$/g, "").trim();
});

const isImagePath = computed(() => {
  const s = sanitizedModelValue.value;
  return (
    s &&
    (s.startsWith("/") ||
      s.startsWith("appdata://") ||
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("data:"))
  );
});

// 点击图标放大查看
const handleIconClick = () => {
  // 只有当图标是图片路径时才打开查看器（不是 emoji）
  if (isImagePath.value) {
    imageViewer.show(sanitizedModelValue.value);
  }
};
</script>

<template>
  <div class="avatar-selector-layout" ref="containerRef" :class="{ 'is-compact': isCompact }">
    <div class="avatar-preview-container">
      <el-tooltip
        :content="isImagePath ? '点击放大查看' : ''"
        :disabled="!isImagePath"
        placement="top"
        :show-after="300"
      >
        <Avatar
          :src="resolvedAvatarSrc"
          :alt="nameForFallback"
          :size="avatarSize"
          shape="square"
          :radius="8"
          :border="false"
          :class="{ 'clickable-avatar': isImagePath }"
          @click="handleIconClick"
        />
      </el-tooltip>
    </div>
    <div class="icon-controls-container" ref="controlsContainerRef">
      <!-- 定义按钮组模板 -->
      <DefineActionButtons>
        <el-button-group :class="{ 'compact-button-group': shouldWrapButtons }">
          <el-tooltip content="选择预设图标" placement="top" :show-after="300">
            <el-button @click="openPresetIconSelector">
              <el-icon><Star /></el-icon>
            </el-button>
          </el-tooltip>

          <el-tooltip
            v-if="entityId"
            content="上传专属头像 (存入 AppData)"
            placement="top"
            :show-after="300"
          >
            <el-button @click="uploadCustomImage" :loading="isUploadingImage">
              <el-icon><Upload /></el-icon>
            </el-button>
          </el-tooltip>

          <!-- 历史头像选择按钮 -->
          <el-tooltip v-if="entityId" content="历史头像" placement="top" :show-after="300">
            <el-button ref="historyButtonRef">
              <el-icon><Clock /></el-icon>
            </el-button>
          </el-tooltip>

          <el-popover
            v-if="entityId"
            :virtual-ref="historyButtonRef"
            virtual-triggering
            placement="bottom"
            :width="320"
            trigger="click"
            @show="loadHistoryAvatars"
          >
            <div class="history-avatars-panel">
              <div class="panel-header">历史头像</div>

              <div v-if="isLoadingHistory" class="loading-state">加载中...</div>

              <div v-else-if="historyAvatars.length === 0" class="empty-state">暂无上传记录</div>

              <div v-else class="avatar-grid">
                <div
                  v-for="filename in historyAvatars"
                  :key="filename"
                  class="history-avatar-item"
                  :class="{ active: modelValue === filename }"
                  @click="selectHistoryAvatar(filename)"
                >
                  <Avatar
                    :src="`appdata://llm-chat/${profileType === 'agent' ? 'agents' : 'user-profiles'}/${entityId}/${filename}`"
                    :size="48"
                    shape="square"
                    :radius="6"
                  />
                </div>
              </div>
            </div>
          </el-popover>

          <el-tooltip content="重置为默认" placement="top" :show-after="300">
            <el-button @click="clearIcon">
              <el-icon><RefreshLeft /></el-icon>
            </el-button>
          </el-tooltip>
        </el-button-group>
      </DefineActionButtons>

      <el-input
        :model-value="modelValue"
        @update:model-value="$emit('update:icon', { value: $event, source: 'input' })"
        placeholder="输入 Emoji / 路径 / 上传头像"
        class="icon-input"
      >
        <!-- 宽屏模式：显示在 Input 内部 -->
        <template #append v-if="!shouldWrapButtons">
          <ReuseActionButtons />
        </template>
      </el-input>

      <!-- 紧凑模式：显示在 Input 下方 -->
      <div v-if="shouldWrapButtons" class="compact-actions-wrapper">
        <ReuseActionButtons />
      </div>

      <div class="form-hint">
        支持 Emoji、预设图标、本地路径引用{{ entityId ? "或上传专属头像" : "" }}。
      </div>
    </div>
  </div>

  <!-- 预设图标选择对话框 -->
  <BaseDialog v-model="showPresetIconDialog" title="选择预设图标" width="80%" height="70vh">
    <template #content>
      <IconPresetSelector
        :icons="PRESET_ICONS"
        :get-icon-path="(path: string) => path"
        show-search
        show-categories
        @select="selectPresetIcon"
      />
    </template>
  </BaseDialog>
</template>

<style scoped>
.avatar-selector-layout {
  display: flex;
  flex-direction: row;
  gap: 16px;
  width: 100%;
  align-items: flex-start;
}

.avatar-selector-layout.is-compact {
  flex-direction: column;
  align-items: center;
}

.avatar-selector-layout.is-compact .icon-controls-container {
  width: 100%;
}

.compact-actions-wrapper {
  margin-top: 8px;
  display: flex;
  justify-content: center;
  width: 100%;
}

.compact-button-group {
  display: flex;
  width: 100%;
}

.compact-button-group .el-button {
  flex: 1;
}

.avatar-preview-container {
  flex-shrink: 0;
}

.icon-controls-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.icon-input {
  width: 100%;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 6px;
}

/* 可点击的头像 */
.clickable-avatar {
  cursor: pointer;
  transition: opacity 0.2s;
}

.clickable-avatar:hover {
  opacity: 0.8;
}

/* 历史头像面板样式 */
.history-avatars-panel {
  max-height: 500px;
  overflow-y: auto;
}

.panel-header {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 12px;
  color: var(--text-color-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.loading-state,
.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.history-avatar-item {
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2px;
}

.history-avatar-item:hover {
  background-color: var(--bg-color-hover);
}

.history-avatar-item.active {
  border-color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}
</style>
