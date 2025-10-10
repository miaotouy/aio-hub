<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import ProfileSidebar from "./ProfileSidebar.vue";
import ProfileEditor from "./ProfileEditor.vue";
import ModelList from "./ModelList.vue";
import { useLlmProfiles } from "../../composables/useLlmProfiles";
import { providerTypes, llmPresets } from "../../config/llm-providers";
import type { LlmProfile, LlmModelInfo, ProviderType } from "../../types/llm-profiles";
import type { LlmPreset } from "../../config/llm-providers";

const { profiles, saveProfile, deleteProfile, toggleProfileEnabled, generateId, createFromPreset } =
  useLlmProfiles();

// 当前选中的配置
const selectedProfileId = ref<string | null>(null);

// 编辑表单
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

// 预设选择对话框
const showPresetDialog = ref(false);

// 计算当前选中的配置
const selectedProfile = computed(() => {
  if (!selectedProfileId.value) return null;
  return profiles.value.find((p) => p.id === selectedProfileId.value) || null;
});

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
  const profile = profiles.value.find((p) => p.id === profileId);
  if (profile) {
    editForm.value = JSON.parse(JSON.stringify(profile));
    apiKeyInput.value = profile.apiKeys.join(", ");
  }
};

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
  apiKeyInput.value = "";
  selectedProfileId.value = editForm.value.id;
};

// 从预设创建配置
const createFromPresetTemplate = (preset: LlmPreset) => {
  editForm.value = createFromPreset(preset);
  apiKeyInput.value = "";
  selectedProfileId.value = editForm.value.id;
  showPresetDialog.value = false;
};

// 显示创建选项
const handleAddClick = () => {
  showPresetDialog.value = true;
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
  ElMessage.success("保存成功");
};

// 删除配置
const handleDelete = async () => {
  if (!selectedProfile.value) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除渠道 "${selectedProfile.value.name}" 吗？此操作不可撤销。`,
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
  <div class="llm-settings-page">
    <div class="settings-layout">
      <!-- 左侧：渠道列表 -->
      <ProfileSidebar
        title="LLM 服务"
        :profiles="profiles"
        :selected-id="selectedProfileId"
        @select="selectProfile"
        @add="handleAddClick"
        @toggle="handleToggle"
      >
        <template #item="{ profile }">
          <div class="profile-info">
            <div class="profile-name">{{ profile.name }}</div>
            <div class="profile-type">{{ getProviderTypeInfo(profile.type)?.name }}</div>
            <div class="profile-models">{{ profile.models.length }} 个模型</div>
          </div>
        </template>
      </ProfileSidebar>

      <!-- 右侧：配置编辑 -->
      <ProfileEditor
        v-if="selectedProfile"
        :title="selectedProfile.name"
        @save="saveCurrentProfile"
        @delete="handleDelete"
      >
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
            <ModelList
              :models="editForm.models"
              @add="addModel"
              @edit="editModel"
              @delete="deleteModel"
              @fetch="fetchModels"
            />
          </el-form-item>
        </el-form>
      </ProfileEditor>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <p>请选择或创建一个 LLM 服务配置</p>
      </div>
    </div>

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
  </div>
</template>

<style scoped>
.llm-settings-page {
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

/* 表单提示 */
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
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
