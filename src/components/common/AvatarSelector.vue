<script setup lang="ts">
import { ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import BaseDialog from "@/components/common/BaseDialog.vue";
import IconPresetSelector from "@/components/common/IconPresetSelector.vue";
import Avatar from "@/components/common/Avatar.vue";
import { PRESET_ICONS } from "@/config/preset-icons";
import { open } from "@tauri-apps/plugin-dialog";
import { Star, Upload, RefreshLeft, Clock, Close } from "@element-plus/icons-vue";
import { useImageViewer } from "@/composables/useImageViewer";
import { useElementSize, createReusableTemplate } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { extname } from "@tauri-apps/api/path";
import { readDir, remove, BaseDirectory } from "@tauri-apps/plugin-fs";
import { resolveAvatarPath } from "@/tools/llm-chat/composables/ui/useResolvedAvatar";

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

interface Emits {
  /** v-model 标准接口，传递纯 string 值 */
  (e: "update:modelValue", value: string): void;
  /** 当上传新头像导致历史记录变化时触发 */
  (e: "update:avatarHistory", value: string[]): void;
}
const emit = defineEmits<Emits>();

/** 统一的图标变更 emit 辅助函数 */
const emitIconChange = (value: string) => {
  emit("update:modelValue", value);
};

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

// 历史头像对话框
const showHistoryDialog = ref(false);

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
// 加载历史头像，自动同步目录下的文件
const loadHistoryAvatars = async () => {
  if (!props.entityId) return;
  isLoadingHistory.value = true;

  try {
    // 构造目录路径
    let subdirectory = "";
    if (props.profileType === "agent") {
      subdirectory = `llm-chat/agents/${props.entityId}`;
    } else {
      subdirectory = `llm-chat/user-profiles/${props.entityId}`;
    }

    // 读取目录内容
    const entries = await readDir(subdirectory, { baseDir: BaseDirectory.AppData });

    // 过滤出图片文件
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"];
    const foundAvatars: string[] = [];

    for (const entry of entries) {
      if (entry.isFile) {
        const name = entry.name.toLowerCase();
        if (imageExtensions.some((ext) => name.endsWith(ext))) {
          foundAvatars.push(entry.name);
        }
      }
    }

    // 与现有历史合并并去重
    const mergedHistory = Array.from(new Set([...foundAvatars, ...props.avatarHistory]));

    // 如果有变化，通知父组件更新
    if (JSON.stringify(mergedHistory) !== JSON.stringify(props.avatarHistory)) {
      emit("update:avatarHistory", mergedHistory);
    }
  } catch (error) {
    // 如果目录不存在或其他错误，静默处理
    console.warn("Failed to sync history avatars:", error);
  } finally {
    isLoadingHistory.value = false;
  }
};

// 选择历史头像
const selectHistoryAvatar = (filename: string) => {
  emitIconChange(filename);
  customMessage.success("已切换为历史头像");
};

// 删除中的文件名集合（防止重复点击）
const deletingAvatars = ref<Set<string>>(new Set());

// 删除历史头像
const deleteHistoryAvatar = async (filename: string, event: Event) => {
  event.stopPropagation(); // 阻止冒泡到选择事件

  if (deletingAvatars.value.has(filename)) return;
  deletingAvatars.value.add(filename);

  try {
    // 构造文件路径
    let subdirectory = "";
    if (props.profileType === "agent") {
      subdirectory = `llm-chat/agents/${props.entityId}`;
    } else {
      subdirectory = `llm-chat/user-profiles/${props.entityId}`;
    }

    // 删除物理文件
    await remove(`${subdirectory}/${filename}`, { baseDir: BaseDirectory.AppData });

    // 从历史记录中移除
    const newHistory = props.avatarHistory.filter((h) => h !== filename);
    emit("update:avatarHistory", newHistory);

    // 如果当前选中的就是被删除的头像，清空
    if (props.modelValue === filename) {
      emitIconChange("");
    }

    customMessage.success("已删除历史头像");
  } catch (error) {
    errorHandler.error(error, "删除头像失败");
  } finally {
    deletingAvatars.value.delete(filename);
  }
};

// 打开历史头像对话框
const openHistoryDialog = () => {
  showHistoryDialog.value = true;
  loadHistoryAvatars();
};

// 打开预设图标选择器
const openPresetIconSelector = () => {
  showPresetIconDialog.value = true;
};

// 选择预设图标
const selectPresetIcon = (icon: any) => {
  // 恢复使用完整路径,保留 /model-icons/ 前缀
  emitIconChange(icon.path);
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
    emitIconChange(newFilename);

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
  emitIconChange("");
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
  <div class="avatar-selector-root">
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
              <el-button @click="openHistoryDialog">
                <el-icon><Clock /></el-icon>
              </el-button>
            </el-tooltip>

            <el-tooltip content="重置为默认" placement="top" :show-after="300">
              <el-button @click="clearIcon">
                <el-icon><RefreshLeft /></el-icon>
              </el-button>
            </el-tooltip>
          </el-button-group>
        </DefineActionButtons>

        <el-input
          :model-value="modelValue"
          @update:model-value="(val: string) => emitIconChange(val)"
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

    <!-- 历史头像对话框 -->
    <BaseDialog v-model="showHistoryDialog" title="历史头像" width="520px" height="auto">
      <template #content>
        <div class="history-dialog-content">
          <div v-if="isLoadingHistory" class="loading-state">
            <span>加载中...</span>
          </div>

          <div v-else-if="historyAvatars.length === 0" class="empty-state">
            <el-icon :size="48" color="var(--el-text-color-placeholder)"><Clock /></el-icon>
            <p>暂无上传记录</p>
          </div>

          <div v-else class="history-avatar-grid">
            <div
              v-for="filename in historyAvatars"
              :key="filename"
              class="history-avatar-item"
              :class="{ active: modelValue === filename }"
              @click="selectHistoryAvatar(filename)"
            >
              <Avatar
                :src="`appdata://llm-chat/${profileType === 'agent' ? 'agents' : 'user-profiles'}/${entityId}/${filename}`"
                :size="64"
                shape="square"
                :radius="8"
              />
              <div class="delete-overlay" @click="deleteHistoryAvatar(filename, $event)">
                <el-icon :size="14"><Close /></el-icon>
              </div>
              <div v-if="modelValue === filename" class="active-badge">当前</div>
            </div>
          </div>

          <div class="history-hint">点击选择头像，悬停显示删除按钮。删除操作不可恢复。</div>
        </div>
      </template>
    </BaseDialog>

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
  </div>
</template>

<style scoped>
.avatar-selector-root {
  width: 100%;
}

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

/* 历史头像对话框样式 */
.history-dialog-content {
  padding: 4px 0;
}

.loading-state,
.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.history-avatar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 12px;
}

.history-avatar-item {
  position: relative;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 10px;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4px;
  aspect-ratio: 1;
}

.history-avatar-item:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity, 1) * 0.08));
  border-color: var(--el-border-color-lighter);
}

.history-avatar-item.active {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity, 1) * 0.1));
}

/* 删除按钮覆盖层 */
.delete-overlay {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--el-color-danger);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.7);
  transition: all 0.2s ease;
  cursor: pointer;
  z-index: 2;
}

.history-avatar-item:hover .delete-overlay {
  opacity: 1;
  transform: scale(1);
}

.delete-overlay:hover {
  background-color: var(--el-color-danger-dark-2);
  transform: scale(1.1);
}

/* 当前使用标记 */
.active-badge {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--el-color-primary);
  color: #fff;
  white-space: nowrap;
  z-index: 2;
}

.history-hint {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
</style>
