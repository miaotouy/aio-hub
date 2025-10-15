<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>{{ isNew ? "添加配置" : "编辑配置" }}</h3>
        <button @click="$emit('close')" class="btn-close">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>匹配类型</label>
          <select v-model="localConfig.matchType">
            <option value="provider">Provider (提供商)</option>
            <option value="model">Model (精确模型)</option>
            <option value="modelPrefix">Model Prefix (模型前缀)</option>
            <option value="modelGroup">Model Group (模型分组)</option>
          </select>
        </div>

        <div class="form-group">
          <label>匹配值</label>
          <input
            v-model="localConfig.matchValue"
            type="text"
            :placeholder="
              localConfig.useRegex
                ? '例如: ^o[1-4](-.*)?$, gpt-(4|3\\.5)'
                : '例如: openai, gpt-, claude-opus-4'
            "
          />
        </div>

        <div class="form-group checkbox-group">
          <label>
            <input
              v-model="localConfig.useRegex"
              type="checkbox"
              :disabled="
                localConfig.matchType === 'provider' || localConfig.matchType === 'modelGroup'
              "
            />
            使用正则表达式匹配
            <small
              v-if="localConfig.matchType === 'provider' || localConfig.matchType === 'modelGroup'"
            >
              （此匹配类型不支持正则）
            </small>
          </label>
          <small v-if="localConfig.useRegex">
            启用后，匹配值将作为正则表达式进行匹配。例如：^o[1-4] 可匹配 o1、o2、o3、o4 开头的模型
          </small>
        </div>

        <div class="form-group">
          <label>图标路径</label>
          <div class="input-with-actions">
            <input
              v-model="localConfig.properties!.icon"
              type="text"
              placeholder="例如: /model-icons/openai.svg"
            />
            <button @click="handleSelectFile" class="btn-action">选择文件</button>
            <button @click="$emit('open-presets')" class="btn-action">选择预设</button>
          </div>
          <small>支持相对路径或绝对路径，推荐使用预设图标</small>
        </div>

        <div class="form-group">
          <label>优先级</label>
          <input
            v-model.number="localConfig.priority"
            type="number"
            min="0"
            max="100"
            placeholder="0-100，数字越大优先级越高"
          />
        </div>

        <div class="form-group">
          <label>分组名称</label>
          <input
            v-model="localConfig.properties!.group"
            type="text"
            placeholder="在模型列表中显示的分组名称（可选）"
          />
          <small>
            设置后，匹配此规则的模型将显示在指定分组中，优先级高于模型自身的 group 属性
          </small>
        </div>

        <div class="form-group">
          <label>描述</label>
          <input v-model="localConfig.description" type="text" placeholder="配置说明（可选）" />
        </div>

        <div class="form-group checkbox-group">
          <label>
            <input v-model="localConfig.enabled" type="checkbox" />
            启用此配置
          </label>
        </div>

        <div v-if="localConfig.properties?.icon" class="icon-preview">
          <h4>图标预览</h4>
          <img
            :src="getDisplayIconPath(localConfig.properties.icon)"
            alt="预览"
            @error="handleImageError"
          />
        </div>
      </div>

      <div class="modal-footer">
        <button @click="$emit('close')" class="btn-secondary">取消</button>
        <button @click="handleSave" class="btn-primary">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ModelMetadataRule } from "../../types/model-metadata";
import { createModuleLogger } from "@utils/logger";

interface Props {
  modelValue: Partial<ModelMetadataRule> | null;
  isNew: boolean;
}

interface Emits {
  (e: "update:modelValue", value: Partial<ModelMetadataRule> | null): void;
  (e: "save", config: Partial<ModelMetadataRule>): void;
  (e: "close"): void;
  (e: "open-presets"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const logger = createModuleLogger("ModelIconConfigEditor");

const localConfig = computed({
  get: () => props.modelValue || {},
  set: (value) => emit("update:modelValue", value),
});

function handleSave() {
  if (!props.modelValue) return;

  // 验证必填字段
  if (!props.modelValue.matchValue || !props.modelValue.properties?.icon) {
    alert("请填写匹配值和图标路径");
    return;
  }

  emit("save", props.modelValue);
}

function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = "none";
}

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
    if (typeof selected === "string" && localConfig.value) {
      if (!localConfig.value.properties) {
        localConfig.value.properties = {};
      }
      localConfig.value.properties.icon = selected;
    }
  } catch (error) {
    logger.error("选择本地图标文件失败", error, {
      filters: ["png", "jpg", "jpeg", "svg", "webp", "ico"],
    });
    alert("选择文件失败: " + error);
  }
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
  // Unix/Linux 绝对路径，但排除 /model-icons/ 这种项目内的相对路径
  const isUnixAbsolutePath = iconPath.startsWith("/") && !iconPath.startsWith("/model-icons");

  if (isWindowsAbsolutePath || isUnixAbsolutePath) {
    // 只对真正的本地文件系统绝对路径转换为 Tauri asset URL
    return convertFileSrc(iconPath);
  }

  // 相对路径（包括 /model-icons/ 开头的预设图标）直接返回
  return iconPath;
}
</script>

<style scoped>
/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-color);
  padding: 0;
  width: 2rem;
  height: 2rem;
}

.btn-close:hover {
  color: var(--error-color);
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
}

/* 表单 */
.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.5rem;
  background: var(--input-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: var(--text-color-light);
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: auto;
  margin: 0;
}

.icon-preview {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--input-bg);
  border-radius: 4px;
  text-align: center;
}

.icon-preview h4 {
  margin-top: 0;
  margin-bottom: 0.75rem;
}

.icon-preview img {
  width: 160px;
  height: 160px;
  object-fit: contain;
}

.input-with-actions {
  display: flex;
  gap: 0.5rem;
}

.input-with-actions input {
  flex: 1;
  min-width: 0;
}

.btn-action {
  padding: 0.5rem 1rem;
  background: var(--card-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-action:hover {
  background: var(--border-color);
}

/* 按钮样式 */
.btn-primary,
.btn-secondary {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover-color);
}

.btn-secondary {
  background: var(--card-bg);
  color: var(--text-color);
}

.btn-secondary:hover {
  background: var(--border-color);
}
</style>
