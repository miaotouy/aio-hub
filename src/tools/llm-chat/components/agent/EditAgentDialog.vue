<script setup lang="ts">
import { reactive, watch, computed, onUnmounted } from "vue";
import { customMessage } from "@/utils/customMessage";
import { useAgentStore } from "../../agentStore";
import type { ChatAgent, ChatMessageNode, AgentEditData } from "../../types";
import type { IconUpdatePayload } from "@/components/common/AvatarSelector.vue";
import AgentPresetEditor from "./AgentPresetEditor.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import Avatar from "@/components/common/Avatar.vue";
import { useUserProfileStore } from "../../userProfileStore";
import AvatarSelector from "@/components/common/AvatarSelector.vue";
import { useResolvedAvatar } from "../../composables/useResolvedAvatar";
import { ref, defineAsyncComponent } from "vue";
import { MacroProcessor } from "../../macro-engine/MacroProcessor";
import MacroSelector from "./MacroSelector.vue";
import type { MacroDefinition } from "../../macro-engine";
import { MagicStick } from "@element-plus/icons-vue";

const LlmThinkRulesEditor = defineAsyncComponent(
  () => import("@/tools/rich-text-renderer/components/LlmThinkRulesEditor.vue")
);
const MarkdownStyleEditor = defineAsyncComponent(
  () => import("@/tools/rich-text-renderer/components/style-editor/MarkdownStyleEditor.vue")
);
import type { LlmThinkRule, RichTextRendererStyleOptions } from "@/tools/rich-text-renderer/types";
import { createDefaultChatRegexConfig } from "../../types";

const ChatRegexEditor = defineAsyncComponent(() => import("../common/ChatRegexEditor.vue"));

interface Props {
  visible: boolean;
  mode: "create" | "edit";
  agent?: ChatAgent | null;
  initialData?: Partial<AgentEditData> | null;
}
interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", data: AgentEditData): void;
}

const props = withDefaults(defineProps<Props>(), {
  agent: null,
  initialData: null,
});

const emit = defineEmits<Emits>();

// 用户档案 Store
const userProfileStore = useUserProfileStore();
const agentStore = useAgentStore();

// 从所有 agent 中提取的不重复标签列表
const allTags = computed(() => {
  const tagSet = new Set<string>();
  agentStore.agents.forEach((agent) => {
    agent.tags?.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet);
});

// 定义表单默认值
const defaultFormState = {
  name: "",
  displayName: "",
  description: "",
  icon: "",
  profileId: "",
  modelId: "",
  modelCombo: "", // 用于 LlmModelSelector 的组合值 (profileId:modelId)
  userProfileId: null as string | null, // 绑定的用户档案 ID
  presetMessages: [] as ChatMessageNode[],
  displayPresetCount: 0, // 显示的预设消息数量
  llmThinkRules: [] as LlmThinkRule[], // LLM 思考块规则配置
  richTextStyleOptions: {} as RichTextRendererStyleOptions, // 富文本样式配置
  regexConfig: createDefaultChatRegexConfig(), // 正则管道配置
  tags: [] as string[],
  category: "",
  virtualTimeConfig: {
    virtualBaseTime: new Date().toISOString(),
    realBaseTime: new Date().toISOString(),
    timeScale: 1.0,
  },
};

// 编辑表单
const editForm = reactive(JSON.parse(JSON.stringify(defaultFormState)));

const virtualTimeEnabled = ref(false);
const activeCollapseNames = ref<string[]>([]);
const thinkRulesLoaded = ref(false);
const styleOptionsLoaded = ref(false);
const styleLoading = ref(false);

// 宏选择器弹窗状态
const macroSelectorVisible = ref(false);

// 虚拟时间预览相关
const macroPreviewInput = ref("{{time}} | {{datetime_cn}} | {{shichen}}");
const macroPreviewResult = ref("");
let previewTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 解析宏字符串并返回结果
 */
const parseMacroPreview = async (input: string): Promise<string> => {
  if (!input.trim()) return "";

  // 构建额外上下文，包含当前表单中的虚拟时间配置
  const extraContext = {
    agent:
      virtualTimeEnabled.value && editForm.virtualTimeConfig
        ? ({
            virtualTimeConfig: {
              virtualBaseTime: editForm.virtualTimeConfig.virtualBaseTime,
              realBaseTime: editForm.virtualTimeConfig.realBaseTime,
              timeScale: editForm.virtualTimeConfig.timeScale,
            },
          } as ChatAgent)
        : undefined,
  };

  // 匹配所有宏 {{macroName}} 或 {{macroName::arg1::arg2}}
  const macroPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?:::([^}]*))?\}\}/g;
  let result = input;

  // 收集所有匹配项
  const matches = Array.from(input.matchAll(macroPattern));

  // 使用 Map 缓存结果，避免重复计算
  const replacements = new Map<string, string>();

  for (const match of matches) {
    const fullMatch = match[0];
    const macroName = match[1];
    const argsStr = match[2];
    const args = argsStr ? argsStr.split("::") : undefined;

    if (replacements.has(fullMatch)) continue;

    try {
      // 使用 executeDirectly 执行宏
      const value = await MacroProcessor.executeDirectly(macroName, args, extraContext);
      if (value !== null) {
        replacements.set(fullMatch, value);
      } else {
        replacements.set(fullMatch, `[无效宏: ${macroName}]`);
      }
    } catch (e) {
      replacements.set(fullMatch, `[错误: ${macroName}]`);
    }
  }

  // 替换所有宏
  for (const [key, value] of replacements) {
    // 使用 replaceAll 替换所有出现的相同宏
    result = result.split(key).join(value);
  }

  return result;
};

