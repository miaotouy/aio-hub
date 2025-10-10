<script setup lang="ts" generic="T extends { id: string; name: string; enabled: boolean }">
import { computed } from "vue";
import { Plus, Delete, Edit, Check, Close } from "@element-plus/icons-vue";

// 泛型 Props，支持任意符合基本结构的 Profile 类型
interface Props {
  title: string; // 服务标题，如 "LLM 服务" 或 "云端 OCR 服务"
  profiles: T[]; // 配置列表
  selectedProfileId: string | null; // 当前选中的配置 ID
  isEditing: boolean; // 是否处于编辑状态
  emptyStateText?: string; // 空状态提示文本
}

const props = withDefaults(defineProps<Props>(), {
  emptyStateText: "还没有配置任何服务",
});

// Emits
interface Emits {
  (e: "select", profileId: string): void; // 选择配置
  (e: "add"): void; // 添加配置
  (e: "edit", profile: T): void; // 编辑配置
  (e: "delete", profile: T): void; // 删除配置
  (e: "toggle", profile: T): void; // 切换启用状态
  (e: "save"): void; // 保存编辑
  (e: "cancel"): void; // 取消编辑
}

const emit = defineEmits<Emits>();

// 计算选中的配置
const selectedProfile = computed(() => {
  if (!props.selectedProfileId) return null;
  return props.profiles.find((p) => p.id === props.selectedProfileId) || null;
});
</script>

<template>
  <div class="service-settings-layout">
    <div class="settings-layout">
      <!-- 左侧：配置列表 -->
      <div class="profile-list">
        <div class="list-header">
          <h3>{{ title }}</h3>
          <el-button type="primary" :icon="Plus" size="small" @click="emit('add')">
            添加
          </el-button>
        </div>

        <div class="list-content">
          <div
            v-for="profile in profiles"
            :key="profile.id"
            class="profile-item"
            :class="{ active: selectedProfileId === profile.id }"
            @click="emit('select', profile.id)"
          >
            <!-- 列表项插槽：允许自定义列表项内容 -->
            <slot name="list-item" :profile="profile">
              <div class="profile-info">
                <div class="profile-name">{{ profile.name }}</div>
              </div>
            </slot>

            <el-switch
              :model-value="profile.enabled"
              size="small"
              @click.stop
              @change="emit('toggle', profile)"
            />
          </div>

          <div v-if="profiles.length === 0" class="empty-state">
            <p>{{ emptyStateText }}</p>
            <p class="hint">点击上方"添加"按钮开始配置</p>
          </div>
        </div>
      </div>

      <!-- 右侧：配置详情 -->
      <div class="profile-detail">
        <div v-if="!selectedProfile && !isEditing" class="empty-detail">
          <p>请选择或创建一个服务配置</p>
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
                  @click="emit('edit', selectedProfile!)"
                >
                  编辑
                </el-button>
                <el-button
                  type="danger"
                  :icon="Delete"
                  size="small"
                  @click="emit('delete', selectedProfile!)"
                >
                  删除
                </el-button>
              </div>
            </div>

            <div class="detail-body">
              <!-- 查看内容插槽：显示配置详情 -->
              <slot name="view-content" :profile="selectedProfile" />
            </div>
          </div>

          <!-- 编辑模式 -->
          <div v-else class="edit-mode">
            <div class="detail-header">
              <h3>{{ selectedProfile ? "编辑配置" : "新建配置" }}</h3>
              <div class="header-actions">
                <el-button :icon="Check" type="primary" size="small" @click="emit('save')">
                  保存
                </el-button>
                <el-button :icon="Close" size="small" @click="emit('cancel')"> 取消 </el-button>
              </div>
            </div>

            <div class="detail-body">
              <!-- 编辑表单插槽：编辑配置 -->
              <slot name="edit-form" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 额外插槽：用于对话框等其他内容 -->
    <slot name="dialogs" />
  </div>
</template>

<style scoped>
.service-settings-layout {
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
</style>