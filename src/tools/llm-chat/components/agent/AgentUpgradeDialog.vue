<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Upload, Document, Refresh, Warning, FolderOpened, Files } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent } from "../../types";
import { useAgentStore } from "../../stores/agentStore";
import { useWorldbookStore } from "../../stores/worldbookStore";
import { normalizeWorldbook } from "../../services/worldbookImportService";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import jsYaml from "js-yaml";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, readDir } from "@tauri-apps/plugin-fs";
import { isEqual } from "lodash-es";

const logger = createModuleLogger("llm-chat/AgentUpgradeDialog");
const errorHandler = createModuleErrorHandler("llm-chat/AgentUpgradeDialog");

// ========== Props & Emits ==========
const props = defineProps<{
  visible: boolean;
  agent: ChatAgent;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "upgraded"): void;
}>();

// ========== Stores ==========
const agentStore = useAgentStore();
const worldbookStore = useWorldbookStore();

// ========== 响应式状态 ==========
const importText = ref("");
const upgradeStrategy = ref<"merge" | "overwrite">("merge");
const parsedConfig = ref<Partial<ChatAgent> | null>(null);
const parsedAssets = ref<Record<string, ArrayBuffer>>({});
const parsedBundledWorldbooks = ref<any[]>([]);
const parsedEmbeddedWorldbook = ref<any>(null);
const parseError = ref<string | null>(null);
const isDragging = ref(false);
const isParsing = ref(false);

// ========== 常量 ==========
const MAX_DIR_DEPTH = 3;
const ALLOWED_EXTENSIONS = ["json", "yaml", "yml", "zip", "png", "jpg", "jpeg"];

// ========== 配置解析 ==========

