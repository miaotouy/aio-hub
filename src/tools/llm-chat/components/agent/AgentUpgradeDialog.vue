<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Upload, Document, Refresh, Warning } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent } from "../../types";
import { useAgentStore } from "../../agentStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import jsYaml from "js-yaml";
import { invoke } from "@tauri-apps/api/core";

const logger = createModuleLogger("llm-chat/AgentUpgradeDialog");
const errorHandler = createModuleErrorHandler("llm-chat/AgentUpgradeDialog");

const props = defineProps<{
  visible: boolean;
  agent: ChatAgent;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "upgraded"): void;
}>();

const agentStore = useAgentStore();

// 状态
const importText = ref("");
const upgradeStrategy = ref<"merge" | "overwrite">("merge");
const parsedConfig = ref<Partial<ChatAgent> | null>(null);
const parsedAssets = ref<Record<string, ArrayBuffer>>({});
const parseError = ref<string | null>(null);
const isDragging = ref(false);
const isParsing = ref(false);

// 解析逻辑 (纯文本)
const parseConfig = (text: string) => {
  if (!text.trim()) {
    parsedConfig.value = null;
    parseError.value = null;
    return;
  }

  try {
    let data: any;
    if (text.trim().startsWith("{")) {
      data = JSON.parse(text);
    } else {
      data = jsYaml.load(text);
    }

    // 基础校验
    if (!data || typeof data !== "object") {
      throw new Error("无效的配置文件格式");
    }

    // 自动识别导出包格式 (AIO_Agent_Export)
    if (data.type === "AIO_Agent_Export" && Array.isArray(data.agents) && data.agents.length > 0) {
      parsedConfig.value = data.agents[0];
      // 如果包里自带资产列表，也同步一下（虽然粘贴文本拿不到二进制，但预览能看到）
      if (data.assets) {
        logger.debug("从导出包中识别到资产定义");
      }
    } else {
      parsedConfig.value = data;
    }

    parseError.value = null;
    logger.debug("配置解析成功", { strategy: upgradeStrategy.value });
  } catch (error) {
    parsedConfig.value = null;
    parseError.value = (error as Error).message;
    logger.warn("配置解析失败", error);
  }
};

watch(importText, (val) => {
  parseConfig(val);
});

// 文件上传处理 (支持 ZIP, PNG, JSON, YAML)
const handleFileUpload = async (file: File) => {
  isParsing.value = true;
  parseError.value = null;
  importText.value = file.name; // 显示文件名

  try {
    // 复用 agentStore 的预检逻辑
    const result = await agentStore.preflightImportAgents(file);

    if (result.agents.length > 0) {
      const firstAgent = result.agents[0];
      parsedConfig.value = firstAgent;
      // 从按 ID 隔离的资产桶中提取资产
      parsedAssets.value = result.assets[firstAgent.id || ''] || {};
      logger.debug("文件解析成功", {
        agentName: firstAgent.name,
        assetCount: Object.keys(parsedAssets.value).length,
      });
    } else {
      throw new Error("未在文件中找到有效的智能体配置");
    }
  } catch (error) {
    parsedConfig.value = null;
    parsedAssets.value = {};
    parseError.value = (error as Error).message;
    logger.warn("文件解析失败", error);
  } finally {
    isParsing.value = false;
  }
};

const onFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    handleFileUpload(target.files[0]);
  }
};

const onDrop = (e: DragEvent) => {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) {
    handleFileUpload(file);
  }
};

// 执行升级
const handleConfirm = async () => {
  if (!parsedConfig.value) return;

  try {
    const currentAgent = props.agent;
    const newConfig = parsedConfig.value;
    let updatedData: Partial<ChatAgent> = {};

    if (upgradeStrategy.value === "merge") {
      // 深度合并策略：保留身份，更新逻辑
      updatedData = {
        presetMessages: newConfig.presetMessages ?? currentAgent.presetMessages,
        parameters: {
          ...currentAgent.parameters,
          ...(newConfig.parameters || {}),
        },
        llmThinkRules: newConfig.llmThinkRules ?? currentAgent.llmThinkRules,
        richTextStyleOptions: newConfig.richTextStyleOptions ?? currentAgent.richTextStyleOptions,
        regexConfig: newConfig.regexConfig ?? currentAgent.regexConfig,
        interactionConfig: newConfig.interactionConfig ?? currentAgent.interactionConfig,
        virtualTimeConfig: newConfig.virtualTimeConfig ?? currentAgent.virtualTimeConfig,
        // 合并标签
        tags: Array.from(new Set([...(currentAgent.tags || []), ...(newConfig.tags || [])])),
      };
    } else {
      // 完全替换策略：除了 ID 和创建时间，全部覆盖
      // 过滤掉不可覆盖的系统字段
      const { id, createdAt, lastUsedAt, ...rest } = newConfig as any;
      updatedData = {
        ...rest,
      };
    }

    // 执行更新
    agentStore.updateAgent(currentAgent.id, updatedData);

    // 处理资产更新 (如果有新资产)
    const assetEntries = Object.entries(parsedAssets.value);
    if (assetEntries.length > 0) {
      logger.info("开始升级智能体资产", { count: assetEntries.length });
      for (const [path, buffer] of assetEntries) {
        // 提取路径结构
        const rawRelativePath = path.replace(/^assets[/\\]/, '');
        const pathParts = rawRelativePath.split(/[/\\]/);
        const filename = pathParts.pop() || 'file';
        const relativeSubDir = pathParts.join('/');

        // 保持子目录结构存储
        const subdirectory = `llm-chat/agents/${currentAgent.id}/${relativeSubDir}`.replace(/\/+$/, '');

        await invoke("save_uploaded_file", {
          fileData: Array.from(new Uint8Array(buffer)),
          subdirectory,
          filename: filename,
        });

        // 如果是头像资产，更新 icon 字段
        if (path.includes("avatar_for_") || parsedConfig.value?.icon === path) {
          const finalIconPath = relativeSubDir ? `${relativeSubDir}/${filename}` : filename;
          agentStore.updateAgent(currentAgent.id, { icon: finalIconPath });
        }
      }
    }

    customMessage.success("智能体升级成功");
    emit("upgraded");
    handleClose();
  } catch (error) {
    errorHandler.error(error, "升级失败");
  }
};

