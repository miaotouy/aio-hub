<script setup lang="ts">
import { inject, computed } from "vue";
import AvatarSelector from "@/components/common/AvatarSelector.vue";
import { AgentCategoryLabels } from "../../../../types";
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
</script>

<template>
  <div class="agent-section">
    <el-form-item label="ID/名称">
      <el-input v-model="editForm.name" placeholder="输入智能体名称（用作 ID 和宏替换）" />
      <div class="setting-hint">
        此名称将作为宏替换的 ID（如 <code v-pre>{{ char }}</code
        >），请使用简洁的名称。
      </div>
    </el-form-item>

    <el-form-item label="显示名称">
      <el-input v-model="editForm.displayName" placeholder="UI 显示名称（可选）" />
      <div class="setting-hint">在界面上显示的名称。如果不填，则显示上面的 ID/名称。</div>
    </el-form-item>

    <el-form-item label="配置版本">
      <el-input v-model="editForm.agentVersion" placeholder="例如 1.0.0" />
      <div class="setting-hint">智能体配置的版本号，用于识别和升级对比。</div>
    </el-form-item>

    <el-form-item label="图标">
      <AvatarSelector
        v-model="editForm.icon"
        v-model:avatar-history="editForm.avatarHistory"
        :entity-id="agent?.id"
        :storage-subdirectory="agent?.id ? `llm-chat/agents/${agent.id}` : ''"
        :name-for-fallback="editForm.name"
      />
    </el-form-item>

    <el-form-item label="分类">
      <el-select
        v-model="editForm.category"
        placeholder="选择分类（可选）"
        clearable
        style="width: 100%"
      >
        <el-option
          v-for="[value, label] in Object.entries(AgentCategoryLabels)"
          :key="value"
          :label="label"
          :value="value"
        />
      </el-select>
      <div class="setting-hint">用于在侧边栏对智能体进行分组。</div>
    </el-form-item>

    <el-form-item label="标签">
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
      <div class="setting-hint">为智能体添加标签，便于筛选和搜索。按 Enter 键创建新标签。</div>
    </el-form-item>

    <el-form-item label="描述">
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
.setting-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  margin-top: 4px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
}
</style>

<style scoped></style>