/**
 * 更新宏预览结果
 */
const updateMacroPreview = async () => {
  macroPreviewResult.value = await parseMacroPreview(macroPreviewInput.value);
};

/**
 * 启动预览定时器
 */
const startPreviewTimer = () => {
  stopPreviewTimer();
  updateMacroPreview();
  previewTimer = setInterval(updateMacroPreview, 1000);
};

/**
 * 停止预览定时器
 */
const stopPreviewTimer = () => {
  if (previewTimer) {
    clearInterval(previewTimer);
    previewTimer = null;
  }
};

// 决定预览定时器是否应该运行
const shouldTimerBeRunning = computed(
  () => virtualTimeEnabled.value && activeCollapseNames.value.includes("virtualTime")
);

// 监听所有相关依赖，统一控制定时器
watch(
  () => [
    shouldTimerBeRunning.value,
    editForm.virtualTimeConfig?.virtualBaseTime,
    editForm.virtualTimeConfig?.realBaseTime,
    editForm.virtualTimeConfig?.timeScale,
    macroPreviewInput.value,
  ],
  ([isRunning]) => {
    if (isRunning) {
      // 当任何依赖变化且定时器应该运行时，（重新）启动定时器
      startPreviewTimer();
    } else {
      // 否则，停止定时器
      stopPreviewTimer();
    }
  },
  { deep: true }
);

// 组件卸载时清理定时器
onUnmounted(() => {
  stopPreviewTimer();
});

watch(activeCollapseNames, (newNames) => {
  if (newNames.includes("thinkRules")) thinkRulesLoaded.value = true;
  if (newNames.includes("styleOptions")) {
    if (!styleOptionsLoaded.value) {
      styleLoading.value = true;
      // 模拟加载延迟，提升体验
      setTimeout(() => {
        styleLoading.value = false;
      }, 500);
    }
    styleOptionsLoaded.value = true;
  }
});

// 加载表单数据
const loadFormData = () => {
  // 1. 重置为默认值
  const defaults = JSON.parse(JSON.stringify(defaultFormState));
  Object.assign(editForm, defaults);

  // 默认关闭可选功能
  virtualTimeEnabled.value = false;

  // 确定数据源：编辑模式用 agent，创建模式用 initialData
  const sourceData = props.mode === "edit" && props.agent ? props.agent : props.initialData || {};

  // 2. 动态合并数据
  // 遍历 editForm 的 key，如果 sourceData 中有对应的值，则覆盖
  for (const key of Object.keys(editForm)) {
    if (key in sourceData) {
      const val = (sourceData as any)[key];
      if (val !== undefined && val !== null) {
        // 对于对象/数组进行深拷贝，避免引用污染
        if (typeof val === "object") {
          (editForm as any)[key] = JSON.parse(JSON.stringify(val));
        } else {
          (editForm as any)[key] = val;
        }
      }
    }
  }

  // 3. 特殊字段处理

  // modelCombo
  if (editForm.profileId && editForm.modelId) {
    editForm.modelCombo = `${editForm.profileId}:${editForm.modelId}`;
  }

  // virtualTimeConfig
  // 如果源数据中有 virtualTimeConfig，则启用开关
  if ("virtualTimeConfig" in sourceData && sourceData.virtualTimeConfig) {
    virtualTimeEnabled.value = true;
    // 确保 timeScale 有默认值，如果源数据里没有
    if (editForm.virtualTimeConfig.timeScale === undefined) {
      editForm.virtualTimeConfig.timeScale = 1.0;
    }
  } else {
    // 即使未启用，也保持 editForm.virtualTimeConfig 有合法的默认值（已在步骤1重置）
    // 重新生成时间，避免使用旧时间
    editForm.virtualTimeConfig = {
      virtualBaseTime: new Date().toISOString(),
      realBaseTime: new Date().toISOString(),
      timeScale: 1.0,
    };
  }

  // 重置 UI 状态
  activeCollapseNames.value = [];
  thinkRulesLoaded.value = false;
  styleOptionsLoaded.value = false;
  styleLoading.value = false;
};

