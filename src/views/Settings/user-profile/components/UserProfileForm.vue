<template>
  <el-form
    :model="formData"
    label-width="80px"
    label-position="left"
    require-asterisk-position="right"
  >
    <el-form-item label="ID/名称" :required="required">
      <el-input
        v-model="formData.name"
        placeholder="例如: user1"
        maxlength="50"
        show-word-limit
        @input="handleInput"
      />
      <div class="form-hint" v-pre>
        此名称将作为宏替换的 ID（如 {{ user }}），请使用简洁的名称。
      </div>
    </el-form-item>

    <el-form-item label="显示名称">
      <el-input
        v-model="formData.displayName"
        placeholder="例如: 魔法少年（可选）"
        maxlength="50"
        show-word-limit
        @input="handleInput"
      />
      <div class="form-hint">在界面上显示的名称。如果不填，则显示上面的 ID/名称。</div>
    </el-form-item>

    <el-form-item label="头像">
      <AvatarSelector
        :model-value="formData.icon || ''"
        :avatar-history="formData.avatarHistory"
        :entity-id="profileId"
        profile-type="user"
        :name-for-fallback="formData.name"
        @update:model-value="handleIconUpdate"
        @update:avatar-history="handleHistoryUpdate"
      />
      <div class="form-hint">上传的头像将与该档案绑定存储，删除档案时会一并清除。</div>
    </el-form-item>

    <el-form-item label="描述" :required="required">
      <el-input
        v-model="formData.content"
        type="textarea"
        :rows="descriptionRows"
        placeholder="请输入用户角色描述，如：我是一个资深魔法少年，来自xxxx家族..."
        maxlength="20000"
        show-word-limit
        @input="handleInput"
      />
      <div class="form-hint">此描述将作为用户角色在对话中的身份信息</div>
    </el-form-item>

    <el-form-item label="关联世界书">
      <WorldbookSelector
        :model-value="formData.worldbookIds || []"
        @update:model-value="
          (val) => {
            formData.worldbookIds = val;
            handleInput();
          }
        "
      />
      <div class="form-hint-with-action">
        <span>关联世界书后，当对话中出现关键字时，将自动注入对应设定。</span>
        <el-button type="primary" link @click="worldbookManagerVisible = true">
          管理世界书
        </el-button>
      </div>
    </el-form-item>

    <el-form-item label="快捷操作">
      <QuickActionSelector
        :model-value="formData.quickActionSetIds || []"
        @update:model-value="
          (val) => {
            formData.quickActionSetIds = val;
            handleInput();
          }
        "
      />
      <div class="form-hint-with-action">
        <span>关联的快捷操作组将在此 Profile 激活时显示在输入框工具栏。</span>
        <el-button type="primary" link @click="quickActionManagerVisible = true">
          管理快捷操作
        </el-button>
      </div>
    </el-form-item>

    <el-divider />

    <el-form-item label="消息样式">
      <el-radio-group v-model="formData.richTextStyleBehavior" @change="handleBehaviorChange">
        <el-radio-button value="follow_agent">跟随智能体</el-radio-button>
        <el-radio-button value="custom">自定义</el-radio-button>
      </el-radio-group>
    </el-form-item>

    <div v-if="formData.richTextStyleBehavior === 'custom'" class="style-editor-container">
      <Suspense>
        <template #default>
          <MarkdownStyleEditor
            :model-value="formData.richTextStyleOptions || {}"
            :loading="styleLoading"
            @update:model-value="
              (val) => {
                formData.richTextStyleOptions = val;
                handleInput();
              }
            "
          />
        </template>
        <template #fallback>
          <div class="editor-placeholder">
            <el-skeleton animated>
              <template #template>
                <div style="margin-bottom: 20px">
                  <el-skeleton-item variant="text" style="width: 30%" />
                </div>
                <el-skeleton-item variant="rect" style="height: 200px" />
              </template>
            </el-skeleton>
          </div>
        </template>
      </Suspense>
    </div>

    <el-divider />

    <el-collapse>
      <el-collapse-item title="文本替换规则" name="regexConfig">
        <ChatRegexEditor v-model="formData.regexConfig" @update:model-value="handleInput" />
      </el-collapse-item>
    </el-collapse>

    <!-- 可选的元数据显示 -->
    <template v-if="showMetadata">
      <el-divider />

      <el-form-item label="创建时间">
        <div class="info-text">{{ formatDateTime(formData.createdAt) }}</div>
      </el-form-item>

      <el-form-item v-if="formData.lastUsedAt" label="最后使用">
        <div class="info-text">{{ formatDateTime(formData.lastUsedAt) }}</div>
      </el-form-item>
    </template>
  </el-form>

  <!-- 世界书管理弹窗 -->
  <WorldbookManagerDialog v-model:visible="worldbookManagerVisible" />

  <!-- 快捷操作管理弹窗 -->
  <QuickActionManagerDialog v-model:visible="quickActionManagerVisible" />
