<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="custom-command-editor">
    <!-- 命令模板快捷选择 -->
    <div class="template-section">
      <div class="section-header">
        <span class="section-title">命令模板</span>
        <el-tooltip content="选择模板会覆盖当前命令">
          <el-icon :size="14" class="hint-icon"><CircleAlert /></el-icon>
        </el-tooltip>
      </div>
      <div class="template-chips">
        <el-tag
          v-for="tpl in commandTemplates"
          :key="tpl.id"
          class="template-chip"
          :effect="activeTemplateId === tpl.id ? 'dark' : 'plain'"
          @click="applyTemplate(tpl)"
        >
          {{ tpl.name }}
        </el-tag>
      </div>
    </div>

    <!-- 命令编辑区 -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-title">自定义参数</span>
        <div class="editor-actions">
          <el-tooltip content="清空命令">
            <el-button :icon="Eraser" size="small" link @click="clearCommand" />
          </el-tooltip>
          <el-tooltip content="格式化（每个参数一行）">
            <el-button
              :icon="AlignLeft"
              size="small"
              link
              @click="formatCommand"
            />
          </el-tooltip>
        </div>
      </div>
      <div class="editor-wrapper">
        <div class="editor-prefix">
          <code class="prefix-text"
            >ffmpeg -y {{ params.hwaccel ? "-hwaccel auto " : "" }}-i "input"
          </code>
        </div>
        <el-input
          v-model="commandText"
          type="textarea"
          :rows="5"
          placeholder="输入 FFmpeg 参数，不含 ffmpeg、-i 输入路径和输出路径&#10;例如: -c:v libx264 -crf 23 -c:a aac -b:a 128k"
          class="command-textarea"
          spellcheck="false"
          @input="handleCommandInput"
        />
        <div class="editor-suffix">
          <code class="suffix-text">"output.mp4"</code>
        </div>
      </div>
      <div class="editor-hint">
        每个参数用空格分隔。系统会自动拼接 ffmpeg、输入路径和输出路径。
      </div>
    </div>

    <!-- 参数积木 -->
    <div class="blocks-section">
      <div class="section-header">
        <span class="section-title">参数积木</span>
        <el-tooltip content="按作用域可视化编辑参数，未启用的积木不会进入命令">
          <el-icon :size="14" class="hint-icon"><CircleAlert /></el-icon>
        </el-tooltip>
      </div>

      <el-radio-group v-model="activeScope" size="small" class="scope-tabs">
        <el-radio-button value="global">全局</el-radio-button>
        <el-radio-button value="input">输入前</el-radio-button>
        <el-radio-button value="output">输出</el-radio-button>
      </el-radio-group>

      <div v-if="hasRawBlocks(activeBlocks)" class="raw-warning">
        当前作用域包含未识别参数，已按原始文本保留
      </div>

      <div v-if="activeBlocks.length === 0" class="blocks-empty">
        当前作用域暂无参数积木
      </div>
      <div v-else class="block-list">
        <div
          v-for="(block, index) in activeBlocks"
          :key="block.id"
          class="block-row"
          :class="{ 'is-disabled': !block.enabled, 'is-raw': block.raw !== undefined }"
        >
          <el-checkbox
            v-model="block.enabled"
            class="block-enable"
            @change="handleBlockMutation(activeScope)"
          />
          <template v-if="block.raw !== undefined">
            <el-tag size="small" type="warning" class="raw-tag">未识别</el-tag>
            <el-input
              size="small"
              class="block-key-input"
              :model-value="block.raw"
              placeholder="原始参数"
              @input="(value: string) => updateRawBlock(activeScope, block, value)"
            />
          </template>
          <template v-else>
            <el-input
              v-model="block.key"
              size="small"
              class="block-key-input"
              placeholder="参数名，如 -crf"
              @input="handleBlockMutation(activeScope)"
            />
            <el-input
              size="small"
              class="block-value-input"
              :model-value="block.value ?? ''"
              placeholder="值（可空）"
              @input="(value: string) => updateBlockValue(activeScope, block, value)"
            />
          </template>
          <div class="block-actions">
            <el-button
              :icon="ArrowUp"
              size="small"
              link
              :disabled="index === 0"
              @click="moveBlock(activeScope, index, -1)"
            />
            <el-button
              :icon="ArrowDown"
              size="small"
              link
              :disabled="index === activeBlocks.length - 1"
              @click="moveBlock(activeScope, index, 1)"
            />
            <el-button
              :icon="Trash2"
              size="small"
              link
              @click="removeBlock(activeScope, index)"
            />
          </div>
        </div>
      </div>

      <div class="add-block-row">
        <el-input
          v-model="newBlockKey"
          size="small"
          class="new-key-input"
          placeholder="参数名，如 -crf"
        />
        <el-input
          v-model="newBlockValue"
          size="small"
          class="new-value-input"
          placeholder="值（可选）"
        />
        <el-button :icon="Plus" size="small" @click="addValueBlock">
          添加参数块
        </el-button>
        <el-button size="small" @click="addSwitchBlock">添加无值开关</el-button>
      </div>
    </div>

    <!-- 快捷参数片段 -->
    <div class="snippets-section">
      <div class="section-header">
        <span class="section-title">快捷插入</span>
      </div>
      <div class="snippet-groups">
        <div
          v-for="group in snippetGroups"
          :key="group.label"
          class="snippet-group"
        >
          <span class="group-label">{{ group.label }}</span>
          <div class="group-chips">
            <el-tag
              v-for="snippet in group.items"
              :key="snippet.value"
              size="small"
              class="snippet-chip"
              @click="insertSnippet(snippet.value)"
            >
              <el-tooltip
                :content="snippet.value"
                placement="top"
                :show-after="300"
              >
                <span>{{ snippet.label }}</span>
              </el-tooltip>
            </el-tag>
          </div>
        </div>
      </div>
    </div>

    <!-- 保存为预设 -->
    <div class="save-section">
      <el-button
        :icon="Save"
        size="small"
        @click="handleSaveAsPreset"
        :disabled="!commandText.trim()"
      >
        保存当前命令为预设
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from "vue";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Eraser,
  AlignLeft,
  Plus,
  Save,
  Trash2,
} from "lucide-vue-next";
import type { FFmpegParams } from "../types";
import { parseCommandLine, serializeCommandLine } from "../utils/args";
import {
  blocksToArgs,
  createParamBlock,
  hasRawBlocks,
  parseArgsToBlocks,
} from "../utils/paramBlocks";
import type { ParamBlock, ParamScope } from "../utils/paramBlocks";

