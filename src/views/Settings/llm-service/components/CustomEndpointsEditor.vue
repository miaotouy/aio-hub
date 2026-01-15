<script setup lang="ts">
import { ref, watch } from "vue";
import { InfoFilled } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import type { LlmProfile } from "@/types/llm-profiles";

type CustomEndpoints = NonNullable<LlmProfile["customEndpoints"]>;

interface Props {
  visible: boolean;
  modelValue?: CustomEndpoints;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "update:modelValue", value: CustomEndpoints): void;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  modelValue: () => ({}),
});

const emit = defineEmits<Emits>();

// 临时编辑状态
const tempEndpoints = ref<Partial<CustomEndpoints>>({});

// 初始化临时编辑状态
function initTempEndpoints() {
  tempEndpoints.value = { ...(props.modelValue || {}) };
}

// 监听弹窗打开
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      initTempEndpoints();
    }
  },
  { immediate: true }
);

// 确认保存
function handleConfirm() {
  // 清理空字符串
  const result: CustomEndpoints = {};
  (Object.keys(tempEndpoints.value) as Array<keyof CustomEndpoints>).forEach((key) => {
    const val = tempEndpoints.value[key];
    if (val && val.trim()) {
      result[key] = val.trim();
    }
  });

  emit("update:modelValue", result);
  emit("update:visible", false);
  customMessage.success("高级端点配置已保存");
}

// 取消
function handleCancel() {
  emit("update:visible", false);
}

// 重置
function handleReset() {
  tempEndpoints.value = {};
}
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    title="高级 API 端点配置"
    width="800px"
    height="80vh"
    :close-on-backdrop-click="false"
  >
    <template #content>
      <div class="custom-endpoints-editor">
        <div class="info-alert">
          <el-icon><InfoFilled /></el-icon>
          <div class="alert-content">
            <p>在这里你可以为不同的 API 功能指定自定义路径或完整的 URL。</p>
            <ul>
              <li>
                如果填写<strong>相对路径</strong>（如
                <code>/v1/chat/completions</code>），将拼接到基础地址。
              </li>
              <li>
                如果填写<strong>完整 URL</strong>（以 <code>http</code> 开头），将直接使用该地址。
              </li>
              <li>留空则使用系统默认计算的端点。</li>
            </ul>
          </div>
        </div>

        <el-form :model="tempEndpoints" label-width="160px" label-position="left">
          <el-divider content-position="left">核心功能</el-divider>
          <el-form-item label="聊天补全 (Chat)">
            <el-input
              v-model="tempEndpoints.chatCompletions"
              placeholder="/v1/chat/completions"
              clearable
            />
          </el-form-item>
          <el-form-item label="文本补全 (Completions)">
            <el-input v-model="tempEndpoints.completions" placeholder="/v1/completions" clearable />
          </el-form-item>
          <el-form-item label="模型列表 (Models)">
            <el-input v-model="tempEndpoints.models" placeholder="/v1/models" clearable />
          </el-form-item>
          <el-form-item label="嵌入 (Embeddings)">
            <el-input v-model="tempEndpoints.embeddings" placeholder="/v1/embeddings" clearable />
          </el-form-item>

          <el-divider content-position="left">图像功能 (Images)</el-divider>
          <el-form-item label="图像生成">
            <el-input
              v-model="tempEndpoints.imagesGenerations"
              placeholder="/v1/images/generations"
              clearable
            />
          </el-form-item>
          <el-form-item label="图像编辑">
            <el-input
              v-model="tempEndpoints.imagesEdits"
              placeholder="/v1/images/edits"
              clearable
            />
          </el-form-item>
          <el-form-item label="图像变体">
            <el-input
              v-model="tempEndpoints.imagesVariations"
              placeholder="/v1/images/variations"
              clearable
            />
          </el-form-item>

          <el-divider content-position="left">音频功能 (Audio)</el-divider>
          <el-form-item label="语音合成 (TTS)">
            <el-input
              v-model="tempEndpoints.audioSpeech"
              placeholder="/v1/audio/speech"
              clearable
            />
          </el-form-item>
          <el-form-item label="语音转文字 (STT)">
            <el-input
              v-model="tempEndpoints.audioTranscriptions"
              placeholder="/v1/audio/transcriptions"
              clearable
            />
          </el-form-item>
          <el-form-item label="语音翻译">
            <el-input
              v-model="tempEndpoints.audioTranslations"
              placeholder="/v1/audio/translations"
              clearable
            />
          </el-form-item>

          <el-divider content-position="left">视频与高级功能</el-divider>
          <el-form-item label="视频生成 (Videos)">
            <el-input v-model="tempEndpoints.videos" placeholder="/v1/videos" clearable />
          </el-form-item>
          <el-form-item label="视频状态查询">
            <el-input
              v-model="tempEndpoints.videoStatus"
              placeholder="/v1/videos/{video_id}"
              clearable
            />
            <div class="field-hint">支持 <code>{video_id}</code> 占位符替换</div>
          </el-form-item>
          <el-form-item label="重排 (Rerank)">
            <el-input v-model="tempEndpoints.rerank" placeholder="/v1/rerank" clearable />
          </el-form-item>

          <el-divider content-position="left">其他</el-divider>
          <el-form-item label="内容审查">
            <el-input v-model="tempEndpoints.moderations" placeholder="/v1/moderations" clearable />
          </el-form-item>
        </el-form>
      </div>
    </template>

    <template #footer>
      <div class="footer-actions">
        <el-button @click="handleReset">清空全部</el-button>
        <div class="spacer"></div>
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleConfirm">确定</el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.custom-endpoints-editor {
  padding: 4px;
}

.info-alert {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-8);
  border-radius: 8px;
  margin-bottom: 24px;
  color: var(--el-text-color-primary);
}

.info-alert .el-icon {
  font-size: 20px;
  color: var(--el-color-primary);
  margin-top: 2px;
}

.alert-content p {
  margin: 0 0 8px 0;
  font-weight: 600;
}

.alert-content ul {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.alert-content li {
  margin: 4px 0;
}

.field-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.footer-actions {
  display: flex;
  width: 100%;
}

.spacer {
  flex: 1;
}

:deep(.el-divider__text) {
  background-color: var(--bg-color);
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>
