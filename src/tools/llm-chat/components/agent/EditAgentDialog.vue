<script setup lang="ts">
import { reactive, watch } from "vue";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent, ChatMessageNode, IconMode } from "../../types";
import type { IconUpdatePayload } from "@/components/common/AvatarEditor.vue";
import AgentPresetEditor from "./AgentPresetEditor.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import Avatar from "@/components/common/Avatar.vue";
import { useUserProfileStore } from "../../userProfileStore";
import AvatarEditor from "@/components/common/AvatarEditor.vue";
import { useResolvedAvatar } from "../../composables/useResolvedAvatar";
import { ref } from "vue";
import LlmThinkRulesEditor from "@/tools/rich-text-renderer/components/LlmThinkRulesEditor.vue";
import MarkdownStyleEditor from "@/tools/rich-text-renderer/components/style-editor/MarkdownStyleEditor.vue";
import type { LlmThinkRule, RichTextRendererStyleOptions } from "@/tools/rich-text-renderer/types";

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
      iconMode: IconMode;
      profileId: string;
      modelId: string;
      userProfileId: string | null;
      presetMessages: ChatMessageNode[];
      displayPresetCount: number;
      parameters: {
        temperature: number;
        maxTokens: number;
      };
      llmThinkRules: LlmThinkRule[];
      richTextStyleOptions: RichTextRendererStyleOptions;
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
  icon: "",
  iconMode: "path" as IconMode,
  profileId: "",
  modelId: "",
  modelCombo: "", // 用于 LlmModelSelector 的组合值 (profileId:modelId)
  userProfileId: null as string | null, // 绑定的用户档案 ID
  presetMessages: [] as ChatMessageNode[],
  displayPresetCount: 0, // 显示的预设消息数量
  llmThinkRules: [] as LlmThinkRule[], // LLM 思考块规则配置
  richTextStyleOptions: {} as RichTextRendererStyleOptions, // 富文本样式配置
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
    editForm.icon = props.agent.icon || "";
    editForm.iconMode = props.agent.iconMode || "path";
    editForm.profileId = props.agent.profileId;
    editForm.modelId = props.agent.modelId;
    editForm.modelCombo = `${props.agent.profileId}:${props.agent.modelId}`;
    editForm.userProfileId = props.agent.userProfileId || null;
    editForm.presetMessages = props.agent.presetMessages
      ? JSON.parse(JSON.stringify(props.agent.presetMessages))
      : [];
    editForm.displayPresetCount = props.agent.displayPresetCount || 0;
    editForm.llmThinkRules = props.agent.llmThinkRules
      ? JSON.parse(JSON.stringify(props.agent.llmThinkRules))
      : [];
    editForm.richTextStyleOptions = props.agent.richTextStyleOptions
      ? JSON.parse(JSON.stringify(props.agent.richTextStyleOptions))
      : {};
  } else if (props.mode === "create" && props.initialData) {
    // 创建模式：使用初始数据
    editForm.name = props.initialData.name || "";
    editForm.description = props.initialData.description || "";
    editForm.icon = props.initialData.icon || "";
    editForm.iconMode = "path"; // 创建模式总是 path
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
    editForm.llmThinkRules = [];
    editForm.richTextStyleOptions = {};
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
const handleIconUpdate = (payload: IconUpdatePayload) => {
  editForm.icon = payload.value;
  if (payload.source === "upload") {
    editForm.iconMode = "builtin";
  } else {
    // input, preset, clear 都应视为 path 模式
    editForm.iconMode = "path";
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
    iconMode: editForm.iconMode,
    profileId: editForm.profileId,
    modelId: editForm.modelId,
    userProfileId: editForm.userProfileId,
    presetMessages: editForm.presetMessages,
    displayPresetCount: editForm.displayPresetCount,
    parameters,
    llmThinkRules: editForm.llmThinkRules,
    richTextStyleOptions: editForm.richTextStyleOptions,
  });

  handleClose();
};
</script>
<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="mode === 'edit' ? '编辑智能体' : '创建智能体'"
    width="80%"
    height="85vh"
  >
    <el-form :model="editForm" label-width="100px" label-position="left">
      <!-- 基本信息 -->
      <el-form-item label="名称" required>
        <el-input v-model="editForm.name" placeholder="输入智能体名称" />
      </el-form-item>

      <el-form-item label="图标">
        <AvatarEditor
          :model-value="editForm.icon"
          @update:icon="handleIconUpdate"
          :mode="editForm.iconMode === 'builtin' ? 'upload' : 'path'"
          :entity-id="agent?.id"
          profile-type="agent"
          show-mode-switch
          :name-for-fallback="editForm.name"
          @update:mode="
            (newMode) => {
              editForm.iconMode = newMode === 'upload' ? 'builtin' : 'path';
            }
          "
        />
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
                :src="useResolvedAvatar(ref(profile), 'user-profile').value || ''"
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

      <!-- 预设消息编辑器 -->
      <el-form-item label="预设消息">
        <AgentPresetEditor
          v-model="editForm.presetMessages"
          :model-id="editForm.modelId"
          :agent-name="editForm.name"
          height="300px"
        />
      </el-form-item>

      <!-- 思考块规则配置 -->
      <el-form-item label="思考块规则">
        <div style="width: 100%">
          <div class="form-hint">
            配置 LLM 输出中的思考过程识别规则（如 Chain of Thought），用于在对话中折叠显示思考内容。
          </div>
          <LlmThinkRulesEditor v-model="editForm.llmThinkRules" />
        </div>
      </el-form-item>

      <!-- 样式自定义 -->
      <el-form-item label="回复样式">
        <div style="width: 100%">
          <div class="form-hint">
            自定义该智能体回复内容的 Markdown 渲染样式（如粗体颜色、发光效果等）。
          </div>
          <MarkdownStyleEditor v-model="editForm.richTextStyleOptions" />
        </div>
      </el-form-item>
    </el-form>

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
  margin-bottom: 8px;
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
