<script setup lang="ts">
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import ServiceSettingsLayout from "./ServiceSettingsLayout.vue";
import { useOcrProfiles } from "../../composables/useOcrProfiles";
import { ocrProviderTypes } from "../../config/ocr-providers";
import type { OcrProfile, OcrProviderType } from "../../types/ocr-profiles";

const { profiles, saveProfile, deleteProfile, toggleProfileEnabled, generateId } = useOcrProfiles();

// 当前选中的配置
const selectedProfileId = ref<string | null>(null);

// 编辑状态
const isEditing = ref(false);
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

// 选择配置
const selectProfile = (profileId: string) => {
  selectedProfileId.value = profileId;
  isEditing.value = false;
};

// 创建新配置
const createNewProfile = () => {
  const defaultProvider = ocrProviderTypes[0];
  editForm.value = {
    id: generateId(),
    name: "",
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
  isEditing.value = true;
  selectedProfileId.value = editForm.value.id;
};

// 编辑现有配置
const editProfile = (profile: OcrProfile) => {
  editForm.value = JSON.parse(JSON.stringify(profile));
  isEditing.value = true;
  selectedProfileId.value = profile.id;
};

// 保存配置
const saveCurrentProfile = () => {
  if (!editForm.value.name.trim()) {
    ElMessage.error("请输入服务名称");
    return;
  }
  if (!editForm.value.endpoint.trim()) {
    ElMessage.error("请输入 API 端点地址");
    return;
  }
  if (!editForm.value.credentials.apiKey?.trim()) {
    ElMessage.error("请输入 API Key");
    return;
  }

  saveProfile(editForm.value);
  isEditing.value = false;
  ElMessage.success("保存成功");
};

// 取消编辑
const cancelEdit = () => {
  if (!profiles.value.find((p) => p.id === editForm.value.id)) {
    // 如果是新建且未保存，取消选中
    selectedProfileId.value = profiles.value[0]?.id || null;
  }
  isEditing.value = false;
};

// 删除配置
const handleDelete = async (profile: OcrProfile) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除服务 "${profile.name}" 吗？此操作不可撤销。`,
      "删除确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
    deleteProfile(profile.id);
    if (selectedProfileId.value === profile.id) {
      selectedProfileId.value = profiles.value[0]?.id || null;
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

// 当服务商类型改变时，更新默认端点
const handleProviderChange = (type: OcrProviderType) => {
  const providerInfo = getProviderTypeInfo(type);
  if (providerInfo) {
    editForm.value.endpoint = providerInfo.defaultEndpoint;
  }
};
</script>

<template>
  <ServiceSettingsLayout
    title="云端 OCR 服务"
    :profiles="profiles"
    :selected-profile-id="selectedProfileId"
    :is-editing="isEditing"
    empty-state-text="还没有配置任何云端 OCR 服务"
    @select="selectProfile"
    @add="createNewProfile"
    @edit="editProfile"
    @delete="handleDelete"
    @toggle="handleToggle"
    @save="saveCurrentProfile"
    @cancel="cancelEdit"
  >
    <!-- 列表项插槽：显示 OCR 特有信息 -->
    <template #list-item="{ profile }">
      <div class="profile-info">
        <div class="profile-name">{{ profile.name }}</div>
        <div class="profile-type">{{ getProviderTypeInfo(profile.provider)?.name }}</div>
      </div>
    </template>

    <!-- 查看内容插槽：显示 OCR 配置详情 -->
    <template #view-content="{ profile }">
      <div v-if="profile" class="ocr-view-content">
        <div class="info-item">
          <label>服务类型</label>
          <span>{{ getProviderTypeInfo(profile.provider)?.name }}</span>
        </div>
        <div class="info-item">
          <label>API 端点</label>
          <span class="monospace">{{ profile.endpoint }}</span>
        </div>
        <div class="info-item">
          <label>API Key</label>
          <span class="masked">{{
            profile.credentials.apiKey ? "••••••••" : "未设置"
          }}</span>
        </div>
        <div v-if="profile.credentials.apiSecret" class="info-item">
          <label>API Secret</label>
          <span class="masked">••••••••</span>
        </div>
        <div class="info-item">
          <label>并发数</label>
          <span>{{ profile.concurrency || 3 }}</span>
        </div>
        <div class="info-item">
          <label>请求延迟</label>
          <span>{{ profile.delay || 0 }} ms</span>
        </div>
        <div class="info-item">
          <label>状态</label>
          <el-tag :type="profile.enabled ? 'success' : 'info'" size="small">
            {{ profile.enabled ? "已启用" : "已禁用" }}
          </el-tag>
        </div>
      </div>
    </template>

    <!-- 编辑表单插槽：OCR 配置编辑 -->
    <template #edit-form>
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
            placeholder="请输入 API Key"
            show-password
          />
        </el-form-item>

        <el-form-item
          v-if="editForm.provider === 'baidu' || editForm.provider === 'custom'"
          label="API Secret"
        >
          <el-input
            v-model="editForm.credentials.apiSecret"
            type="password"
            placeholder="请输入 API Secret（某些服务需要）"
            show-password
          />
          <div class="form-hint">百度云需要 API Secret 来获取 access_token</div>
        </el-form-item>

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
          <div class="form-hint">
            每个请求之间延迟 {{ editForm.delay }}ms，避免触发 API 限流
          </div>
        </el-form-item>
      </el-form>
    </template>
  </ServiceSettingsLayout>
</template>

<style scoped>
/* OCR 特有样式 */

/* 列表项特有样式 */
.profile-type {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 2px;
}

/* 查看内容样式 */
.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color-light);
}

.info-item label {
  font-size: 14px;
  color: var(--text-color-secondary);
  font-weight: 500;
}

.info-item span {
  font-size: 14px;
  color: var(--text-color);
}

.monospace {
  font-family: monospace;
}

.masked {
  font-family: monospace;
  letter-spacing: 2px;
}

/* 编辑表单样式 */
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}

/* 滑块输入框宽度调整 */
:deep(.el-slider .el-input-number) {
  width: 65px;
}
</style>
