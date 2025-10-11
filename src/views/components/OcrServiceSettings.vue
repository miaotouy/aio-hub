<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import ProfileSidebar from "./ProfileSidebar.vue";
import ProfileEditor from "./ProfileEditor.vue";
import CustomOcrRequestEditor from "./CustomOcrRequestEditor.vue";
import { useOcrProfiles } from "../../composables/useOcrProfiles";
import { ocrProviderTypes, ocrPresets } from "../../config/ocr-providers";
import type { OcrProfile, OcrProviderType, OcrApiRequest } from "../../types/ocr-profiles";
import type { OcrPreset } from "../../config/ocr-providers";

const { profiles, saveProfile, deleteProfile, toggleProfileEnabled, generateId, createFromPreset } =
  useOcrProfiles();

// 防抖保存的计时器
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// 当前选中的配置
const selectedProfileId = ref<string | null>(null);

// 预设选择对话框
const showPresetDialog = ref(false);

// 编辑表单
const editForm = ref<OcrProfile>({
  id: "",
  name: "",
  provider: "baidu",
  endpoint: "",
  credentials: {
    apiKey: "",
    apiSecret: "",
  },
  enabled: true,
  concurrency: 3,
  delay: 0,
});

// 计算当前选中的配置
const selectedProfile = computed(() => {
  if (!selectedProfileId.value) return null;
  return profiles.value.find((p) => p.id === selectedProfileId.value) || null;
});

// 选择配置
const selectProfile = (profileId: string) => {
  selectedProfileId.value = profileId;
  const profile = profiles.value.find((p) => p.id === profileId);
  if (profile) {
    editForm.value = JSON.parse(JSON.stringify(profile));
  }
};

// 创建新配置 - 从空白开始
const createNewProfile = () => {
  const defaultProvider = ocrProviderTypes[0];
  editForm.value = {
    id: generateId(),
    name: "新建 OCR 服务",
    provider: defaultProvider.type,
    endpoint: defaultProvider.defaultEndpoint,
    credentials: {
      apiKey: "",
      apiSecret: "",
    },
    enabled: true,
    concurrency: 3,
    delay: 0,
  };
  selectedProfileId.value = editForm.value.id;
};

// 从预设创建配置
const createFromPresetTemplate = (preset: OcrPreset) => {
  editForm.value = createFromPreset(preset);
  selectedProfileId.value = editForm.value.id;
  showPresetDialog.value = false;
};

// 显示创建选项
const handleAddClick = () => {
  showPresetDialog.value = true;
};

// 保存配置（验证并保存）
const saveCurrentProfile = () => {
  // 基础验证：名称必填
  if (!editForm.value.name.trim()) {
    ElMessage.error("请输入服务名称");
    return false;
  }

  // 对于非自定义类型，端点必填
  if (editForm.value.provider !== "custom" && !editForm.value.endpoint.trim()) {
    ElMessage.error("请输入 API 端点地址");
    return false;
  }

  // 对于自定义类型，验证 apiRequest
  if (editForm.value.provider === "custom") {
    if (!editForm.value.apiRequest) {
      ElMessage.error("请配置自定义 API 请求");
      return false;
    }
    if (!editForm.value.apiRequest.urlTemplate.trim()) {
      ElMessage.error("请输入 API URL 地址");
      return false;
    }
    if (!editForm.value.apiRequest.resultPath.trim()) {
      ElMessage.error("请输入结果提取路径");
      return false;
    }
  }

  saveProfile(editForm.value);
  return true;
};

// 防抖自动保存
const autoSave = () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    if (saveCurrentProfile()) {
      // 静默保存，不显示成功提示
    }
  }, 1000); // 1秒防抖
};

// 监听表单变化，自动保存
watch(
  () => editForm.value,
  () => {
    // 只有在选中了配置时才自动保存
    if (selectedProfileId.value) {
      autoSave();
    }
  },
  { deep: true }
);

