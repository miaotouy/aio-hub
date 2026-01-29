<script setup lang="ts">
import { inject, computed, ref, defineAsyncComponent } from "vue";
import AgentPresetEditor from "../../AgentPresetEditor.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import WorldbookSelector from "../../../worldbook/WorldbookSelector.vue";
import QuickActionSelector from "../../../quick-action/QuickActionSelector.vue";
import { MagicStick } from "@element-plus/icons-vue";
import Avatar from "@/components/common/Avatar.vue";
import { useUserProfileStore } from "../../../../stores/userProfileStore";
import { resolveAvatarPath } from "../../../../composables/ui/useResolvedAvatar";

const QuickActionManagerDialog = defineAsyncComponent(
  () => import("../../../quick-action/QuickActionManagerDialog.vue")
);

const editForm = inject<any>("agent-edit-form");
const userProfileStore = useUserProfileStore();
const quickActionManagerVisible = ref(false);

// 通过 inject 获取父组件的状态控制
const userProfileDialogVisible = inject<any>("user-profile-dialog-visible");
const worldbookManagerVisible = inject<any>("worldbook-manager-visible");

// 预计算用户档案的头像路径
const profileAvatars = computed(() => {
  const avatars: Record<string, string> = {};
  for (const profile of userProfileStore.enabledProfiles) {
    if (profile.icon) {
      avatars[profile.id] = resolveAvatarPath(profile, "user-profile") || "";
    }
  }
  return avatars;
});

const handleOpenUserProfileManager = () => {
  if (userProfileDialogVisible) userProfileDialogVisible.value = true;
};

const handleOpenWorldbookManager = () => {
  if (worldbookManagerVisible) worldbookManagerVisible.value = true;
};

const handleModelComboChange = (value: string) => {
  if (value) {
    const firstColonIndex = value.indexOf(":");
    const profileId = value.substring(0, firstColonIndex);
    const modelId = value.substring(firstColonIndex + 1);
    editForm.profileId = profileId;
    editForm.modelId = modelId;
    editForm.modelCombo = value;
  }
};
</script>

<template>
  <div class="agent-section">
    <!-- 模型选择 -->
    <el-form-item label="模型" required data-setting-id="model">
      <LlmModelSelector
        v-model="editForm.modelCombo"
        @update:model-value="handleModelComboChange"
      />
    </el-form-item>

    <!-- 用户档案绑定 -->
    <el-form-item label="关联用户档案" data-setting-id="userProfile">
      <el-select
        v-model="editForm.userProfileId"
        placeholder="选择用户档案（可选）"
        clearable
        style="width: 100%"
      >
        <el-option value="" label="无（使用全局设置）" />
        <el-option
          v-for="profile in userProfileStore.enabledProfiles"
          :key="profile.id"
          :value="profile.id"
          :label="profile.name"
        >
          <div style="display: flex; align-items: center; gap: 8px">
            <Avatar
              v-if="profile.icon"
              :src="profileAvatars[profile.id]"
              :alt="profile.name"
              :size="20"
              shape="square"
              :radius="4"
            />
            <span>{{ profile.name }}</span>
          </div>
        </el-option>
      </el-select>
      <div class="form-hint-with-action">
        <span>如果设置，则覆盖全局默认的用户档案</span>
        <el-button type="primary" link @click="handleOpenUserProfileManager">
          管理用户档案
        </el-button>
      </div>
    </el-form-item>

    <!-- 快捷操作绑定 -->
    <el-form-item label="快捷操作" data-setting-id="quickActionSetIds">
      <QuickActionSelector v-model="editForm.quickActionSetIds" />
      <div class="form-hint-with-action">
        <span>关联的快捷操作组将在此智能体激活时显示在输入框工具栏。</span>
        <el-button type="primary" link @click="quickActionManagerVisible = true">
          管理快捷操作
        </el-button>
      </div>
    </el-form-item>

    <!-- 世界书绑定 -->
    <el-form-item label="关联世界书" data-setting-id="worldbook">
      <div style="width: 100%">
        <WorldbookSelector v-model="editForm.worldbookIds" />
        <div class="form-hint-with-action">
          <span>关联世界书后，当对话中匹配到关键字时，将自动注入相关设定。</span>
          <el-button type="primary" link @click="handleOpenWorldbookManager">
            管理世界书
          </el-button>
        </div>

        <!-- 世界书覆盖设置 -->
        <div class="worldbook-settings-trigger" style="margin-top: 12px">
          <el-popover placement="bottom-start" :width="320" trigger="click">
            <template #reference>
              <el-button size="small" :icon="MagicStick" plain>世界书高级设置</el-button>
            </template>
            <div class="worldbook-settings-form">
              <div style="font-weight: bold; margin-bottom: 12px; font-size: 14px">
                世界书扫描与注入设置
              </div>
              <el-form label-width="120px" size="small" label-position="left">
                <el-form-item label="禁用递归扫描">
                  <el-switch v-model="editForm.worldbookSettings.disableRecursion" />
                </el-form-item>
                <el-form-item label="默认扫描深度">
                  <el-input-number
                    v-model="editForm.worldbookSettings.defaultScanDepth"
                    :min="0"
                    :max="100"
                    :step="1"
                    controls-position="right"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-form>
              <div class="form-hint" style="margin-top: 8px; color: var(--el-color-info)">
                注：这里的设置将覆盖全局默认值。扫描深度决定了回溯多少条历史消息进行关键词匹配。
              </div>
            </div>
          </el-popover>
        </div>
      </div>
    </el-form-item>

    <!-- 显示预设消息数量 -->
    <el-form-item label="显示数量" data-setting-id="displayPresetCount">
      <div class="slider-input-group">
        <el-slider
          v-model="editForm.displayPresetCount"
          :min="0"
          :max="16"
          :step="1"
          :show-tooltip="false"
        />
        <el-input-number
          v-model="editForm.displayPresetCount"
          :min="0"
          :max="16"
          :step="1"
          controls-position="right"
        />
      </div>
      <div class="form-hint">
        在聊天界面显示的预设消息数量（0 表示不显示）。这些消息会作为开场白显示在聊天列表顶部。
      </div>
    </el-form-item>

    <!-- 预设消息编辑器 -->
    <el-form-item label="预设消息" data-setting-id="presetMessages">
      <AgentPresetEditor
        v-model="editForm.presetMessages"
        :model-id="editForm.modelId"
        :agent-name="editForm.name"
        :agent="editForm"
        height="300px"
      />
    </el-form-item>

    <QuickActionManagerDialog v-model:visible="quickActionManagerVisible" />
  </div>
</template>

<style scoped>
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}
.form-hint-with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}
.slider-input-group {
  display: flex;
  gap: 16px;
  align-items: center;
  width: 100%;
}
.slider-input-group .el-slider {
  flex: 1;
}
.slider-input-group .el-input-number {
  width: 120px;
}
</style>
