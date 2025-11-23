<template>
  <div class="user-profile-settings-page">
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-state">
      <el-icon class="is-loading" :size="32">
        <RefreshLeft />
      </el-icon>
      <p>加载用户档案中...</p>
    </div>

    <div v-else class="settings-layout">
      <!-- 左侧：档案列表 -->
      <ProfileSidebar
        title="用户档案"
        :profiles="profiles"
        :selected-id="selectedProfileId"
        @select="selectProfile"
        @add="handleAddClick"
        @toggle="handleToggle"
      >
        <template #item="{ profile }">
          <Avatar
            :src="getAvatarSrc(profile) || ''"
            :alt="profile.name"
            :size="40"
            class="profile-icon"
          />
          <div class="profile-info">
            <div class="profile-name">{{ profile.name }}</div>
            <div class="profile-description" v-if="profile.content">
              {{ profile.content.length > 40 ? profile.content.substring(0, 40) + '...' : profile.content }}
            </div>
            <div class="profile-meta">
              创建于 {{ formatDate(profile.createdAt) }}
            </div>
          </div>
        </template>
      </ProfileSidebar>

      <!-- 右侧：档案编辑 -->
      <ProfileEditor
        v-if="selectedProfile"
        :title="selectedProfile.name"
        :show-save="false"
        @delete="handleDelete"
      >
        <template #header-actions>
          <Avatar
            v-if="editForm.icon"
            :src="getAvatarSrc(editForm) || ''"
            :alt="editForm.name"
            :size="32"
            class="profile-editor-icon"
          />
        </template>

        <UserProfileForm
          v-model="editForm"
          :profile-id="editForm.id"
          :show-upload="true"
          :show-clear="true"
          :show-metadata="true"
        />
      </ProfileEditor>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <p>请选择或创建一个用户档案</p>
      </div>
    </div>

    <!-- 创建用户档案对话框 -->
    <CreateUserProfileDialog
      :visible="showCreateDialog"
      @update:visible="showCreateDialog = $event"
      @create="handleCreateProfile"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { ElMessageBox } from "element-plus";
import { RefreshLeft } from '@element-plus/icons-vue';
import { customMessage } from "@/utils/customMessage";
import { useUserProfileStore } from "@/tools/llm-chat/userProfileStore";
import type { UserProfile } from "@/tools/llm-chat/types";
import Avatar from "@/components/common/Avatar.vue";
import ProfileSidebar from "../shared/ProfileSidebar.vue";
import ProfileEditor from "../shared/ProfileEditor.vue";
import CreateUserProfileDialog from "./components/CreateUserProfileDialog.vue";
import UserProfileForm from "./components/UserProfileForm.vue";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useResolvedAvatar } from '@/tools/llm-chat/composables/useResolvedAvatar';

const logger = createModuleLogger("UserProfileSettings");
const errorHandler = createModuleErrorHandler("UserProfileSettings");
const userProfileStore = useUserProfileStore();

// 加载状态
const isLoading = ref(true);

// 对话框状态
const showCreateDialog = ref(false);

// 防抖保存的计时器
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// 当前选中的档案
const selectedProfileId = ref<string | null>(null);

// 编辑表单
const editForm = ref<UserProfile>({
  id: "",
  name: "",
  icon: "",
  content: "",
  createdAt: "",
});

// 转换为 ProfileSidebar 所需的格式
const profiles = computed(() => {
  return userProfileStore.sortedProfiles.map((profile) => ({
    ...profile,
    enabled: profile.enabled ?? true, // 使用档案自己的启用状态，默认为 true
  }));
});

const getAvatarSrc = (profile: UserProfile) => {
  return useResolvedAvatar(ref(profile), 'user-profile').value;
};

// 计算当前选中的档案
const selectedProfile = computed(() => {
  if (!selectedProfileId.value) return null;
  return userProfileStore.profiles.find((p) => p.id === selectedProfileId.value) || null;
});

// 选择档案
const selectProfile = (profileId: string) => {
  selectedProfileId.value = profileId;
  const profile = userProfileStore.profiles.find((p) => p.id === profileId);
  if (profile) {
    editForm.value = JSON.parse(JSON.stringify(profile));
    if (!editForm.value.icon) {
      editForm.value.icon = "";
    }
  }
};