const props = defineProps<{
  params: FFmpegParams;
}>();

const emit = defineEmits<{
  (e: "save-as-preset"): void;
}>();

// 命令文本（单行字符串形式）
const commandText = ref("");
const activeTemplateId = ref<string | null>(null);

type ScopedParamField =
  | "customGlobalArgs"
  | "customInputArgs"
  | "customArgs";

const scopeFields: Record<ParamScope, ScopedParamField> = {
  global: "customGlobalArgs",
  input: "customInputArgs",
  output: "customArgs",
};

const activeScope = ref<ParamScope>("output");
const blocksByScope = reactive<Record<ParamScope, ParamBlock[]>>({
  global: [],
  input: [],
  output: [],
});
const lastSerialized: Record<ParamScope, string> = {
  global: "",
  input: "",
  output: "",
};

const activeBlocks = computed(() => blocksByScope[activeScope.value]);

const newBlockKey = ref("");
const newBlockValue = ref("");

// ==================== 命令模板 ====================

interface CommandTemplate {
  id: string;
  name: string;
  description: string;
  args: string;
}

const commandTemplates: CommandTemplate[] = [
  {
    id: "h264-crf",
    name: "H.264 CRF",
    description: "通用 H.264 编码，CRF 质量控制",
    args: "-c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -movflags +faststart",
  },
  {
    id: "h265-crf",
    name: "H.265 压缩",
    description: "H.265 高压缩比编码",
    args: "-c:v libx265 -crf 28 -preset slow -c:a aac -b:a 96k",
  },
  {
    id: "extract-audio",
    name: "提取音频",
    description: "仅提取音频流",
    args: "-vn -c:a copy",
  },
  {
    id: "gif-convert",
    name: "转 GIF",
    description: "视频转 GIF 动图",
    args: '-vf "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0',
  },
  {
    id: "trim-segment",
    name: "裁剪片段",
    description: "截取指定时间段",
    args: "-ss 00:00:00 -to 00:01:00 -c copy",
  },
  {
    id: "scale-1080p",
    name: "缩放 1080p",
    description: "缩放到 1080p 并保持宽高比",
    args: "-c:v libx264 -crf 23 -vf scale=1920:-2 -c:a copy -movflags +faststart",
  },
  {
    id: "remove-audio",
    name: "去除音频",
    description: "保留视频，移除音频轨",
    args: "-c:v copy -an",
  },
  {
    id: "concat-prepare",
    name: "转为可拼接格式",
    description: "转为 TS 格式用于无损拼接",
    args: "-c copy -bsf:v h264_mp4toannexb -f mpegts",
  },
  {
    id: "watermark-text",
    name: "文字水印",
    description: "添加文字水印（需修改文字内容）",
    args: `-vf "drawtext=text='Watermark':fontsize=24:fontcolor=white@0.5:x=10:y=10" -c:a copy`,
  },
  {
    id: "speed-2x",
    name: "2倍速",
    description: "视频和音频同时加速2倍",
    args: '-filter_complex "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]" -map "[v]" -map "[a]"',
  },
];

