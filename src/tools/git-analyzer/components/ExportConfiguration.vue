<template>
  <el-form label-width="100px">
    <el-form-item label="导出格式">
      <el-radio-group v-model="config.format">
        <el-radio-button value="markdown">Markdown</el-radio-button>
        <el-radio-button value="json">JSON</el-radio-button>
        <el-radio-button value="csv">CSV</el-radio-button>
        <el-radio-button value="html">HTML</el-radio-button>
        <el-radio-button value="text">纯文本</el-radio-button>
      </el-radio-group>
    </el-form-item>

    <el-form-item label="包含内容">
      <el-checkbox-group v-model="config.includes">
        <el-checkbox value="statistics">统计信息</el-checkbox>
        <el-checkbox value="commits">提交记录</el-checkbox>
        <el-checkbox value="contributors">贡献者列表</el-checkbox>
        <el-checkbox value="timeline">时间线</el-checkbox>
        <el-checkbox value="charts">图表数据</el-checkbox>
      </el-checkbox-group>
    </el-form-item>

    <el-form-item label="提交范围" v-if="config.includes.includes('commits')">
      <el-radio-group v-model="config.commitRange">
        <el-radio value="all">全部提交</el-radio>
        <el-radio value="filtered">当前筛选结果</el-radio>
        <el-radio value="custom">自定义数量</el-radio>
      </el-radio-group>
      <el-input-number
        v-if="config.commitRange === 'custom'"
        v-model="config.customCount"
        :min="1"
        :max="totalCommits"
        style="margin-left: 10px"
      />
    </el-form-item>

    <el-form-item label="日期格式">
      <el-select v-model="config.dateFormat">
        <el-option label="ISO 8601" value="iso" />
        <el-option label="本地时间" value="local" />
        <el-option label="相对时间" value="relative" />
        <el-option label="Unix 时间戳" value="timestamp" />
      </el-select>
    </el-form-item>

    <!-- HTML 主题选项 -->
    <el-form-item label="HTML 主题" v-if="config.format === 'html'">
      <el-radio-group v-model="config.htmlTheme">
        <el-radio-button value="light">浅色主题</el-radio-button>
        <el-radio-button value="dark">深色主题</el-radio-button>
        <el-radio-button value="auto">跟随系统</el-radio-button>
      </el-radio-group>
      <el-tooltip content="导出的 HTML 文件将使用选择的主题配色" placement="top">
        <el-icon style="margin-left: 10px; color: var(--text-color-light)">
          <QuestionFilled />
        </el-icon>
      </el-tooltip>
    </el-form-item>

    <el-form-item label="隐私选项">
      <el-checkbox v-model="config.includeAuthor"> 显示作者名称 </el-checkbox>
      <el-tooltip content="导出时包含作者的名称" placement="top">
        <el-icon style="margin-left: 5px; color: var(--text-color-light)">
          <QuestionFilled />
        </el-icon>
      </el-tooltip>
      <el-checkbox v-model="config.includeEmail" :disabled="!config.includeAuthor">
        显示作者邮箱
      </el-checkbox>
      <el-tooltip content="导出时包含作者的邮箱地址（需要先启用显示作者名称）" placement="top">
        <el-icon style="margin-left: 5px; color: var(--text-color-light)">
          <QuestionFilled />
        </el-icon>
      </el-tooltip>
    </el-form-item>

    <el-form-item label="其他选项">
      <el-checkbox v-model="config.includeFullMessage"> 包含完整提交消息 </el-checkbox>
      <el-checkbox v-model="config.includeFiles"> 包含文件变更列表 </el-checkbox>
      <el-checkbox v-model="config.includeTags"> 包含标签信息 </el-checkbox>
      <el-checkbox v-model="config.includeStats"> 包含代码统计 </el-checkbox>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { QuestionFilled } from '@element-plus/icons-vue'
import type { ExportConfig } from '../types'

defineProps<{
  totalCommits: number
}>()

const config = defineModel<ExportConfig>('config', { required: true })
</script>

<style scoped>
:deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

:deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* 修复 radio-button 样式问题 */
:deep(.el-radio-button) {
  .el-radio-button__inner {
    border: 1px solid var(--el-border-color);
    border-radius: 4px !important;
    margin-right: 8px;
  }

  &:not(:last-child) .el-radio-button__inner {
    border-right: 1px solid var(--el-border-color);
  }

  &.is-active .el-radio-button__inner {
    border-color: var(--el-color-primary);
    background-color: var(--el-color-primary);
    color: var(--el-color-white);
  }

  &:hover .el-radio-button__inner {
    border-color: var(--el-color-primary);
  }
}
</style>