// 新建档案 - 显示创建对话框
const handleAddClick = () => {
  showCreateDialog.value = true;
};

// 处理创建档案
const handleCreateProfile = (data: { name: string; content: string; icon?: string }) => {
  const profileId = userProfileStore.createProfile(
    data.name,
    data.content,
    data.icon ? { icon: data.icon } : undefined
  );
  
  // 选中新创建的档案
  selectedProfileId.value = profileId;
  selectProfile(profileId);
  
  customMessage.success('档案创建成功');
};

// 保存档案（验证并保存）
const saveCurrentProfile = () => {
  if (!editForm.value.name.trim()) {
    customMessage.error("请输入档案名称");
    return false;
  }
  if (!editForm.value.content.trim()) {
    customMessage.error("请输入档案描述");
    return false;
  }

  // 检查是否是新档案
  const existingProfile = userProfileStore.profiles.find((p) => p.id === editForm.value.id);
  
  if (!existingProfile) {
    // 新档案：创建
    userProfileStore.createProfile(
      editForm.value.name.trim(),
      editForm.value.content.trim(),
      editForm.value.icon ? { icon: editForm.value.icon } : undefined
    );
  } else {
    // 现有档案：更新
    userProfileStore.updateProfile(editForm.value.id, {
      name: editForm.value.name.trim(),
      icon: editForm.value.icon?.trim() || undefined,
      content: editForm.value.content.trim(),
    });
  }
  
  return true;
};

// 防抖自动保存
const autoSave = () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    if (saveCurrentProfile()) {
      // 静默保存，不显示成功提示
    }
  }, 1000); // 1秒防抖
};

// 监听表单变化，自动保存
watch(
  () => editForm.value,
  () => {
    // 只有在选中了档案时才自动保存
    if (selectedProfileId.value) {
      autoSave();
    }
  },
  { deep: true }
);

// 删除档案
const handleDelete = async () => {
  if (!selectedProfile.value) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除用户档案 "${selectedProfile.value.name}" 吗？文件将移至系统回收站（除非回收站无法容纳）。`,
      "删除确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
    
    userProfileStore.deleteProfile(selectedProfile.value.id);
    selectedProfileId.value = userProfileStore.profiles[0]?.id || null;
    if (selectedProfileId.value) {
      selectProfile(selectedProfileId.value);
    }
    customMessage.success("删除成功");
  } catch {
    // 用户取消
  }
};

// 切换启用状态
const handleToggle = (profile: { id: string }) => {
  userProfileStore.toggleProfileEnabled(profile.id);
};

// 格式化日期（简短格式）
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "今天";
  } else if (days === 1) {
    return "昨天";
  } else if (days < 7) {
    return `${days} 天前`;
  } else {
    return date.toLocaleDateString("zh-CN");
  }
};


// 组件挂载时加载用户档案
onMounted(async () => {
  try {
    isLoading.value = true;
    logger.info('开始加载用户档案');
    
    await userProfileStore.loadProfiles();
    
    logger.info('用户档案加载完成', {
      profileCount: userProfileStore.profiles.length
    });
    
    // 如果有档案，自动选中第一个
    if (userProfileStore.profiles.length > 0 && !selectedProfileId.value) {
      selectedProfileId.value = userProfileStore.profiles[0].id;
      selectProfile(selectedProfileId.value);
    }
  } catch (error) {
    errorHandler.error(error, '加载用户档案失败');
  } finally {
    isLoading.value = false;
  }
});
</script>

<style scoped>
.user-profile-settings-page {
  flex: 1;
  display: flex;
  padding: 20px;
  box-sizing: border-box;
  min-height: 0;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-color-secondary);
}

.loading-state .el-icon {
  color: var(--primary-color);
}

.loading-state p {
  margin: 0;
  font-size: 14px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  flex: 1;
}

.profile-icon {
  flex-shrink: 0;
  border-radius: 4px;
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.profile-description {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.profile-meta {
  font-size: 11px;
  color: var(--text-color-tertiary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-editor-icon {
  border-radius: 4px;
  margin-right: 12px;
}

.empty-state {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  flex: 1;
}
</style>