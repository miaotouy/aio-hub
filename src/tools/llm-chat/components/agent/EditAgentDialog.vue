<script setup lang="ts">
import { reactive, watch } from "vue";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent, ChatMessageNode } from "../../types";
import AgentPresetEditor from "./AgentPresetEditor.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import Avatar from "@/components/common/Avatar.vue";
import { useUserProfileStore } from "../../userProfileStore";
import IconEditor from "@/components/common/IconEditor.vue";

interface Props {
  visible: boolean;
  mode: "create" | "edit";
  agent?: ChatAgent | null;
  initialData?: {
    name?: string;
    description?: string;
    icon?: string;
    profileId?: string;
    modelId?: string;
    presetMessages?: ChatMessageNode[];
  } | null;
}
interface Emits {
  (e: "update:visible", value: boolean): void;
  (
    e: "save",
    data: {
      name: string;
      description: string;
      icon: string;
      profileId: string;
      modelId: string;
      userProfileId: string | null;
      presetMessages: ChatMessageNode[];
      displayPresetCount: number;
      parameters: {
        temperature: number;
        maxTokens: number;
      };
    }
  ): void;
}

const props = withDefaults(defineProps<Props>(), {
  agent: null,
  initialData: null,
});

const emit = defineEmits<Emits>();

// 用户档案 Store
const userProfileStore = useUserProfileStore();

// 编辑表单
const editForm = reactive({
  name: "",
  description: "",
  icon: "🤖",
  profileId: "",
  modelId: "",
  modelCombo: "", // 用于 LlmModelSelector 的组合值 (profileId:modelId)
  userProfileId: null as string | null, // 绑定的用户档案 ID
  presetMessages: [] as ChatMessageNode[],
  displayPresetCount: 0, // 显示的预设消息数量
});

// 监听对话框打开，加载数据
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      loadFormData();
    }
  }
);

// 加载表单数据
const loadFormData = () => {
  if (props.mode === "edit" && props.agent) {
    // 编辑模式：加载现有智能体数据
    editForm.name = props.agent.name;
    editForm.description = props.agent.description || "";
    editForm.icon = props.agent.icon || "🤖";
    editForm.profileId = props.agent.profileId;
    editForm.modelId = props.agent.modelId;
    editForm.modelCombo = `${props.agent.profileId}:${props.agent.modelId}`;
    editForm.userProfileId = props.agent.userProfileId || null;
    editForm.presetMessages = props.agent.presetMessages
      ? JSON.parse(JSON.stringify(props.agent.presetMessages))
      : [];
    editForm.displayPresetCount = props.agent.displayPresetCount || 0;
  } else if (props.mode === "create" && props.initialData) {
    // 创建模式：使用初始数据
    editForm.name = props.initialData.name || "";
    editForm.description = props.initialData.description || "";
    editForm.icon = props.initialData.icon || "🤖";
    editForm.profileId = props.initialData.profileId || "";
    editForm.modelId = props.initialData.modelId || "";
    editForm.modelCombo =
      props.initialData.profileId && props.initialData.modelId
        ? `${props.initialData.profileId}:${props.initialData.modelId}`
        : "";
    editForm.userProfileId = null;
    editForm.presetMessages = props.initialData.presetMessages
      ? JSON.parse(JSON.stringify(props.initialData.presetMessages))
      : [];
    editForm.displayPresetCount = 0;
  }
};

// 监听 modelCombo 的变化，拆分为 profileId 和 modelId
const handleModelComboChange = (value: string) => {
  if (value) {
    const [profileId, modelId] = value.split(":");
    editForm.profileId = profileId;
    editForm.modelId = modelId;
    editForm.modelCombo = value;
  }
};

// 关闭对话框
const handleClose = () => {
  emit("update:visible", false);
};

// 保存智能体
const handleSave = () => {
  if (!editForm.name.trim()) {
    customMessage.warning("智能体名称不能为空");
    return;
  }

  if (!editForm.profileId || !editForm.modelId) {
    customMessage.warning("请选择模型");
    return;
  }

  // 触发保存事件
  // 参数保留原有值（编辑模式）或使用默认值（创建模式）
  const parameters =
    props.mode === "edit" && props.agent
      ? props.agent.parameters
      : { temperature: 0.7, maxTokens: 4096 };

  emit("save", {
    name: editForm.name,
    description: editForm.description,
    icon: editForm.icon,
    profileId: editForm.profileId,
    modelId: editForm.modelId,
    userProfileId: editForm.userProfileId,
    presetMessages: editForm.presetMessages,
    displayPresetCount: editForm.displayPresetCount,
    parameters,
  });

  handleClose();
};

// 根据 profile.icon 解析最终的头像路径
const getAvatarSrcForUserProfile = (profile: { id: string; icon?: string }) => {
  const icon = profile.icon?.trim();
  if (!icon) return "👤";

  // 如果 icon 看起来像一个文件名（包含.且不含/或\），则拼接路径
  if (icon.includes(".") && !icon.includes("/") && !icon.includes("\\")) {
    return `appdata://llm-chat/user-profiles/${profile.id}/${icon}`;
  }

  // 否则，直接返回原始值（可能是完整路径、emoji等）
  return icon;
};
</script>
<template>
  <BaseDialog
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    :title="mode === 'edit' ? '编辑智能体' : '创建智能体'"
    width="80%"
    height="85vh"
    :close-on-backdrop-click="false"
  >
    <el-form :model="editForm" label-width="100px" label-position="left">
      <!-- 基本信息 -->
      <el-form-item label="名称" required>
        <el-input v-model="editForm.name" placeholder="输入智能体名称" />
      </el-form-item>

      <el-form-item label="图标">
        <IconEditor
          v-model="editForm.icon"
          :mode="mode === 'edit' ? 'upload' : 'path'"
          :entity-id="agent?.id"
          profile-type="agent"
        />
        <div v-if="mode === 'create'" class="form-hint">
          创建后可在编辑页面为智能体上传专属头像
        </div>
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          v-model="editForm.description"
          type="textarea"
          :rows="2"
          placeholder="智能体的简短描述..."
        />
      </el-form-item>

      <!-- 模型选择 -->
      <el-form-item label="模型" required>
        <LlmModelSelector
          v-model="editForm.modelCombo"
          @update:model-value="handleModelComboChange"
        />
      </el-form-item>

      <!-- 用户档案绑定 -->
      <el-form-item label="用户档案">
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
                :src="getAvatarSrcForUserProfile(profile)"
                :alt="profile.name"
                :size="20"
                shape="square"
                :radius="4"
              />
              <span>{{ profile.name }}</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-hint">如果设置，则覆盖全局默认的用户档案</div>
      </el-form-item>

      <!-- 显示预设消息数量 -->
      <el-form-item label="显示数量">
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
    </el-form>
    <!-- 预设消息编辑器 -->
    <el-form-item label="预设消息">
      <AgentPresetEditor
        v-model="editForm.presetMessages"
        :model-id="editForm.modelId"
        :agent-name="editForm.name"
        height="300px"
      />
    </el-form-item>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave">
        {{ mode === "edit" ? "保存" : "创建" }}
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 8px;
}

/* 滑块+数字输入框组合 */
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
