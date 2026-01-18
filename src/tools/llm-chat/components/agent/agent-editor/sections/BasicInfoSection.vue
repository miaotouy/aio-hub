<script setup lang="ts">
import { inject, computed } from "vue";
import AvatarSelector from "@/components/common/AvatarSelector.vue";
import { AgentCategoryLabels } from "../../../../types";
import type { IconUpdatePayload } from "@/components/common/AvatarSelector.vue";
import { useAgentStore } from "../../../../stores/agentStore";

const editForm = inject<any>("agent-edit-form");
const agent = inject<any>("agent-instance");
const agentStore = useAgentStore();

// 从所有 agent 中提取的不重复标签列表
const allTags = computed(() => {
  const tagSet = new Set<string>();
  agentStore.agents.forEach((a: any) => {
    a.tags?.forEach((tag: string) => tagSet.add(tag));
  });
  return Array.from(tagSet);
});

const handleIconUpdate = (payload: IconUpdatePayload) => {
  editForm.icon = payload.value;
};

const handleHistoryUpdate = (newHistory: string[]) => {
  editForm.avatarHistory = newHistory;
};
</script>

<template>
  <div class="agent-section">
    <el-form-item label="ID/名称" required data-setting-id="name">
      <el-input v-model="editForm.name" placeholder="输入智能体名称（用作 ID 和宏替换）" />
      <div class="form-hint" v-pre>
        此名称将作为宏替换的 ID（如 {{ char }}），请使用简洁的名称。
      </div>
    </el-form-item>

    <el-form-item label="显示名称" data-setting-id="displayName">
      <el-input v-model="editForm.displayName" placeholder="UI 显示名称（可选）" />
      <div class="form-hint">在界面上显示的名称。如果不填，则显示上面的 ID/名称。</div>
    </el-form-item>

    <el-form-item label="配置版本" data-setting-id="agentVersion">
      <el-input v-model="editForm.agentVersion" placeholder="例如 1.0.0" />
      <div class="form-hint">智能体配置的版本号，用于识别和升级对比。</div>
    </el-form-item>

    <el-form-item label="图标" data-setting-id="icon">
      <AvatarSelector
        :model-value="editForm.icon"
        :avatar-history="editForm.avatarHistory"
        @update:icon="handleIconUpdate"
        @update:avatar-history="handleHistoryUpdate"
        :entity-id="agent?.id"
        profile-type="agent"
        :name-for-fallback="editForm.name"
      />
    </el-form-item>

    <el-form-item label="分类" data-setting-id="category">
      <el-select
        v-model="editForm.category"
        placeholder="选择分类（可选）"
        clearable
        style="width: 100%"
      >
        <el-option
          v-for="[value, label] in Object.entries(AgentCategoryLabels)"
          :key="value"
          :value="value"
          :label="label"
        />
      </el-select>
      <div class="form-hint">用于在侧边栏对智能体进行分组。</div>
    </el-form-item>

    <el-form-item label="标签" data-setting-id="tags">
      <el-select
        v-model="editForm.tags"
        multiple
        filterable
        allow-create
        default-first-option
        placeholder="输入或选择标签"
        style="width: 100%"
        :reserve-keyword="false"
      >
        <el-option v-for="tag in allTags" :key="tag" :label="tag" :value="tag" />
      </el-select>
      <div class="form-hint">为智能体添加标签，便于筛选和搜索。按 Enter 键创建新标签。</div>
    </el-form-item>

    <el-form-item label="描述" data-setting-id="description">
      <el-input
        v-model="editForm.description"
        type="textarea"
        :rows="4"
        placeholder="智能体的简短描述..."
      />
    </el-form-item>
  </div>
</template>

<style scoped>
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}
</style>
