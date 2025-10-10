<script setup lang="ts">
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus, Delete, Edit } from "@element-plus/icons-vue";
import ServiceSettingsLayout from "./ServiceSettingsLayout.vue";
import { useLlmProfiles } from "../../composables/useLlmProfiles";
import { providerTypes, llmPresets } from "../../config/llm-providers";
import type { LlmProfile, LlmModelInfo, ProviderType } from "../../types/llm-profiles";
import type { LlmPreset } from "../../config/llm-providers";

const { profiles, saveProfile, deleteProfile, toggleProfileEnabled, generateId, createFromPreset } =
  useLlmProfiles();

// 当前选中的配置
const selectedProfileId = ref<string | null>(null);

// 编辑状态
const isEditing = ref(false);
const editForm = ref<LlmProfile>({
  id: "",
  name: "",
  type: "openai",
  baseUrl: "",
  apiKeys: [],
  enabled: true,
  models: [],
});

// 模型编辑
const modelEditForm = ref<LlmModelInfo>({
  id: "",
  name: "",
  group: "",
  isVision: false,
});
const showModelDialog = ref(false);
const editingModelIndex = ref<number>(-1);

// API Key 输入处理
const apiKeyInput = ref("");

// 将逗号分隔的 API Key 字符串转换为数组
const updateApiKeys = () => {
  const keys = apiKeyInput.value
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  editForm.value.apiKeys = keys;
};

// 选择配置
const selectProfile = (profileId: string) => {
  selectedProfileId.value = profileId;
  isEditing.value = false;
};

// 预设选择对话框
const showPresetDialog = ref(false);

// 创建新配置 - 从空白开始
const createNewProfile = () => {
  editForm.value = {
    id: generateId(),
    name: "",
    type: "openai",
    baseUrl: "https://api.openai.com",
    apiKeys: [],
    enabled: true,
    models: [],
  };
  isEditing.value = true;
  selectedProfileId.value = editForm.value.id;
};

// 从预设创建配置
const createFromPresetTemplate = (preset: LlmPreset) => {
  editForm.value = createFromPreset(preset);
  apiKeyInput.value = ""; // 清空 API Key 输入
  isEditing.value = true;
  selectedProfileId.value = editForm.value.id;
  showPresetDialog.value = false;
};

// 显示创建选项
const handleAddClick = () => {
  showPresetDialog.value = true;
};

// 编辑现有配置
const editProfile = (profile: LlmProfile) => {
  editForm.value = JSON.parse(JSON.stringify(profile));
  // 将 apiKeys 数组转换为逗号分隔的字符串以便编辑
  apiKeyInput.value = profile.apiKeys.join(", ");
  isEditing.value = true;
  selectedProfileId.value = profile.id;
};

