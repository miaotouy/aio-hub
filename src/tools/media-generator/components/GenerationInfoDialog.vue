<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Sparkles, Loader2 } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useRouter } from "vue-router";
import { customMessage } from "@/utils/customMessage";
import { useAssetManager, type Asset } from "@/composables/useAssetManager";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

const props = defineProps<{
  asset: Asset | null;
  data?: any; // 外部传入的初始数据（可选）
}>();

const visible = defineModel<boolean>({ default: false });
const router = useRouter();
const mediaStore = useMediaGenStore();
const { getAssetBasePath } = useAssetManager();

const internalData = ref<any>(null);
const isLoading = ref(false);

// 合并后的数据
const displayData = computed(() => {
  return internalData.value || props.data || {};
});

const hasParams = computed(() => {
  return displayData.value?.params && Object.keys(displayData.value.params).length > 0;
});

const filteredParams = computed(() => {
  if (!displayData.value?.params) return {};
  // 过滤掉已经在上方显示的参数
  const { prompt, negativePrompt, seed, modelId, ...rest } = displayData.value.params;
  return rest;
});

// 加载生成信息
const loadGenerationInfo = async () => {
  if (!props.asset) return;

  // 尝试从衍生数据加载详细信息
  const metadata = props.asset.metadata as any;
  const derivedPath = metadata?.derived?.generation?.path;

  if (!derivedPath) {
    internalData.value = null;
    return;
  }

  isLoading.value = true;
  try {
    const basePath = await getAssetBasePath();
    const fullPath = await join(basePath, derivedPath);
    const content = await readTextFile(fullPath);
    internalData.value = JSON.parse(content);
  } catch (e) {
    console.warn("加载生成信息失败", e);
    internalData.value = null;
  } finally {
    isLoading.value = false;
  }
};

// 监听资产变化
watch(
  () => props.asset,
  () => {
    if (visible.value) {
      loadGenerationInfo();
    }
  },
  { immediate: true }
);

// 监听显示状态
watch(visible, (val) => {
  if (val && !internalData.value) {
    loadGenerationInfo();
  }
});

const handleRemix = async () => {
  if (!displayData.value) return;
  const data = displayData.value;
  visible.value = false;

  // 1. 准备参数还原逻辑
  const type = (data.genType as any) || (props.asset?.type === "image" ? "image" : "video");

  const applyConfig = () => {
    mediaStore.currentConfig.activeType = type;
    const config = mediaStore.currentConfig.types[type as "image" | "video" | "audio"];

    if (config) {
      // 还原基础参数
      config.params = {
        ...config.params,
        ...(data.params || {}),
        prompt: data.prompt || "",
        negativePrompt: data.negativePrompt || "",
        seed: data.seed ?? -1,
      };

      // 还原模型选择 (尝试匹配 profileId:modelId 格式)
      if (data.modelId) {
        config.modelCombo = data.modelId.includes(":")
          ? data.modelId
          : data.profileId
            ? `${data.profileId}:${data.modelId}`
            : data.modelId;
      }

      // 如果有原资产，自动作为参考资产加入附件栏
      if (props.asset) {
        mediaStore.addAsset(props.asset);
      }

      // 填充输入框
      mediaStore.inputPrompt = data.prompt || "";
    }
  };

  // 2. 执行跳转并应用
  if (router.currentRoute.value.path !== "/media-generator") {
    await router.push("/media-generator");
    // 给路由跳转和组件挂载一点缓冲时间
    setTimeout(applyConfig, 100);
  } else {
    applyConfig();
  }

  customMessage.success("已复刻生成参数并添加参考资产");
};
</script>

<template>
  <BaseDialog v-model="visible" title="生成参数信息" width="600px" height="auto" max-height="80vh">
    <div class="generation-info-container">
      <div v-if="isLoading" class="loading-state">
        <el-icon class="is-loading"><Loader2 /></el-icon>
        <span>正在加载生成信息...</span>
      </div>

      <template v-else-if="displayData && Object.keys(displayData).length > 0">
        <div class="info-section">
          <div class="section-title">提示词 (Prompt)</div>
          <div class="content-box prompt-box">{{ displayData.prompt }}</div>
        </div>

        <div class="info-section" v-if="displayData.negativePrompt">
          <div class="section-title">负面提示词 (Negative Prompt)</div>
          <div class="content-box prompt-box negative">{{ displayData.negativePrompt }}</div>
        </div>

        <div
          class="info-section"
          v-if="displayData.revisedPrompt && displayData.revisedPrompt !== displayData.prompt"
        >
          <div class="section-title">优化后提示词 (Revised Prompt)</div>
          <div class="content-box prompt-box revised">{{ displayData.revisedPrompt }}</div>
        </div>

        <div class="info-grid">
          <div class="grid-item">
            <span class="label">模型:</span>
            <span class="value">{{ displayData.modelId }}</span>
          </div>
          <div class="grid-item" v-if="displayData.seed !== undefined">
            <span class="label">种子 (Seed):</span>
            <span class="value">{{ displayData.seed }}</span>
          </div>
        </div>

        <div class="info-section" v-if="hasParams">
          <div class="section-title">其他参数</div>
          <div class="params-list">
            <div v-for="(val, key) in filteredParams" :key="key" class="param-item">
              <span class="p-key">{{ key }}:</span>
              <span class="p-val">{{ val }}</span>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="empty-info">
        <el-empty description="未找到生成参数信息" :image-size="60" />
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">关闭</el-button>
        <el-button
          type="primary"
          @click="handleRemix"
          :icon="Sparkles"
          :disabled="isLoading || !displayData.prompt"
        >
          二次创作 (Remix)
        </el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.generation-info-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px;
  min-height: 200px;
}

.loading-state,
.empty-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
  padding: 40px 0;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  opacity: 0.8;
}

.content-box {
  padding: 12px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.prompt-box {
  color: var(--el-text-color-primary);
}

.prompt-box.negative {
  color: var(--el-color-danger);
  opacity: 0.8;
}

.prompt-box.revised {
  color: var(--el-color-primary);
  border-style: dashed;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.grid-item {
  display: flex;
  gap: 8px;
  font-size: 14px;
}

.label {
  color: var(--el-text-color-secondary);
}

.value {
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
}

.params-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  padding: 12px;
  background-color: var(--input-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.param-item {
  display: flex;
  gap: 4px;
  font-size: 12px;
}

.p-key {
  color: var(--el-text-color-secondary);
}

.p-val {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
