<template>
  <div>
    <el-table
      v-if="parameters && parameters.length > 0"
      :data="parameters"
      size="small"
      row-key="name"
      stripe
      style="width: 100%"
    >
      <el-table-column type="expand" width="40">
        <template #default="{ row }">
          <div v-if="row.properties && row.properties.length > 0" class="nested-properties">
            <div class="properties-header">
              <el-text type="info" size="small">对象属性：</el-text>
            </div>
            <el-table :data="row.properties" size="small" class="properties-table">
              <el-table-column prop="name" label="属性名" width="150" />
              <el-table-column label="必填" width="80" align="center">
                <template #default="{ row: prop }">
                  <el-tag
                    v-if="prop.required !== false"
                    size="small"
                    type="danger"
                    effect="plain"
                  >
                    必填
                  </el-tag>
                  <el-tag
                    v-else
                    size="small"
                    type="info"
                    effect="plain"
                  >
                    可选
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="type" label="类型" width="200">
                <template #default="{ row: prop }">
                  <el-tag size="small" type="warning" effect="light" round>
                    {{ prop.type }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="description" label="描述" />
              <el-table-column prop="defaultValue" label="默认值" width="120">
                <template #default="{ row: prop }">
                  <el-tag
                    v-if="prop.defaultValue !== undefined"
                    size="small"
                    effect="light"
                    round
                  >
                    {{ String(prop.defaultValue) }}
                  </el-tag>
                  <span v-else class="no-default">-</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="参数名" width="150" />
      <el-table-column label="必填" width="80" align="center">
        <template #default="{ row }">
          <el-tag
            v-if="row.required !== false"
            size="small"
            type="danger"
            effect="plain"
          >
            必填
          </el-tag>
          <el-tag
            v-else
            size="small"
            type="info"
            effect="plain"
          >
            可选
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="type" label="类型" width="200">
        <template #default="{ row }">
          <div class="type-cell">
            <el-tag size="small" type="warning" effect="light" round>{{ row.type }}</el-tag>
            <el-tag
              v-if="row.properties && row.properties.length > 0"
              size="small"
              type="info"
              effect="light"
              round
              class="properties-badge"
            >
              {{ row.properties.length }} 个
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="defaultValue" label="默认值" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.defaultValue !== undefined" size="small" effect="light" round>
            {{ String(row.defaultValue) }}
          </el-tag>
          <span v-else class="no-default">-</span>
        </template>
      </el-table-column>
    </el-table>
    <div v-else class="no-params-hint">
      <el-text type="info" size="small">该方法无需参数</el-text>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MethodParameter } from '@/services/types';

defineProps<{
  parameters: MethodParameter[];
}>();
</script>

<style scoped>
/* 移除展开单元格的内边距，让嵌套内容可以撑满 */
:deep(.el-table__expanded-cell) {
  padding: 0 !important;
}

.nested-properties {
  padding: 12px 16px 12px 52px; /* 左侧留出对齐空间 */
  background-color: var(--el-bg-color-page);
}

.properties-header {
  margin-bottom: 12px;
}

/* 嵌套的属性表格，移除边框和背景，使其与父级融合 */
.properties-table {
  --el-table-border-color: transparent;
  --el-table-bg-color: transparent;
}

/* 覆盖嵌套表格的 hover 背景色，使其更柔和 */
:deep(.properties-table .el-table__row:hover) {
  background-color: var(--el-fill-color-lighter) !important;
}

.type-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.no-default {
  color: var(--el-text-color-placeholder);
}

.no-params-hint {
  font-size: large;
  padding: 12px 16px;
  text-align: center;
  background-color: var(--el-fill-color-lighter);
  border-radius: 4px;
}
</style>