// 监听对话框打开，加载数据
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      loadFormData();
    }
  },
  { immediate: true }
);
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
};

// 设置现实基准时间为当前时间
const setRealBaseToNow = () => {
  if (editForm.virtualTimeConfig) {
    editForm.virtualTimeConfig.realBaseTime = new Date().toISOString();
  }
};

/**
 * 处理插入宏到预览输入框
 */
const handleInsertMacro = (macro: MacroDefinition) => {
  const insertText = macro.example || `{{${macro.name}}}`;
  // 直接追加到输入框末尾（简单处理，因为是普通 el-input）
  macroPreviewInput.value += insertText;
  macroSelectorVisible.value = false;
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
  // 参数处理：
  // 1. 编辑模式：保留原有参数（因为 Dialog 不提供编辑，由外部 ModelParametersEditor 接管）
  // 2. 创建模式：优先使用 initialData 中的参数（继承自预设），否则使用默认值
  let parameters: ChatAgent["parameters"] = { temperature: 0.7, maxTokens: 8192 };

  if (props.mode === "edit" && props.agent) {
    parameters = props.agent.parameters;
  } else if (props.mode === "create" && props.initialData?.parameters) {
    // 确保是深拷贝，避免引用问题
    parameters = JSON.parse(JSON.stringify(props.initialData.parameters));
  }

  emit("save", {
    name: editForm.name,
    displayName: editForm.displayName || undefined,
    description: editForm.description,
    icon: editForm.icon,
    profileId: editForm.profileId,
    modelId: editForm.modelId,
    userProfileId: editForm.userProfileId,
    presetMessages: editForm.presetMessages,
    displayPresetCount: editForm.displayPresetCount,
    parameters,
    llmThinkRules: editForm.llmThinkRules,
    richTextStyleOptions: editForm.richTextStyleOptions,
    tags: editForm.tags,
    category: editForm.category,
    virtualTimeConfig:
      virtualTimeEnabled.value && editForm.virtualTimeConfig
        ? {
            virtualBaseTime: editForm.virtualTimeConfig.virtualBaseTime,
            realBaseTime: editForm.virtualTimeConfig.realBaseTime,
            timeScale: editForm.virtualTimeConfig.timeScale,
          }
        : undefined,
    regexConfig: editForm.regexConfig,
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
      <el-form-item label="ID/名称" required>
        <el-input v-model="editForm.name" placeholder="输入智能体名称（用作 ID 和宏替换）" />
        <div class="form-hint" v-pre>
          此名称将作为宏替换的 ID（如 {{ char }}），请使用简洁的名称。
        </div>
      </el-form-item>

      <el-form-item label="显示名称">
        <el-input v-model="editForm.displayName" placeholder="UI 显示名称（可选）" />
        <div class="form-hint">在界面上显示的名称。如果不填，则显示上面的 ID/名称。</div>
      </el-form-item>

      <el-form-item label="图标">
        <AvatarSelector
          :model-value="editForm.icon"
          @update:icon="handleIconUpdate"
          :entity-id="agent?.id"
          profile-type="agent"
          :name-for-fallback="editForm.name"
        />
      </el-form-item>

      <el-form-item label="分类">
        <el-input v-model="editForm.category" placeholder="为智能体设置一个分类（可选）" />
        <div class="form-hint">用于在侧边栏对智能体进行分组。</div>
      </el-form-item>

      <el-form-item label="标签">
        <el-select
          v-model="editForm.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入或选择标签"
          style="width: 100%"
          :reserve-keyword="false"
        >
          <el-option v-for="tag in allTags" :key="tag" :label="tag" :value="tag" />
        </el-select>
        <div class="form-hint">为智能体添加标签，便于筛选和搜索。按 Enter 键创建新标签。</div>
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
          :agent="editForm"
          height="300px"
        />
      </el-form-item>

      <el-divider content-position="left">高级设置</el-divider>

      <el-collapse v-model="activeCollapseNames">
        <el-collapse-item title="思考块规则配置" name="thinkRules">
          <div class="form-hint" style="margin-bottom: 12px">
            <p>
              配置 LLM 输出中的自定义思考过程识别规则（如 Chain of
              Thought），用于在对话中折叠显示思考内容。
            </p>
            <p>注意：这个规则需要和预设消息内容搭配使用。</p>
          </div>
          <LlmThinkRulesEditor v-if="thinkRulesLoaded" v-model="editForm.llmThinkRules" />
        </el-collapse-item>

        <el-collapse-item title="回复样式自定义" name="styleOptions">
          <div class="form-hint" style="margin-bottom: 12px">
            自定义该智能体回复内容的 Markdown 渲染样式（如粗体颜色、发光效果等）。
          </div>
          <div style="height: 700px">
            <MarkdownStyleEditor
              v-if="styleOptionsLoaded"
              v-model="editForm.richTextStyleOptions"
              :loading="styleLoading"
            />
          </div>
        </el-collapse-item>

        <el-collapse-item title="虚拟时间线配置" name="virtualTime">
          <div class="form-hint" style="margin-bottom: 12px" v-pre>
            设定智能体的虚拟时间流逝规则。启用后，{{ time }} 等宏将基于此配置计算时间。
          </div>
          <el-form-item label="启用虚拟时间">
            <el-switch v-model="virtualTimeEnabled" />
          </el-form-item>
          <template v-if="virtualTimeEnabled && editForm.virtualTimeConfig">
            <el-form-item label="虚拟基准点">
              <el-date-picker
                v-model="editForm.virtualTimeConfig.virtualBaseTime"
                type="datetime"
                placeholder="设定虚拟世界的起始时间"
                style="width: 100%"
              />
              <div class="form-hint">设定智能体所处的虚拟世界时间点。</div>
            </el-form-item>
            <el-form-item label="现实基准点">
              <div style="display: flex; gap: 8px; width: 100%">
                <el-date-picker
                  v-model="editForm.virtualTimeConfig.realBaseTime"
                  type="datetime"
                  placeholder="对应现实世界的时刻"
                  style="flex: 1"
                />
                <el-button @click="setRealBaseToNow">设为现在</el-button>
              </div>
              <div class="form-hint">该虚拟时间点所对应的现实世界时间。</div>
            </el-form-item>
            <el-form-item label="时间流速">
              <el-input-number
                v-model="editForm.virtualTimeConfig.timeScale"
                :step="0.1"
                :precision="2"
              />
              <div class="form-hint">
                相对于现实时间的流速倍率。1.0 为正常流速，2.0 为两倍速，0.5 为半速。
              </div>
            </el-form-item>
            <div class="form-hint" style="margin-bottom: 16px">
              计算公式：当前虚拟时间 = 虚拟基准点 + (当前现实时间 - 现实基准点) × 时间流速
            </div>

            <!-- 宏预览区域 -->
            <el-divider content-position="left">
              <span style="font-size: 12px; color: var(--el-text-color-secondary)">实时预览</span>
            </el-divider>
            <el-form-item label="测试宏">
              <div class="macro-input-wrapper">
                <el-input
                  v-model="macroPreviewInput"
                  placeholder="输入要测试的宏，如 {{time}} 或 {{datetime_cn}}"
                  clearable
                />
                <el-popover
                  v-model:visible="macroSelectorVisible"
                  placement="bottom-end"
                  :width="400"
                  trigger="click"
                  popper-class="macro-selector-popover"
                >
                  <template #reference>
                    <el-button :type="macroSelectorVisible ? 'primary' : 'default'" plain>
                      <el-icon style="margin-right: 4px"><MagicStick /></el-icon>
                      插入宏
                    </el-button>
                  </template>
                  <MacroSelector filter="contextFree" @insert="handleInsertMacro" />
                </el-popover>
              </div>
              <div class="form-hint" v-pre>
                支持的时间宏：{{ time }}, {{ date }}, {{ datetime }}, {{ time24 }}, {{ weekday }},
                {{ datetime_cn }}, {{ shichen }}, {{ datetime_cn_ancient }} 等
              </div>
            </el-form-item>
            <el-form-item label="预览结果">
              <div class="macro-preview-result">
                {{ macroPreviewResult || "（输入宏后显示结果）" }}
              </div>
            </el-form-item>
          </template>
        </el-collapse-item>

        <el-collapse-item title="正则管道配置" name="regexConfig">
          <ChatRegexEditor v-model="editForm.regexConfig" />
        </el-collapse-item>
      </el-collapse>
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

/* 宏预览结果样式 */
.macro-preview-result {
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-family: var(--el-font-family);
  font-size: 14px;
  color: var(--el-text-color-primary);
  min-height: 20px;
  word-break: break-all;
  line-height: 1.6;
}

/* 宏输入框包装器 */
.macro-input-wrapper {
  display: flex;
  gap: 8px;
  width: 100%;
}

.macro-input-wrapper .el-input {
  flex: 1;
}
</style>