// ==================== 快捷片段 ====================

interface Snippet {
  label: string;
  value: string;
}

interface SnippetGroup {
  label: string;
  items: Snippet[];
}

const snippetGroups: SnippetGroup[] = [
  {
    label: "视频编码",
    items: [
      { label: "H.264", value: "-c:v libx264" },
      { label: "H.265", value: "-c:v libx265" },
      { label: "VP9", value: "-c:v libvpx-vp9" },
      { label: "AV1", value: "-c:v libaom-av1" },
      { label: "NVENC", value: "-c:v h264_nvenc" },
      { label: "视频拷贝", value: "-c:v copy" },
      { label: "禁用视频", value: "-vn" },
    ],
  },
  {
    label: "音频编码",
    items: [
      { label: "AAC", value: "-c:a aac" },
      { label: "MP3", value: "-c:a libmp3lame" },
      { label: "Opus", value: "-c:a libopus" },
      { label: "FLAC", value: "-c:a flac" },
      { label: "音频拷贝", value: "-c:a copy" },
      { label: "禁用音频", value: "-an" },
    ],
  },
  {
    label: "质量控制",
    items: [
      { label: "CRF 18", value: "-crf 18" },
      { label: "CRF 23", value: "-crf 23" },
      { label: "CRF 28", value: "-crf 28" },
      { label: "码率 4M", value: "-b:v 4000k" },
      { label: "码率 8M", value: "-b:v 8000k" },
      { label: "音频 128k", value: "-b:a 128k" },
      { label: "音频 320k", value: "-b:a 320k" },
    ],
  },
  {
    label: "常用选项",
    items: [
      { label: "快速启动", value: "-movflags +faststart" },
      { label: "preset fast", value: "-preset fast" },
      { label: "preset slow", value: "-preset slow" },
      { label: "yuv420p", value: "-pix_fmt yuv420p" },
      { label: "30fps", value: "-r 30" },
      { label: "60fps", value: "-r 60" },
      { label: "线程数 4", value: "-threads 4" },
    ],
  },
];

// ==================== 逻辑 ====================

/** 应用命令模板 */
const applyTemplate = (tpl: CommandTemplate) => {
  commandText.value = tpl.args;
  activeTemplateId.value = tpl.id;
  syncToParams();
};

/** 插入片段到命令末尾 */
const insertSnippet = (snippet: string) => {
  const current = commandText.value.trim();
  if (current) {
    commandText.value = `${current} ${snippet}`;
  } else {
    commandText.value = snippet;
  }
  activeTemplateId.value = null;
  syncToParams();
};

/** 清空命令 */
const clearCommand = () => {
  commandText.value = "";
  activeTemplateId.value = null;
  syncToParams();
};

/** 格式化命令（每个参数对一行） */
const formatCommand = () => {
  if (!commandText.value.trim()) return;
  const args = parseCommandLine(commandText.value);
  // 将参数按对分组显示
  const formatted: string[] = [];
  let i = 0;
  while (i < args.length) {
    if (
      args[i].startsWith("-") &&
      i + 1 < args.length &&
      !args[i + 1].startsWith("-")
    ) {
      formatted.push(`${args[i]} ${args[i + 1]}`);
      i += 2;
    } else {
      formatted.push(args[i]);
      i++;
    }
  }
  commandText.value = formatted.join("\n");
  syncToParams();
};

/** 处理输入变化 */
const handleCommandInput = () => {
  activeTemplateId.value = null;
  syncToParams();
};

/** 同步命令文本到 params.customArgs，并反向刷新输出作用域积木 */
const syncToParams = () => {
  const text = commandText.value.trim();
  const args = text ? parseCommandLine(text) : [];
  props.params.customArgs = args.length > 0 ? args : undefined;
  blocksByScope.output = parseArgsToBlocks(args, "output");
  lastSerialized.output = serializeCommandLine(args);
};

/** 从外部 params 重新解析指定作用域的积木，避免与自身写入形成循环 */
const refreshScopeFromParams = (scope: ParamScope) => {
  const incoming = props.params[scopeFields[scope]] ?? [];
  if (serializeCommandLine(incoming) === lastSerialized[scope]) return;
  blocksByScope[scope] = parseArgsToBlocks(incoming, scope);
  lastSerialized[scope] = serializeCommandLine(incoming);
  if (scope === "output") {
    commandText.value = serializeCommandLine(incoming);
    activeTemplateId.value = null;
  }
};

/** 将指定作用域的积木写回 params，输出作用域同步刷新命令文本 */
const writeScopeToParams = (scope: ParamScope) => {
  const args = blocksToArgs(blocksByScope[scope]);
  props.params[scopeFields[scope]] = args.length > 0 ? args : undefined;
  lastSerialized[scope] = serializeCommandLine(args);
  if (scope === "output") {
    commandText.value = serializeCommandLine(args);
  }
};

