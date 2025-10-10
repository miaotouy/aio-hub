<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete, Edit, Check, Close } from '@element-plus/icons-vue';
import { useLlmProfiles } from '../../composables/useLlmProfiles';
import { providerTypes } from '../../config/llm-providers';
import type { LlmProfile, LlmModelInfo, ProviderType } from '../../types/llm-profiles';

const {
  profiles,
  saveProfile,
  deleteProfile,
  toggleProfileEnabled,
  generateId,
} = useLlmProfiles();

// 当前选中的配置
const selectedProfileId = ref<string | null>(null);
const selectedProfile = computed(() => {
  if (!selectedProfileId.value) return null;
  return profiles.value.find(p => p.id === selectedProfileId.value) || null;
});

// 编辑状态
const isEditing = ref(false);
const editForm = ref<LlmProfile>({
  id: '',
  name: '',
  type: 'openai',
  baseUrl: '',
  apiKey: '',
  enabled: true,
  models: [],
});

// 模型编辑
const modelEditForm = ref<LlmModelInfo>({
  id: '',
  name: '',
  group: '',
  isVision: false,
});
const showModelDialog = ref(false);
const editingModelIndex = ref<number>(-1);

// 选择配置
const selectProfile = (profileId: string) => {
  selectedProfileId.value = profileId;
  isEditing.value = false;
};

// 创建新配置
const createNewProfile = () => {
  editForm.value = {
    id: generateId(),
    name: '',
    type: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    enabled: true,
    models: [],
  };
  isEditing.value = true;
  selectedProfileId.value = editForm.value.id;
};

// 编辑现有配置
const editProfile = (profile: LlmProfile) => {
  editForm.value = JSON.parse(JSON.stringify(profile));
  isEditing.value = true;
  selectedProfileId.value = profile.id;
};

// 保存配置
const saveCurrentProfile = () => {
  if (!editForm.value.name.trim()) {
    ElMessage.error('请输入渠道名称');
    return;
  }
  if (!editForm.value.baseUrl.trim()) {
    ElMessage.error('请输入 API 地址');
    return;
  }

  saveProfile(editForm.value);
  isEditing.value = false;
  ElMessage.success('保存成功');
};