const handleClose = () => {
  emit("update:visible", false);
  importText.value = "";
  parsedConfig.value = null;
  parsedAssets.value = {};
  parseError.value = null;
  isParsing.value = false;
};

// 预览信息
const previewInfo = computed(() => {
  if (!parsedConfig.value) return null;
  const c = parsedConfig.value;
  return {
    name: c.displayName || c.name || "未命名配置",
    presetCount: c.presetMessages?.length || 0,
    hasParams: !!c.parameters,
    hasRules: !!c.llmThinkRules?.length,
    hasRegex: !!c.regexConfig?.presets?.some((p) => p.rules?.length > 0),
    hasIcon: !!c.icon,
  };
});
</script>

<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="emit('update:visible', $event)"
    title="升级智能体"
    width="600px"
  >
    <div class="upgrade-container">
      <div class="agent-target-info">
        <span class="label">正在升级：</span>
        <span class="name">{{ agent.displayName || agent.name }}</span>
      </div>

      <div
        class="import-area"
        :class="{ 'is-dragging': isDragging }"
        v-loading="isParsing"
        element-loading-text="正在解析配置..."
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <el-input
          v-model="importText"
          type="textarea"
          :rows="8"
          placeholder="在此粘贴 JSON/YAML 配置内容，或将配置文件拖入此处..."
          resize="none"
        />
        <div class="upload-hint" v-if="!importText && !isParsing">
          <el-icon><Upload /></el-icon>
          <span>支持拖拽文件上传</span>
          <input type="file" class="file-input" @change="onFileChange" accept=".json,.yaml,.yml" />
        </div>
      </div>

      <div v-if="parseError" class="error-msg">
        <el-icon><Warning /></el-icon>
        {{ parseError }}
      </div>

      <div v-if="previewInfo" class="preview-section">
        <div class="section-title">配置预览</div>
        <div class="preview-grid">
          <div class="preview-item">
            <span class="p-label">来源名称:</span>
            <span class="p-value">{{ previewInfo.name }}</span>
          </div>
          <div class="preview-item">
            <span class="p-label">预设消息:</span>
            <span class="p-value">{{ previewInfo.presetCount }} 条</span>
          </div>
          <div class="preview-item">
            <span class="p-label">包含参数:</span>
            <span class="p-value">{{ previewInfo.hasParams ? "是" : "否" }}</span>
          </div>
          <div class="preview-item">
            <span class="p-label">思考规则:</span>
            <span class="p-value">{{ previewInfo.hasRules ? "是" : "否" }}</span>
          </div>
          <div class="preview-item">
            <span class="p-label">私有资产:</span>
            <span class="p-value">
              <template v-if="Object.keys(parsedAssets).length > 0">
                {{ Object.keys(parsedAssets).length }} 个文件
              </template>
              <template v-else-if="previewInfo.hasIcon"> 仅外部引用 </template>
              <template v-else>无</template>
            </span>
          </div>
        </div>
      </div>

      <div class="strategy-section">
        <div class="section-title">升级策略</div>
        <el-radio-group v-model="upgradeStrategy">
          <el-radio-button label="merge" value="merge">
            <div class="radio-content">
              <el-icon><Refresh /></el-icon>
              <span>深度合并</span>
            </div>
          </el-radio-button>
          <el-radio-button label="overwrite" value="overwrite">
            <div class="radio-content">
              <el-icon><Document /></el-icon>
              <span>完全替换</span>
            </div>
          </el-radio-button>
        </el-radio-group>
        <div class="strategy-hint">
          {{
            upgradeStrategy === "merge"
              ? "保留当前的名称、头像和模型配置，仅更新提示词、参数和高级规则。"
              : "除了唯一 ID 外，将所有配置替换为导入的内容。"
          }}
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :disabled="!parsedConfig" @click="handleConfirm">
        确认升级
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.upgrade-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.agent-target-info {
  padding: 10px 12px;
  background: color-mix(in srgb, var(--el-color-primary), transparent 92%);
  border-radius: 6px;
  border-left: 4px solid var(--el-color-primary);
}

.agent-target-info .label {
  font-size: 13px;
  color: var(--text-color-secondary);
}

.agent-target-info .name {
  font-weight: bold;
  color: var(--el-color-primary);
}

.import-area {
  position: relative;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  transition: all 0.3s;
}

.import-area.is-dragging {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.upload-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-color-light);
  pointer-events: none;
}

.upload-hint .el-icon {
  font-size: 32px;
}

.file-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.error-msg {
  color: var(--el-color-danger);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.preview-section,
.strategy-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: bold;
  color: var(--text-color);
}

.preview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.preview-item {
  font-size: 13px;
}

.p-label {
  color: var(--text-color-secondary);
  margin-right: 8px;
}

.p-value {
  color: var(--text-color);
}

.radio-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.strategy-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}
</style>
