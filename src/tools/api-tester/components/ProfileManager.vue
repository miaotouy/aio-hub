<template>
  <BaseDialog v-model:visible="isDialogVisible" title="配置管理" @close="emit('close')">
    <div class="profile-manager">
      <div class="profile-save">
        <h4>保存当前配置</h4>
        <el-input
          v-model="newProfileName"
          placeholder="输入配置名称"
          @keyup.enter="handleSaveProfile"
        >
          <template #append>
            <el-button @click="handleSaveProfile" :icon="DocumentAdd">保存</el-button>
          </template>
        </el-input>
      </div>

      <div class="profile-list">
        <h4>已保存的配置</h4>
        <el-scrollbar max-height="40vh">
          <div v-if="store.savedProfiles.length === 0" class="empty-list">
            <el-empty description="暂无保存的配置" :image-size="80" />
          </div>
          <div v-else>
            <div v-for="profile in store.savedProfiles" :key="profile.id" class="profile-item">
              <div class="profile-info">
                <strong>{{ profile.name }}</strong>
                <span class="profile-preset">{{ getPresetName(profile.selectedPresetId) }}</span>
              </div>
              <div class="profile-actions">
                <el-button @click="handleLoadProfile(profile.id)" :icon="Download" plain>
                  加载
                </el-button>
                <el-button
                  @click="handleDeleteProfile(profile.id)"
                  type="danger"
                  :icon="Delete"
                  plain
                >
                  删除
                </el-button>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useApiTesterStore } from "../store";
import BaseDialog from "@components/common/BaseDialog.vue";
import { ElInput, ElButton, ElScrollbar, ElEmpty, ElMessageBox } from "element-plus";
import { DocumentAdd, Download, Delete } from "@element-plus/icons-vue";
import { customMessage } from "@utils/customMessage";

const emit = defineEmits<{
  close: [];
}>();

const store = useApiTesterStore();
const newProfileName = ref("");
const isDialogVisible = ref(true);

function handleSaveProfile() {
  if (!newProfileName.value.trim()) {
    customMessage.warning("请输入配置名称");
    return;
  }
  if (!store.selectedPreset) {
    customMessage.error("没有可保存的预设，请先选择一个预设");
    return;
  }
  store.saveProfile(newProfileName.value.trim());
  newProfileName.value = "";
  customMessage.success("配置已保存");
}

function handleLoadProfile(profileId: string) {
  store.loadProfile(profileId);
  emit("close");
}

function handleDeleteProfile(profileId: string) {
  ElMessageBox.confirm("确定要删除这个配置吗？此操作不可撤销。", "确认删除", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      store.deleteProfile(profileId);
      customMessage.success("配置已删除");
    })
    .catch(() => {
      // 用户取消
    });
}

function getPresetName(presetId: string): string {
  const preset = store.availablePresets.find((p) => p.id === presetId);
  return preset?.name || presetId;
}
</script>

<style scoped>
.profile-manager {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.profile-save h4,
.profile-list h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: var(--text-color);
}

.profile-list {
  border-top: 1px solid var(--border-color);
  padding-top: 24px;
}

.empty-list {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.profile-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  margin-bottom: 10px;
  transition: all 0.2s;
}

.profile-item:hover {
  border-color: var(--primary-color);
  box-shadow: var(--el-box-shadow-light);
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-info strong {
  color: var(--text-color);
  font-weight: 500;
}

.profile-preset {
  font-size: 13px;
  color: var(--text-color-light);
  background: var(--input-bg);
  padding: 2px 6px;
  border-radius: 4px;
  align-self: flex-start;
}

.profile-actions {
  display: flex;
  gap: 8px;
}
</style>
