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
import { ref, watch, onMounted } from "vue";
import { CircleAlert, Eraser, AlignLeft, Save } from "lucide-vue-next";
import type { FFmpegParams } from "../types";

const props = defineProps<{
  params: FFmpegParams;
}>();

const emit = defineEmits<{
  (e: "save-as-preset"): void;
}>();

// 命令文本（单行字符串形式）
const commandText = ref("");
const activeTemplateId = ref<string | null>(null);

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
  const args = parseArgsString(commandText.value);
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

/** 同步命令文本到 params.customArgs */
const syncToParams = () => {
  const text = commandText.value.trim();
  if (!text) {
    props.params.customArgs = undefined;
  } else {
    props.params.customArgs = parseArgsString(text);
  }
};

/** 解析参数字符串为数组（支持引号内的空格） */
function parseArgsString(input: string): string[] {
  const args: string[] = [];
  // 先将多行合并为单行
  const singleLine = input.replace(/\n/g, " ").trim();
  // 使用正则匹配：引号内的内容作为整体，或非空格字符序列
  const regex = /(?:"([^"]*)")|(?:'([^']*)')|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(singleLine)) !== null) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value !== undefined) {
      args.push(
        match[1] !== undefined
          ? `"${value}"`
          : match[2] !== undefined
            ? `'${value}'`
            : value
      );
    }
  }
  return args;
}

/** 触发保存为预设 */
const handleSaveAsPreset = () => {
  emit("save-as-preset");
};

// 初始化：从 params.customArgs 恢复命令文本
onMounted(() => {
  if (props.params.customArgs && props.params.customArgs.length > 0) {
    commandText.value = props.params.customArgs.join(" ");
  }
});

// 监听外部对 customArgs 的修改（如应用预设时）
watch(
  () => props.params.customArgs,
  (newArgs) => {
    if (!newArgs || newArgs.length === 0) {
      if (commandText.value.trim()) {
        // 只在外部清空时同步，避免循环
        commandText.value = "";
      }
    } else {
      const externalText = newArgs.join(" ");
      const currentParsed = parseArgsString(commandText.value).join(" ");
      // 只在外部值与当前不同时同步（避免循环更新）
      if (externalText !== currentParsed) {
        commandText.value = externalText;
        activeTemplateId.value = null;
      }
    }
  },
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