// 取消编辑
const cancelEdit = () => {
  if (!profiles.value.find(p => p.id === editForm.value.id)) {
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
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    deleteProfile(profile.id);
    if (selectedProfileId.value === profile.id) {
      selectedProfileId.value = profiles.value[0]?.id || null;
    }
    ElMessage.success('删除成功');
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
  return providerTypes.find(p => p.type === type);
};

// 模型管理
const addModel = () => {
  modelEditForm.value = {
    id: '',
    name: '',
    group: '',
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
    ElMessage.error('请输入模型 ID');
    return;
  }
  if (!modelEditForm.value.name.trim()) {
    ElMessage.error('请输入模型名称');
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
  ElMessage.info('自动获取模型列表功能开发中...');
};
</script>

<template>
  <div class="llm-service-settings">
    <div class="settings-layout">
      <!-- 左侧：配置列表 -->
      <div class="profile-list">
        <div class="list-header">
          <h3>LLM 服务</h3>
          <el-button
            type="primary"
            :icon="Plus"
            size="small"
            @click="createNewProfile"
          >
            添加
          </el-button>
        </div>

        <div class="list-content">
          <div
            v-for="profile in profiles"
            :key="profile.id"
            class="profile-item"
            :class="{ active: selectedProfileId === profile.id }"
            @click="selectProfile(profile.id)"
          >
            <div class="profile-info">
              <div class="profile-name">{{ profile.name }}</div>
              <div class="profile-type">{{ getProviderTypeInfo(profile.type)?.name }}</div>
              <div class="profile-models">{{ profile.models.length }} 个模型</div>
            </div>
            <el-switch
              :model-value="profile.enabled"
              size="small"
              @click.stop
              @change="handleToggle(profile)"
            />
          </div>

          <div v-if="profiles.length === 0" class="empty-state">
            <p>还没有配置任何 LLM 服务</p>
            <p class="hint">点击上方"添加"按钮开始配置</p>
          </div>
        </div>
      </div>

      <!-- 右侧：配置详情 -->
      <div class="profile-detail">
        <div v-if="!selectedProfile && !isEditing" class="empty-detail">
          <p>请选择或创建一个 LLM 服务配置</p>
        </div>

        <div v-else class="detail-content">
          <!-- 查看模式 -->
          <div v-if="!isEditing" class="view-mode">
            <div class="detail-header">
              <h3>{{ selectedProfile?.name }}</h3>
              <div class="header-actions">
                <el-button
                  type="primary"
                  :icon="Edit"
                  size="small"
                  @click="editProfile(selectedProfile!)"
                >
                  编辑
                </el-button>
                <el-button
                  type="danger"
                  :icon="Delete"
                  size="small"
                  @click="handleDelete(selectedProfile!)"
                >
                  删除
                </el-button>
              </div>
            </div>

            <div class="detail-body">
              <div class="info-item">
                <label>服务类型</label>
                <span>{{ getProviderTypeInfo(selectedProfile!.type)?.name }}</span>
              </div>
              <div class="info-item">
                <label>API 地址</label>
                <span class="monospace">{{ selectedProfile?.baseUrl }}</span>
              </div>
              <div class="info-item">
                <label>API Key</label>
                <span class="masked">{{ selectedProfile?.apiKey ? '••••••••' : '未设置' }}</span>
              </div>
              <div class="info-item">
                <label>状态</label>
                <el-tag :type="selectedProfile?.enabled ? 'success' : 'info'" size="small">
                  {{ selectedProfile?.enabled ? '已启用' : '已禁用' }}
                </el-tag>
              </div>

              <el-divider />

              <div class="models-section">
                <h4>已配置模型 ({{ selectedProfile?.models.length }})</h4>
                <div class="models-list">
                  <div
                    v-for="model in selectedProfile?.models"
                    :key="model.id"
                    class="model-card"
                  >
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
          </div>

          <!-- 编辑模式 -->
          <div v-else class="edit-mode">
            <div class="detail-header">
              <h3>{{ editForm.id === selectedProfile?.id ? '编辑配置' : '新建配置' }}</h3>
              <div class="header-actions">
                <el-button :icon="Check" type="primary" size="small" @click="saveCurrentProfile">
                  保存
                </el-button>
                <el-button :icon="Close" size="small" @click="cancelEdit">
                  取消
                </el-button>
              </div>
            </div>

            <div class="detail-body">
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
                  <el-input
                    v-model="editForm.baseUrl"
                    placeholder="https://api.openai.com"
                  />
                  <div class="form-hint">
                    默认: {{ getProviderTypeInfo(editForm.type)?.defaultBaseUrl }}
                  </div>
                </el-form-item>

                <el-form-item label="API Key">
                  <el-input
                    v-model="editForm.apiKey"
                    type="password"
                    placeholder="可选,某些服务可能不需要"
                    show-password
                  />
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
                          <el-button
                            size="small"
                            :icon="Edit"
                            @click="editModel(index)"
                          />
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
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 模型编辑对话框 -->
    <el-dialog
      v-model="showModelDialog"
      :title="editingModelIndex === -1 ? '添加模型' : '编辑模型'"
      width="500px"
    >
      <el-form :model="modelEditForm" label-width="80px">
        <el-form-item label="模型 ID">
          <el-input
            v-model="modelEditForm.id"
            placeholder="例如: gpt-4o"
          />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input
            v-model="modelEditForm.name"
            placeholder="例如: GPT-4o"
          />
        </el-form-item>
        <el-form-item label="分组">
          <el-input
            v-model="modelEditForm.group"
            placeholder="可选，例如: GPT-4 系列"
          />
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
.llm-service-settings {
  height: 100%;
}

.settings-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  height: 100%;
}

/* 左侧列表 */
.profile-list {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.list-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.list-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.profile-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.profile-item:hover {
  background: var(--bg-color);
}

.profile-item.active {
  background: rgba(var(--primary-color-rgb), 0.1);
  border-left: 3px solid var(--primary-color);
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-secondary);
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
}

/* 右侧详情 */
.profile-detail {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.empty-detail {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
}

.detail-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.detail-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

/* 查看模式 */
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

/* 编辑模式 */
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
</style>