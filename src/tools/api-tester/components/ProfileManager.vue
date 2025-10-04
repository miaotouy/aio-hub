<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>配置管理</h3>
        <button @click="emit('close')" class="btn-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="profile-save">
          <h4>保存当前配置</h4>
          <div class="input-group">
            <input
              v-model="newProfileName"
              type="text"
              placeholder="配置名称"
              class="profile-name-input"
              @keyup.enter="handleSaveProfile"
            />
            <button @click="handleSaveProfile" class="btn-primary">💾 保存</button>
          </div>
        </div>

        <div class="profile-list">
          <h4>已保存的配置</h4>
          <div v-if="store.savedProfiles.length === 0" class="empty-message">
            暂无保存的配置
          </div>
          <div
            v-for="profile in store.savedProfiles"
            :key="profile.id"
            class="profile-item"
          >
            <div class="profile-info">
              <strong>{{ profile.name }}</strong>
              <span class="profile-preset">{{ getPresetName(profile.selectedPresetId) }}</span>
            </div>
            <div class="profile-actions">
              <button @click="handleLoadProfile(profile.id)" class="btn-secondary btn-sm">
                📂 加载
              </button>
              <button @click="handleDeleteProfile(profile.id)" class="btn-danger btn-sm">
                🗑️ 删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useApiTesterStore } from '../store';

const emit = defineEmits<{
  close: []
}>();

const store = useApiTesterStore();
const newProfileName = ref('');

function handleSaveProfile() {
  if (!newProfileName.value.trim()) {
    alert('请输入配置名称');
    return;
  }
  store.saveProfile(newProfileName.value.trim());
  newProfileName.value = '';
  alert('配置已保存');
}

function handleLoadProfile(profileId: string) {
  store.loadProfile(profileId);
  emit('close');
}

function handleDeleteProfile(profileId: string) {
  if (confirm('确定要删除这个配置吗？')) {
    store.deleteProfile(profileId);
  }
}

function getPresetName(presetId: string): string {
  const preset = store.availablePresets.find(p => p.id === presetId);
  return preset?.name || presetId;
}
</script>

<style scoped>
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
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  color: var(--text-color);
}

.modal-body {
  padding: 20px;
}

.modal-body h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: var(--text-color);
}

.profile-save {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-color);
}

.input-group {
  display: flex;
  gap: 12px;
}

.profile-name-input {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
  background: var(--input-bg);
  color: var(--text-color);
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-message {
  text-align: center;
  color: var(--text-color-light);
  padding: 20px;
}

.profile-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-info strong {
  color: var(--text-color);
}

.profile-preset {
  font-size: 13px;
  color: var(--text-color-light);
}

.profile-actions {
  display: flex;
  gap: 8px;
}

.btn-primary,
.btn-secondary,
.btn-danger,
.btn-close {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
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
  background: var(--primary-color);
  color: white;
}

.btn-secondary:hover {
  background: var(--primary-hover-color);
}

.btn-danger {
  background: var(--error-color);
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
}

.btn-sm {
  padding: 4px 12px;
  font-size: 13px;
}

.btn-close {
  background: transparent;
  padding: 4px 8px;
  font-size: 20px;
  line-height: 1;
  color: var(--text-color);
}

.btn-close:hover {
  background: var(--border-color);
}
</style>