</template>

<script setup lang="ts">
import { ref, watch, defineAsyncComponent } from "vue";
import AvatarSelector from "@/components/common/AvatarSelector.vue";
import WorldbookSelector from "@/tools/llm-chat/components/worldbook/WorldbookSelector.vue";
import QuickActionSelector from "@/tools/llm-chat/components/quick-action/QuickActionSelector.vue";
import type { RichTextRendererStyleOptions } from "@/tools/rich-text-renderer/types";
import type { ChatRegexConfig } from "@/tools/llm-chat/types";

const MarkdownStyleEditor = defineAsyncComponent(
  () => import("@/tools/rich-text-renderer/components/style-editor/MarkdownStyleEditor.vue")
);
const ChatRegexEditor = defineAsyncComponent(
  () => import("@/tools/llm-chat/components/common/ChatRegexEditor.vue")
);
const WorldbookManagerDialog = defineAsyncComponent(
  () => import("@/tools/llm-chat/components/worldbook/WorldbookManagerDialog.vue")
);
const QuickActionManagerDialog = defineAsyncComponent(
  () => import("@/tools/llm-chat/components/quick-action/QuickActionManagerDialog.vue")
);

interface UserProfileFormData {
  id?: string; // 允许ID传入
  name: string;
  displayName?: string;
  icon?: string;
  avatarHistory?: string[];
  content: string;
  createdAt?: string;
  lastUsedAt?: string;
  richTextStyleOptions?: RichTextRendererStyleOptions;
  richTextStyleBehavior?: "follow_agent" | "custom";
  regexConfig?: ChatRegexConfig;
  worldbookIds?: string[];
  quickActionSetIds?: string[];
}

interface Props {
  /** 表单数据 */
  modelValue: UserProfileFormData;
  /** 档案ID，用于上传头像等操作 */
  profileId?: string;
  /** 是否显示上传按钮 */
  showUpload?: boolean;
  /** 是否显示清除按钮 */
  showClear?: boolean;
  /** 是否显示元数据（创建时间等） */
  showMetadata?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** 描述框行数 */
  descriptionRows?: number;
  /** 图标输入框提示文本 */
  iconPlaceholder?: string;
  /** 图标输入框提示信息 */
  iconHint?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showUpload: true,
  showClear: false,
  showMetadata: false,
  required: false,
  descriptionRows: 12,
  iconPlaceholder: "输入 emoji、路径或选择图像（可选）",
  iconHint: "可以输入 emoji、从预设选择、上传图像或输入绝对路径",
  profileId: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [value: UserProfileFormData];
}>();

// 内部表单数据
const formData = ref<UserProfileFormData>({
  ...props.modelValue,
  avatarHistory: props.modelValue.avatarHistory || [],
  richTextStyleBehavior: props.modelValue.richTextStyleBehavior || "follow_agent",
  richTextStyleOptions: props.modelValue.richTextStyleOptions || {},
  regexConfig: props.modelValue.regexConfig || { presets: [] },
  worldbookIds: props.modelValue.worldbookIds || [],
  quickActionSetIds: props.modelValue.quickActionSetIds || [],
});

const styleLoading = ref(false);
const worldbookManagerVisible = ref(false);
const quickActionManagerVisible = ref(false);

// 监听外部数据变化
watch(
  () => props.modelValue,
  (newValue) => {
    formData.value = {
      ...newValue,
      richTextStyleBehavior: newValue.richTextStyleBehavior || "follow_agent",
      richTextStyleOptions: newValue.richTextStyleOptions || {},
      regexConfig: newValue.regexConfig || { presets: [] },
      worldbookIds: newValue.worldbookIds || [],
      quickActionSetIds: newValue.quickActionSetIds || [],
    };
  },
  { deep: true }
);

// 处理输入变化
const handleInput = () => {
  emit("update:modelValue", { ...formData.value });
};

// 处理样式行为切换
const handleBehaviorChange = (val: string | number | boolean | undefined) => {
  if (val === "custom") {
    styleLoading.value = true;
    // 模拟数据加载延迟，给予骨架屏展示时间，提升体验
    setTimeout(() => {
      styleLoading.value = false;
    }, 500);
  }
  handleInput();
};

const handleIconUpdate = (value: string) => {
  formData.value.icon = value;
  handleInput();
};

const handleHistoryUpdate = (newHistory: string[]) => {
  formData.value.avatarHistory = newHistory;
  handleInput();
};

// 格式化日期时间（完整格式）
const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN");
};
</script>

<style scoped>
/* 表单提示 */
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

/* 信息文本 */
.info-text {
  font-size: 14px;
  color: var(--text-color);
}

.style-editor-container {
  margin-left: 80px; /* 与 el-form-item 的 label-width 对齐 */
  margin-bottom: 18px; /* 与 el-form-item 的默认 margin-bottom 对齐 */
  height: 700px;
}
</style>