// 保存配置
const saveCurrentProfile = () => {
  if (!editForm.value.name.trim()) {
    ElMessage.error("请输入渠道名称");
    return;
  }
  if (!editForm.value.baseUrl.trim()) {
    ElMessage.error("请输入 API 地址");
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
const handleDelete = async (profile: LlmProfile) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除渠道 "${profile.name}" 吗？此操作不可撤销。`,
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
const handleToggle = (profile: LlmProfile) => {
  toggleProfileEnabled(profile.id);
};

// 获取提供商类型信息
const getProviderTypeInfo = (type: ProviderType) => {
  return providerTypes.find((p) => p.type === type);
};

// 模型管理
const addModel = () => {
  modelEditForm.value = {
    id: "",
    name: "",
    group: "",
    isVision: false,
  };
  editingModelIndex.value = -1;
  showModelDialog.value = true;
};

const editModel = (index: number) => {
  modelEditForm.value = { ...editForm.value.models[index] };
  editingModelIndex.value = index;
  showModelDialog.value = true;
};

const saveModel = () => {
  if (!modelEditForm.value.id.trim()) {
    ElMessage.error("请输入模型 ID");
    return;
  }
  if (!modelEditForm.value.name.trim()) {
    ElMessage.error("请输入模型名称");
    return;
  }

  if (editingModelIndex.value === -1) {
    // 新增
    editForm.value.models.push({ ...modelEditForm.value });
  } else {
    // 编辑
    editForm.value.models[editingModelIndex.value] = { ...modelEditForm.value };
  }
  showModelDialog.value = false;
};

const deleteModel = (index: number) => {
  editForm.value.models.splice(index, 1);
};

// 从 API 获取模型列表（TODO: 实现）
const fetchModels = async () => {
  ElMessage.info("自动获取模型列表功能开发中...");
};
</script>

<template>
  <ServiceSettingsLayout
    title="LLM 服务"
    :profiles="profiles"
    :selected-profile-id="selectedProfileId"
    :is-editing="isEditing"
    empty-state-text="还没有配置任何 LLM 服务"
    @select="selectProfile"
    @add="handleAddClick"
    @edit="editProfile"
    @delete="handleDelete"
    @toggle="handleToggle"
    @save="saveCurrentProfile"
    @cancel="cancelEdit"
  >
    <!-- 列表项插槽：显示 LLM 特有信息 -->
    <template #list-item="{ profile }">
      <div class="profile-info">
        <div class="profile-name">{{ profile.name }}</div>
        <div class="profile-type">{{ getProviderTypeInfo(profile.type)?.name }}</div>
        <div class="profile-models">{{ profile.models.length }} 个模型</div>
      </div>
    </template>

    <!-- 查看内容插槽：显示 LLM 配置详情 -->
    <template #view-content="{ profile }">
      <div v-if="profile" class="llm-view-content">
        <div class="info-item">
          <label>服务类型</label>
          <span>{{ getProviderTypeInfo(profile.type)?.name }}</span>
        </div>
        <div class="info-item">
          <label>API 地址</label>
          <span class="monospace">{{ profile.baseUrl }}</span>
        </div>
        <div class="info-item">
          <label>API Key</label>
          <span class="masked">{{
            profile.apiKeys.length ? `${profile.apiKeys.length} 个密钥` : "未设置"
          }}</span>
        </div>
        <div class="info-item">
          <label>状态</label>
          <el-tag :type="profile.enabled ? 'success' : 'info'" size="small">
            {{ profile.enabled ? "已启用" : "已禁用" }}
          </el-tag>
        </div>

        <el-divider />

        <div class="models-section">
          <h4>已配置模型 ({{ profile.models.length }})</h4>
          <div class="models-list">
            <div v-for="model in profile.models" :key="model.id" class="model-card">
              <div class="model-info">
                <div class="model-name">{{ model.name }}</div>
                <div class="model-id">{{ model.id }}</div>
                <div v-if="model.group" class="model-group">分组: {{ model.group }}</div>
              </div>
              <el-tag v-if="model.isVision" type="success" size="small">VLM</el-tag>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 编辑表单插槽：LLM 配置编辑 -->
    <template #edit-form>
      <el-form :model="editForm" label-width="100px" label-position="left">
        <el-form-item label="渠道名称">
          <el-input
            v-model="editForm.name"
            placeholder="例如: 我的 OpenAI"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="服务类型">
          <el-select v-model="editForm.type" style="width: 100%">
            <el-option
              v-for="provider in providerTypes"
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

        <el-form-item label="API 地址">
          <el-input v-model="editForm.baseUrl" placeholder="https://api.openai.com" />
          <div class="form-hint">
            默认: {{ getProviderTypeInfo(editForm.type)?.defaultBaseUrl }}
          </div>
        </el-form-item>

        <el-form-item label="API Key">
          <el-input
            v-model="apiKeyInput"
            type="password"
            placeholder="可选,某些服务可能不需要。多个密钥用逗号分隔"
            show-password
            @blur="updateApiKeys"
          />
          <div v-if="editForm.apiKeys.length > 0" class="form-hint">
            已配置 {{ editForm.apiKeys.length }} 个密钥
          </div>
        </el-form-item>

        <el-divider />

        <el-form-item label="模型配置">
          <div class="models-editor">
            <div class="models-header">
              <span>已添加 {{ editForm.models.length }} 个模型</span>
              <div class="models-actions">
                <el-button
                  v-if="getProviderTypeInfo(editForm.type)?.supportsModelList"
                  size="small"
                  @click="fetchModels"
                >
                  从 API 获取
                </el-button>
                <el-button type="primary" size="small" :icon="Plus" @click="addModel">
                  手动添加
                </el-button>
              </div>
            </div>

            <div class="models-list">
              <div
                v-for="(model, index) in editForm.models"
                :key="index"
                class="model-edit-item"
              >
                <div class="model-info">
                  <div class="model-name">{{ model.name }}</div>
                  <div class="model-id">{{ model.id }}</div>
                  <div v-if="model.group" class="model-group">{{ model.group }}</div>
                </div>
                <div class="model-badges">
                  <el-tag v-if="model.isVision" type="success" size="small">VLM</el-tag>
                </div>
                <div class="model-actions">
                  <el-button size="small" :icon="Edit" @click="editModel(index)" />
                  <el-button
                    size="small"
                    type="danger"
                    :icon="Delete"
                    @click="deleteModel(index)"
                  />
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
    </template>

    <!-- 对话框插槽：预设选择和模型编辑对话框 -->
    <template #dialogs>
      <!-- 预设选择对话框 -->
      <el-dialog v-model="showPresetDialog" title="选择创建方式" width="600px">
        <div class="preset-options">
          <div class="preset-section">
            <h4>从预设模板创建</h4>
            <div class="preset-grid">
              <div
                v-for="preset in llmPresets"
                :key="preset.name"
                class="preset-card"
                @click="createFromPresetTemplate(preset)"
              >
                <div class="preset-icon">
                  <img v-if="preset.logoUrl" :src="preset.logoUrl" :alt="preset.name" />
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

      <!-- 模型编辑对话框 -->
      <el-dialog
        v-model="showModelDialog"
        :title="editingModelIndex === -1 ? '添加模型' : '编辑模型'"
        width="500px"
      >
        <el-form :model="modelEditForm" label-width="80px">
          <el-form-item label="模型 ID">
            <el-input v-model="modelEditForm.id" placeholder="例如: gpt-4o" />
          </el-form-item>
          <el-form-item label="显示名称">
            <el-input v-model="modelEditForm.name" placeholder="例如: GPT-4o" />
          </el-form-item>
          <el-form-item label="分组">
            <el-input v-model="modelEditForm.group" placeholder="可选，例如: GPT-4 系列" />
          </el-form-item>
          <el-form-item label="视觉模型">
            <el-switch v-model="modelEditForm.isVision" />
            <div class="form-hint">是否为支持图像输入的视觉语言模型 (VLM)</div>
          </el-form-item>
        </el-form>

        <template #footer>
          <el-button @click="showModelDialog = false">取消</el-button>
          <el-button type="primary" @click="saveModel">确定</el-button>
        </template>
      </el-dialog>
    </template>
  </ServiceSettingsLayout>
</template>

<style scoped>
/* LLM 特有样式 */

/* 列表项特有样式 */
.profile-type {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 2px;
}

.profile-models {
  font-size: 11px;
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

.models-section {
  margin-top: 20px;
}

.models-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
}

.models-list {
  display: grid;
  gap: 8px;
}

.model-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 6px;
  border: 1px solid var(--border-color-light);
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.model-id {
  font-size: 12px;
  color: var(--text-color-secondary);
  font-family: monospace;
  margin-top: 2px;
}

.model-group {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 2px;
}

/* 编辑表单样式 */
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}

.models-editor {
  width: 100%;
}

.models-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.models-actions {
  display: flex;
  gap: 8px;
}

.model-edit-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 6px;
  border: 1px solid var(--border-color-light);
  margin-bottom: 8px;
}

.model-edit-item .model-info {
  flex: 1;
}

.model-badges {
  display: flex;
  gap: 4px;
}

.model-actions {
  display: flex;
  gap: 4px;
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
</style>