const handleBlockMutation = (scope: ParamScope) => {
  activeTemplateId.value = null;
  writeScopeToParams(scope);
};

const moveBlock = (scope: ParamScope, index: number, delta: number) => {
  const list = blocksByScope[scope];
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const [moved] = list.splice(index, 1);
  list.splice(target, 0, moved);
  handleBlockMutation(scope);
};

const removeBlock = (scope: ParamScope, index: number) => {
  blocksByScope[scope].splice(index, 1);
  handleBlockMutation(scope);
};

const updateBlockValue = (
  scope: ParamScope,
  block: ParamBlock,
  value: string
) => {
  block.value = value === "" ? undefined : value;
  handleBlockMutation(scope);
};

const updateRawBlock = (
  scope: ParamScope,
  block: ParamBlock,
  value: string
) => {
  block.raw = value;
  block.key = value;
  handleBlockMutation(scope);
};

const addValueBlock = () => {
  const key = newBlockKey.value.trim();
  if (!key) return;
  const value = newBlockValue.value.trim();
  blocksByScope[activeScope.value].push(
    createParamBlock(activeScope.value, key, value === "" ? undefined : value)
  );
  newBlockKey.value = "";
  newBlockValue.value = "";
  handleBlockMutation(activeScope.value);
};

const addSwitchBlock = () => {
  const key = newBlockKey.value.trim();
  if (!key) return;
  blocksByScope[activeScope.value].push(
    createParamBlock(activeScope.value, key)
  );
  newBlockKey.value = "";
  handleBlockMutation(activeScope.value);
};

/** 触发保存为预设 */
const handleSaveAsPreset = () => {
  emit("save-as-preset");
};

// 初始化：从 params 恢复三个作用域的积木与命令文本
onMounted(() => {
  refreshScopeFromParams("global");
  refreshScopeFromParams("input");
  refreshScopeFromParams("output");
});

// 监听外部对作用域参数的修改（如应用预设时）
watch(
  () => props.params.customArgs,
  () => refreshScopeFromParams("output"),
  { deep: true }
);

watch(
  () => props.params.customGlobalArgs,
  () => refreshScopeFromParams("global"),
  { deep: true }
);

watch(
  () => props.params.customInputArgs,
  () => refreshScopeFromParams("input"),
  { deep: true }
);
</script>

<style scoped>
.custom-command-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 模板区 */
.template-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.hint-icon {
  color: var(--text-color-light);
}

.template-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.template-chip {
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.template-chip:hover {
  transform: translateY(-1px);
}

/* 编辑器区 */
.editor-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.editor-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.editor-wrapper {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--input-bg);
}

.editor-prefix,
.editor-suffix {
  padding: 6px 12px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.06));
  border-bottom: var(--border-width) solid var(--border-color);
}

.editor-suffix {
  border-bottom: none;
  border-top: var(--border-width) solid var(--border-color);
}

.prefix-text,
.suffix-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.command-textarea :deep(.el-textarea__inner) {
  border: none;
  border-radius: 0;
  background: transparent;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
  resize: none;
  box-shadow: none;
}

.command-textarea :deep(.el-textarea__inner:focus) {
  box-shadow: none;
}

.editor-hint {
  font-size: 11px;
  color: var(--text-color-light);
  line-height: 1.4;
}

/* 参数积木区 */
.blocks-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scope-tabs {
  display: flex;
  width: 100%;
}

.scope-tabs :deep(.el-radio-button) {
  flex: 1;
}

.scope-tabs :deep(.el-radio-button__inner) {
  width: 100%;
}

.raw-warning {
  font-size: 11px;
  color: var(--el-color-warning);
  line-height: 1.4;
}

.blocks-empty {
  font-size: 12px;
  color: var(--text-color-light);
  padding: 8px 0;
}

.block-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.block-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.block-row.is-disabled {
  opacity: 0.5;
}

.block-enable {
  flex-shrink: 0;
}

.raw-tag {
  flex-shrink: 0;
}

.block-key-input {
  flex: 0 0 40%;
}

.block-value-input {
  flex: 1;
}

.block-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.add-block-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.new-key-input {
  flex: 0 0 32%;
}

.new-value-input {
  flex: 1;
}

/* 快捷片段区 */
.snippets-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.snippet-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.snippet-group {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.group-label {
  font-size: 11px;
  color: var(--text-color-light);
  white-space: nowrap;
  min-width: 56px;
  padding-top: 4px;
  font-weight: 500;
}

.group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.snippet-chip {
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.snippet-chip:hover {
  transform: translateY(-1px);
  color: var(--el-color-primary);
}

/* 保存区 */
.save-section {
  padding-top: 8px;
  border-top: var(--border-width) solid var(--border-color);
}
</style>