/** 解析文本配置（JSON/YAML） */
const parseTextConfig = (text: string) => {
  if (!text.trim()) {
    parsedConfig.value = null;
    parseError.value = null;
    return;
  }

  try {
    const data = text.trim().startsWith("{") ? JSON.parse(text) : jsYaml.load(text);

    if (!data || typeof data !== "object") {
      throw new Error("无效的配置文件格式");
    }

    // 自动识别 AIO 导出包格式
    if (data.type === "AIO_Agent_Export" && Array.isArray(data.agents) && data.agents.length > 0) {
      parsedConfig.value = data.agents[0];
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

watch(importText, parseTextConfig);

// ========== 文件处理 ==========

/** 处理文件上传（支持 ZIP, PNG, JSON, YAML） */
const handleFileUpload = async (file: File | File[]) => {
  isParsing.value = true;
  parseError.value = null;
  const fileList = Array.isArray(file) ? file : [file];
  importText.value = fileList.map((f) => f.name).join(", ");

  try {
    const result = await agentStore.preflightImportAgents(file);

    if (result.agents.length === 0) {
      throw new Error("未在文件中找到有效的智能体配置");
    }

    const firstAgent = result.agents[0];
    const tempId = firstAgent.id || "";

    parsedConfig.value = firstAgent;
    parsedAssets.value = result.assets[tempId] || {};
    parsedBundledWorldbooks.value = result.bundledWorldbooks?.[tempId] || [];
    parsedEmbeddedWorldbook.value = result.embeddedWorldbooks?.[tempId] || null;

    logger.debug("文件解析成功", {
      agentName: firstAgent.name,
      assetCount: Object.keys(parsedAssets.value).length,
      bundledWbCount: parsedBundledWorldbooks.value.length,
      hasEmbeddedWb: !!parsedEmbeddedWorldbook.value,
    });
  } catch (error) {
    parsedConfig.value = null;
    parsedAssets.value = {};
    parseError.value = (error as Error).message;
    logger.warn("文件解析失败", error);
  } finally {
    isParsing.value = false;
  }
};

/** 递归收集目录中的文件 */
const collectFilesFromDirectory = async (
  dirPath: string,
  maxDepth: number,
  allowedExts: string[]
): Promise<File[]> => {
  const files: File[] = [];

  const processDir = async (currentPath: string, depth: number, relativePrefix = "") => {
    if (depth > maxDepth) return;

    const entries = await readDir(currentPath);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const entryPath = `${currentPath}/${entry.name}`;
      if (entry.isDirectory) {
        await processDir(entryPath, depth + 1, `${relativePrefix}${entry.name}/`);
      } else if (entry.isFile) {
        const ext = entry.name.split(".").pop()?.toLowerCase() || "";
        if (allowedExts.includes(ext)) {
          const content = await readFile(entryPath);
          files.push(new File([content], `${relativePrefix}${entry.name}`));
        }
      }
    }
  };

  await processDir(dirPath, 0);
  return files;
};

// ========== 用户交互处理 ==========

const onDrop = (e: DragEvent) => {
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    handleFileUpload(Array.from(files));
  }
};

const handleSelectFile = async () => {
  try {
    const selected = await open({
      multiple: true,
      filters: [{ name: "智能体配置", extensions: ["json", "yaml", "yml", "zip", "png"] }],
    });

    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    const files = await Promise.all(
      paths.map(async (path) => {
        const content = await readFile(path);
        const name = path.split(/[/\\]/).pop() || "unnamed";
        return new File([content], name);
      })
    );
    handleFileUpload(files);
  } catch (error) {
    logger.error("选择文件失败", error as Error);
  }
};

const handleSelectDirectory = async () => {
  try {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    isParsing.value = true;
    const files = await collectFilesFromDirectory(
      selected as string,
      MAX_DIR_DEPTH,
      ALLOWED_EXTENSIONS
    );

    if (files.length > 0) {
      await handleFileUpload(files);
    } else {
      customMessage.warning("所选目录中未找到有效的配置文件或资产");
      isParsing.value = false;
    }
  } catch (error) {
    logger.error("选择目录失败", error as Error);
    isParsing.value = false;
  }
};
// ========== 世界书处理 ==========

/** 查找内容完全一致的现有世界书 */
const findDuplicateWorldbook = async (content: any, name: string): Promise<string | null> => {
  const candidates = worldbookStore.worldbooks.filter((wb) => wb.name === name);
  for (const candidate of candidates) {
    const existingContent = await worldbookStore.getWorldbookContent(candidate.id);
    if (existingContent && isEqual(existingContent.entries, content.entries)) {
      return candidate.id;
    }
  }
  return null;
};

/** 导入单个世界书，返回其 ID（去重或新建） */
const importSingleWorldbook = async (content: any, name: string): Promise<string> => {
  const existingId = await findDuplicateWorldbook(content, name);
  if (existingId) return existingId;
  return await worldbookStore.importWorldbook(name, content);
};

/** 处理所有世界书导入，返回导入的 ID 列表 */
const processWorldbookImports = async (agentName: string): Promise<string[]> => {
  const importedIds: string[] = [];

  // 处理嵌入的世界书
  if (parsedEmbeddedWorldbook.value) {
    const wb = parsedEmbeddedWorldbook.value;
    const wbName = wb.metadata?.name || `${agentName} 的世界书`;
    const normalizedWb = normalizeWorldbook(wb);
    const wbId = await importSingleWorldbook(normalizedWb, wbName);
    importedIds.push(wbId);
  }

  // 处理随包打包的世界书
  for (const bundled of parsedBundledWorldbooks.value) {
    if (bundled.content) {
      const wbId = await importSingleWorldbook(bundled.content, bundled.name);
      importedIds.push(wbId);
    }
  }

  return importedIds;
};

// ========== 配置合并策略 ==========

/** 构建合并模式的更新数据 */
const buildMergeUpdate = (
  currentAgent: ChatAgent,
  newConfig: Partial<ChatAgent>,
  importedWorldbookIds: string[]
): Partial<ChatAgent> => ({
  presetMessages: newConfig.presetMessages ?? currentAgent.presetMessages,
  parameters: { ...currentAgent.parameters, ...(newConfig.parameters || {}) },
  llmThinkRules: newConfig.llmThinkRules ?? currentAgent.llmThinkRules,
  richTextStyleOptions: newConfig.richTextStyleOptions ?? currentAgent.richTextStyleOptions,
  regexConfig: newConfig.regexConfig ?? currentAgent.regexConfig,
  interactionConfig: newConfig.interactionConfig ?? currentAgent.interactionConfig,
  virtualTimeConfig: newConfig.virtualTimeConfig ?? currentAgent.virtualTimeConfig,
  worldbookIds: [
    ...new Set([
      ...(currentAgent.worldbookIds || []),
      ...(newConfig.worldbookIds || []),
      ...importedWorldbookIds,
    ]),
  ],
  worldbookSettings: newConfig.worldbookSettings ?? currentAgent.worldbookSettings,
  assetGroups: newConfig.assetGroups ?? currentAgent.assetGroups,
  assets: newConfig.assets ?? currentAgent.assets,
  tags: [...new Set([...(currentAgent.tags || []), ...(newConfig.tags || [])])],
});

/** 构建替换模式的更新数据 */
const buildOverwriteUpdate = (
  newConfig: Partial<ChatAgent>,
  importedWorldbookIds: string[]
): Partial<ChatAgent> => {
  const { id, createdAt, lastUsedAt, ...rest } = newConfig as any;
  return {
    ...rest,
    worldbookIds: [...new Set([...(newConfig.worldbookIds || []), ...importedWorldbookIds])],
  };
};

// ========== 资产处理 ==========

/** 处理资产更新 */
const processAssetUpdates = async (agentId: string) => {
  const assetEntries = Object.entries(parsedAssets.value);
  if (assetEntries.length === 0) return;

  logger.info("开始更新智能体资产", { count: assetEntries.length });

  for (const [path, buffer] of assetEntries) {
    const rawRelativePath = path.replace(/^assets[/\\]/, "");
    const pathParts = rawRelativePath.split(/[/\\]/);
    const filename = pathParts.pop() || "file";
    const relativeSubDir = pathParts.join("/");

    const subdirectory = `llm-chat/agents/${agentId}/${relativeSubDir}`.replace(/\/+$/, "");

    await invoke("save_uploaded_file", {
      fileData: Array.from(new Uint8Array(buffer)),
      subdirectory,
      filename,
    });

    // 如果是头像，自动同步 icon 字段
    if (path.includes("avatar_for_") || parsedConfig.value?.icon === path) {
      const finalIconPath = relativeSubDir ? `${relativeSubDir}/${filename}` : filename;
      agentStore.updateAgent(agentId, { icon: finalIconPath });
    }
  }
};

// ========== 核心执行逻辑 ==========

/** 执行升级/覆盖 */
const handleConfirm = async () => {
  if (!parsedConfig.value) return;

  try {
    const currentAgent = props.agent;
    const newConfig = parsedConfig.value;
    const agentName = newConfig.displayName || newConfig.name || currentAgent.name;

    // 1. 处理世界书
    const importedWorldbookIds = await processWorldbookImports(agentName);

    // 2. 准备更新数据
    const updatedData =
      upgradeStrategy.value === "merge"
        ? buildMergeUpdate(currentAgent, newConfig, importedWorldbookIds)
        : buildOverwriteUpdate(newConfig, importedWorldbookIds);

    // 3. 执行更新
    agentStore.updateAgent(currentAgent.id, updatedData);

    // 4. 处理资产
    await processAssetUpdates(currentAgent.id);

    customMessage.success("智能体配置覆盖成功");
    emit("upgraded");
    handleClose();
  } catch (error) {
    errorHandler.error(error, "升级失败");
  }
};

/** 关闭对话框并重置状态 */
const handleClose = () => {
  emit("update:visible", false);
  importText.value = "";
  parsedConfig.value = null;
  parsedAssets.value = {};
  parsedBundledWorldbooks.value = [];
  parsedEmbeddedWorldbook.value = null;
  parseError.value = null;
  isParsing.value = false;
};

// ========== 计算属性 ==========

/** 预览信息 */
const previewInfo = computed(() => {
  const config = parsedConfig.value;
  if (!config) return null;

  return {
    name: config.displayName || config.name || "未命名配置",
    presetCount: config.presetMessages?.length || 0,
    hasParams: !!config.parameters,
    hasRules: !!config.llmThinkRules?.length,
    hasRegex: !!config.regexConfig?.presets?.some((p) => (p.rules?.length ?? 0) > 0),
    hasIcon: !!config.icon,
    worldbookCount: config.worldbookIds?.length || 0,
    assetCount: config.assets?.length || 0,
  };
});
</script>

<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="emit('update:visible', $event)"
    title="覆盖智能体配置"
    width="800px"
  >
    <div class="upgrade-container">
      <div class="agent-target-info">
        <span class="label">正在覆盖：</span>
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
        </div>
        <div class="import-actions">
          <el-button :icon="Files" @click="handleSelectFile" size="small">选择文件</el-button>
          <el-button :icon="FolderOpened" @click="handleSelectDirectory" size="small">
            选择目录
          </el-button>
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
            <span class="p-label">世界书引用:</span>
            <span class="p-value">{{
              previewInfo.worldbookCount > 0 ? `${previewInfo.worldbookCount} 个` : "无"
            }}</span>
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
        <div class="section-title">覆盖策略</div>
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
        确认覆盖
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

.import-actions {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 8px;
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
