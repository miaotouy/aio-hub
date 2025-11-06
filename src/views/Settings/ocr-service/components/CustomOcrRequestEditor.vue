<script setup lang="ts">
import { ref, watch } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { OcrApiRequest } from "@/types/ocr-profiles";
import type { Variable } from "@/tools/api-tester/types";
import { createModuleLogger } from "@/utils/logger";

interface Props {
  modelValue: OcrApiRequest;
}

interface Emits {
  (e: "update:modelValue", value: OcrApiRequest): void;
  (e: "open-presets"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 日志记录器
const logger = createModuleLogger("CustomOcrRequestEditor");

// 本地编辑状态
const localValue = ref<OcrApiRequest>({ ...props.modelValue });

// 监听外部变化
watch(
  () => props.modelValue,
  (newValue) => {
    localValue.value = { ...newValue };
  },
  { deep: true }
);

// 监听内部变化，向外发射
watch(
  localValue,
  (newValue) => {
    emit("update:modelValue", { ...newValue });
  },
  { deep: true }
);

// Headers 管理
const addHeader = () => {
  const newKey = `X-Custom-${Date.now()}`;
  localValue.value.headers[newKey] = "";
};

const removeHeader = (key: string) => {
  delete localValue.value.headers[key];
};

// Variables 管理
const addVariable = () => {
  const newVariable: Variable = {
    key: `var_${Date.now()}`,
    value: "",
    type: "string",
    label: "新变量",
    description: "",
  };
  localValue.value.variables.push(newVariable);
};

const removeVariable = (index: number) => {
  localValue.value.variables.splice(index, 1);
};

// JSON 格式化
const formatBodyTemplate = () => {
  try {
    const parsed = JSON.parse(localValue.value.bodyTemplate);
    localValue.value.bodyTemplate = JSON.stringify(parsed, null, 2);
  } catch (error) {
    alert("无法格式化：请求体不是有效的 JSON");
  }
};

// 预设模板示例
const loadExampleTemplate = () => {
  localValue.value.bodyTemplate = JSON.stringify(
    {
      image: "{{imageBase64}}",
      // 可以添加其他参数
    },
    null,
    2
  );
};

// 图标相关
async function handleSelectFile() {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "svg", "webp", "ico"],
        },
      ],
    });
    if (typeof selected === "string") {
      localValue.value.iconPath = selected;
    }
  } catch (error) {
    logger.error("选择 Body 模板文件失败", error, {
      context: "handleSelectFile",
      currentIconPath: localValue.value.iconPath,
    });
    alert("选择文件失败: " + error);
  }
}

function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = "none";
}

/**
 * 获取用于显示的图标路径
 * 如果是绝对路径（本地文件），则转换为 Tauri asset URL
 */
function getDisplayIconPath(iconPath: string): string {
  if (!iconPath) return "";

  // 检查是否为绝对路径
  // Windows: C:\, D:\, E:\ 等
  const isWindowsAbsolutePath = /^[A-Za-z]:[\\/]/.test(iconPath);
  // Unix/Linux 绝对路径，但排除 /ocr-icons/ 这种项目内的相对路径
  const isUnixAbsolutePath = iconPath.startsWith("/") && !iconPath.startsWith("/ocr-icons");

  if (isWindowsAbsolutePath || isUnixAbsolutePath) {
    // 只对真正的本地文件系统绝对路径转换为 Tauri asset URL
    return convertFileSrc(iconPath);
  }

  // 相对路径（包括 /ocr-icons/ 开头的预设图标）直接返回
  return iconPath;
}
</script>