// 删除配置
const handleDelete = async () => {
  if (!selectedProfile.value) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除服务 "${selectedProfile.value.name}" 吗？此操作不可撤销。`,
      "删除确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
    deleteProfile(selectedProfile.value.id);
    selectedProfileId.value = profiles.value[0]?.id || null;
    if (selectedProfileId.value) {
      selectProfile(selectedProfileId.value);
    }
    ElMessage.success("删除成功");
  } catch {
    // 用户取消
  }
};

// 切换启用状态
const handleToggle = (profile: OcrProfile) => {
  toggleProfileEnabled(profile.id);
};

// 获取提供商类型信息
const getProviderTypeInfo = (type: OcrProviderType) => {
  return ocrProviderTypes.find((p) => p.type === type);
};

// 当服务商类型改变时，更新默认端点并初始化自定义配置
const handleProviderChange = (type: OcrProviderType) => {
  const providerInfo = getProviderTypeInfo(type);
  if (providerInfo) {
    editForm.value.endpoint = providerInfo.defaultEndpoint;
  }

  // 如果切换到自定义类型，初始化 apiRequest
  if (type === "custom" && !editForm.value.apiRequest) {
    editForm.value.apiRequest = createDefaultApiRequest();
  }
};

// 创建默认的 API 请求配置
const createDefaultApiRequest = (): OcrApiRequest => {
  return {
    urlTemplate: "https://api.example.com/ocr",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    bodyTemplate: JSON.stringify(
      {
        image: "{{imageBase64}}",
      },
      null,
      2
    ),
    variables: [],
    resultPath: "data.text",
  };
};
</script>

<template>
  <div class="ocr-settings-page">
    <div class="settings-layout">
      <!-- 左侧：服务列表 -->
      <ProfileSidebar
        title="云端 OCR 服务"
        :profiles="profiles"
        :selected-id="selectedProfileId"
        @select="selectProfile"
        @add="handleAddClick"
        @toggle="handleToggle"
      >
        <template #item="{ profile }">
          <div class="profile-info">
            <img
              v-if="getProviderTypeInfo(profile.provider)?.icon"
              :src="getProviderTypeInfo(profile.provider)?.icon"
              class="provider-icon"
              alt=""
            />
            <div class="profile-text">
              <div class="profile-name">{{ profile.name }}</div>
              <div class="profile-type">{{ getProviderTypeInfo(profile.provider)?.name }}</div>
            </div>
          </div>
        </template>
      </ProfileSidebar>

      <!-- 右侧：配置编辑 -->
      <ProfileEditor
        v-if="selectedProfile"
        :title="selectedProfile.name"
        :show-save="false"
        @delete="handleDelete"
      >
        <el-form :model="editForm" label-width="100px" label-position="left">
          <el-form-item label="服务名称">
            <el-input
              v-model="editForm.name"
              placeholder="例如: 我的百度云 OCR"
              maxlength="50"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="服务类型">
            <el-select
              v-model="editForm.provider"
              style="width: 100%"
              @change="handleProviderChange"
            >
              <el-option
                v-for="provider in ocrProviderTypes"
                :key="provider.type"
                :label="provider.name"
                :value="provider.type"
              >
                <div>
                  <div>{{ provider.name }}</div>
                  <div style="font-size: 12px; color: var(--el-text-color-secondary)">
                    {{ provider.description }}
                  </div>
                </div>
              </el-option>
            </el-select>
          </el-form-item>

          <!-- 标准服务商配置 -->
          <template v-if="editForm.provider !== 'custom'">
            <el-form-item label="API 端点">
              <el-input v-model="editForm.endpoint" placeholder="https://api.example.com/ocr" />
              <div class="form-hint">
                默认: {{ getProviderTypeInfo(editForm.provider)?.defaultEndpoint }}
              </div>
            </el-form-item>

            <el-form-item label="API Key">
              <el-input
                v-model="editForm.credentials.apiKey"
                type="password"
                placeholder="可选，某些服务可能不需要"
                show-password
              />
            </el-form-item>

            <el-form-item v-if="editForm.provider === 'baidu'" label="API Secret">
              <el-input
                v-model="editForm.credentials.apiSecret"
                type="password"
                placeholder="请输入 API Secret"
                show-password
              />
              <div class="form-hint">百度云需要 API Secret 来获取 access_token</div>
            </el-form-item>
          </template>

          <!-- 自定义服务配置 -->
          <template v-else>
            <el-divider content-position="left">
              <span style="font-size: 14px; font-weight: 600">自定义 API 配置</span>
            </el-divider>
            <CustomOcrRequestEditor v-if="editForm.apiRequest" v-model="editForm.apiRequest" />
          </template>

          <el-divider />

          <el-form-item label="并发数">
            <el-slider
              v-model="editForm.concurrency"
              :min="1"
              :max="10"
              :step="1"
              show-input
              :show-input-controls="false"
            />
            <div class="form-hint">同时处理 {{ editForm.concurrency }} 个图片块</div>
          </el-form-item>

          <el-form-item label="请求延迟">
            <el-slider
              v-model="editForm.delay"
              :min="0"
              :max="5000"
              :step="100"
              show-input
              :show-input-controls="false"
            />
            <div class="form-hint">每个请求之间延迟 {{ editForm.delay }}ms，避免触发 API 限流</div>
          </el-form-item>
        </el-form>
      </ProfileEditor>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <p>请选择或创建一个云端 OCR 服务配置</p>
      </div>
    </div>

    <!-- 预设选择对话框 -->
    <el-dialog v-model="showPresetDialog" title="选择创建方式" width="600px">
      <div class="preset-options">
        <div class="preset-section">
          <h4>从预设模板创建</h4>
          <div class="preset-grid">
            <div
              v-for="preset in ocrPresets"
              :key="preset.name"
              class="preset-card"
              @click="createFromPresetTemplate(preset)"
            >
              <div class="preset-icon">
                <img v-if="preset.icon" :src="preset.icon" :alt="preset.name" />
                <div v-else class="preset-placeholder">{{ preset.name.charAt(0) }}</div>
              </div>
              <div class="preset-info">
                <div class="preset-name">{{ preset.name }}</div>
                <div class="preset-desc">{{ preset.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <el-divider />

        <div class="preset-section">
          <h4>或者</h4>
          <el-button
            style="width: 100%"
            @click="
              () => {
                createNewProfile();
                showPresetDialog = false;
              }
            "
          >
            从空白创建
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.ocr-settings-page {
  flex: 1;
  display: flex;
  padding: 20px;
  box-sizing: border-box;
  min-height: 0;
}

.settings-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  flex: 1;
}

.empty-state {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  flex: 1;
}

/* 列表项样式 */
.profile-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.provider-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  object-fit: contain;
}

.profile-text {
  flex: 1;
  min-width: 0;
}

.profile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-type {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表单提示 */
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}

/* 滑块输入框宽度调整 */
:deep(.el-slider .el-input-number) {
  width: 65px;
}

/* 预设选择对话框 */
.preset-options {
  padding: 10px 0;
}

.preset-section {
  margin-bottom: 20px;
}

.preset-section h4 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.preset-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-card:hover {
  border-color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.05);
}

.preset-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  overflow: hidden;
}

.preset-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preset-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-color);
  color: white;
  font-size: 18px;
  font-weight: bold;
}

.preset-info {
  flex: 1;
  min-width: 0;
}

.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.preset-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Divider 样式 */
:deep(.el-divider__text) {
  background-color: var(--card-bg);
}
</style>
