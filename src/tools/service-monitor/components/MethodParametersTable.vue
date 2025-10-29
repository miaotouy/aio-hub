<template>
  <div>
    <el-table
      v-if="parameters && parameters.length > 0"
      :data="parameters"
      size="small"
      border
      row-key="name"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div v-if="row.properties && row.properties.length > 0" class="nested-properties">
            <div class="properties-header">
              <el-text type="info" size="small">对象属性：</el-text>
            </div>
            <el-table
              :data="row.properties"
              size="small"
              border
              class="properties-table"
            >
              <el-table-column prop="name" label="属性名" width="150" />
              <el-table-column prop="type" label="类型" width="200">
                <template #default="{ row: prop }">
                  <el-tag size="small" type="warning">{{ prop.type }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="description" label="描述" />
              <el-table-column prop="defaultValue" label="默认值" width="120">
                <template #default="{ row: prop }">
                  <el-tag v-if="prop.defaultValue !== undefined" size="small">
                    {{ prop.defaultValue }}
                  </el-tag>
                  <span v-else class="no-default">-</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="参数名" width="150" />
      <el-table-column prop="type" label="类型" width="200">
        <template #default="{ row }">
          <div class="type-cell">
            <el-tag size="small" type="warning">{{ row.type }}</el-tag>
            <el-tag
              v-if="row.properties && row.properties.length > 0"
              size="small"
              type="info"
              class="properties-badge"
            >
              {{ row.properties.length }} 个属性
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="defaultValue" label="默认值" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.defaultValue !== undefined" size="small">
            {{ row.defaultValue }}
          </el-tag>
          <span v-else class="no-default">-</span>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else description="无参数" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import type { MethodParameter } from '@/services/types';

defineProps<{
  parameters: MethodParameter[];
}>();
</script>

<style scoped>
.nested-properties {
  padding: 12px 16px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  margin: 8px 0;
}

.properties-header {
  margin-bottom: 8px;
}

.properties-table {
  margin-top: 8px;
}

.type-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.properties-badge {
  font-size: 11px;
}

.no-default {
  color: var(--el-text-color-placeholder);
}
</style>