<template>
  <div class="custom-ocr-editor">
    <el-form label-width="120px" label-position="left">
      <!-- HTTP 方法 -->
      <el-form-item label="HTTP 方法">
        <el-select v-model="localValue.method" style="width: 200px">
          <el-option label="POST" value="POST" />
          <el-option label="PUT" value="PUT" />
        </el-select>
      </el-form-item>

      <!-- URL 模板 -->
      <el-form-item label="URL 地址">
        <el-input
          v-model="localValue.urlTemplate"
          placeholder="https://api.example.com/ocr/v1/recognize"
        />
        <div class="form-hint">
          支持 <code v-pre>{{ variable }}</code> 占位符，例如:
          <code v-pre>https://{{ host }}/api</code>
        </div>
      </el-form-item>

      <el-divider content-position="left">
        <span style="font-size: 14px; font-weight: 600">变量配置</span>
      </el-divider>

      <!-- Variables -->
      <div class="variables-section">
        <div v-for="(variable, index) in localValue.variables" :key="index" class="variable-item">
          <el-input v-model="variable.key" placeholder="变量名" style="width: 150px" />
          <el-input v-model="variable.label" placeholder="显示标签" style="width: 150px" />
          <el-select v-model="variable.type" style="width: 120px">
            <el-option label="字符串" value="string" />
            <el-option label="布尔值" value="boolean" />
            <el-option label="枚举" value="enum" />
          </el-select>
          <el-input v-model="variable.value" placeholder="默认值" style="flex: 1" />
          <el-button type="danger" text @click="removeVariable(index)" style="width: 60px">
            删除
          </el-button>
        </div>
        <el-button @click="addVariable" style="width: 100%; margin-top: 8px">
          + 添加变量
        </el-button>
        <div class="form-hint" style="margin-top: 8px">
          💡 特殊变量 <code v-pre>imageBase64</code> 会自动填充图片数据，无需手动添加
        </div>
      </div>

      <el-divider content-position="left">
        <span style="font-size: 14px; font-weight: 600">请求头 (Headers)</span>
      </el-divider>

      <!-- Headers -->
      <div class="headers-section">
        <div v-for="(value, key) in localValue.headers" :key="key" class="header-item">
          <el-input
            :model-value="key"
            placeholder="Header Name"
            style="width: 200px"
            @update:model-value="
              (newKey: string) => {
                if (newKey !== String(key)) {
                  localValue.headers[newKey] = value;
                  delete localValue.headers[String(key)];
                }
              }
            "
          />
          <el-input v-model="localValue.headers[key]" placeholder="Header Value" style="flex: 1" />
          <el-button type="danger" text @click="removeHeader(String(key))" style="width: 60px">
            删除
          </el-button>
        </div>
        <el-button @click="addHeader" style="width: 100%; margin-top: 8px">
          + 添加请求头
        </el-button>
        <div class="form-hint" style="margin-top: 8px">
          💡 常用: <code>Content-Type: application/json</code>,
          <code v-pre>Authorization: Bearer {{ apiKey }}</code>
        </div>
      </div>

      <el-divider content-position="left">
        <span style="font-size: 14px; font-weight: 600">请求体 (Body)</span>
      </el-divider>

      <!-- Body Template -->
      <el-form-item label="请求体模板">
        <div style="width: 100%">
          <div class="editor-actions">
            <el-button @click="formatBodyTemplate" size="small">✨ 格式化 JSON</el-button>
            <el-button @click="loadExampleTemplate" size="small">📋 加载示例</el-button>
          </div>
          <el-input
            v-model="localValue.bodyTemplate"
            type="textarea"
            :rows="12"
            placeholder='{"image": "{{imageBase64}}"}'
            class="code-editor"
          />
          <div class="form-hint">
            必须是有效的 JSON。使用 <code v-pre>{{ imageBase64 }}</code> 表示图片数据
          </div>
        </div>
      </el-form-item>

      <el-divider content-position="left">
        <span style="font-size: 14px; font-weight: 600">结果解析</span>
      </el-divider>

      <!-- Result Path -->
      <el-form-item label="结果路径">
        <el-input v-model="localValue.resultPath" placeholder="data.text 或 result.0.content" />
        <div class="form-hint">
          从返回的 JSON 中提取文本的路径。例如: <code>data.text</code>,
          <code>result.0.text</code>
        </div>
      </el-form-item>

      <el-divider content-position="left">
        <span style="font-size: 14px; font-weight: 600">图标设置</span>
      </el-divider>

      <!-- Icon Path -->
      <el-form-item label="图标路径">
        <div class="input-with-actions">
          <el-input v-model="localValue.iconPath" placeholder="例如: /ocr-icons/阿里云.svg" />
          <el-button @click="handleSelectFile" class="btn-action">选择文件</el-button>
          <el-button @click="$emit('open-presets')" class="btn-action">选择预设</el-button>
        </div>
        <div class="form-hint">支持相对路径或绝对路径，推荐使用预设图标</div>
      </el-form-item>

      <!-- Icon Preview -->
      <div v-if="localValue.iconPath" class="icon-preview">
        <div class="preview-label">图标预览</div>
        <img
          :src="getDisplayIconPath(localValue.iconPath)"
          alt="预览"
          @error="handleImageError"
          class="preview-image"
        />
      </div>
    </el-form>
  </div>
</template>

<style scoped>
.custom-ocr-editor {
  padding: 0;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  line-height: 1.5;
}

.form-hint code {
  background: var(--border-color-light);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 11px;
}

.variables-section,
.headers-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px;
  margin-bottom: 16px;
}

.variable-item,
.header-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.editor-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.code-editor {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
}

:deep(.el-textarea__inner) {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  line-height: 1.5;
}

:deep(.el-divider__text) {
  background-color: var(--card-bg);
}

.input-with-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-with-actions :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.btn-action {
  white-space: nowrap;
}

.icon-preview {
  margin-top: 12px;
  padding: 16px;
  background: var(--input-bg);
  border-radius: 4px;
  text-align: center;
}

.preview-label {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 12px;
  color: var(--text-color);
}

.preview-image {
  width: 120px;
  height: 120px;
  object-fit: contain;
}
</style>
