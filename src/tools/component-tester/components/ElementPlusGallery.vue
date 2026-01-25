<template>
  <div class="element-plus-gallery">
    <div class="section">
      <h2 class="section-title">按钮 Button</h2>
      <div class="button-demo">
        <el-button>默认按钮</el-button>
        <el-button type="primary">主要按钮</el-button>
        <el-button type="success">成功按钮</el-button>
        <el-button type="info">信息按钮</el-button>
        <el-button type="warning">警告按钮</el-button>
        <el-button type="danger">危险按钮</el-button>
      </div>
      <div class="button-demo">
        <el-button plain>朴素按钮</el-button>
        <el-button type="primary" plain>主要按钮</el-button>
        <el-button type="success" plain>成功按钮</el-button>
        <el-button type="info" plain>信息按钮</el-button>
        <el-button type="warning" plain>警告按钮</el-button>
        <el-button type="danger" plain>危险按钮</el-button>
      </div>
      <div class="button-demo">
        <el-button round>圆角按钮</el-button>
        <el-button type="primary" round>主要按钮</el-button>
        <el-button type="success" round>成功按钮</el-button>
        <el-button type="info" round>信息按钮</el-button>
        <el-button type="warning" round>警告按钮</el-button>
        <el-button type="danger" round>危险按钮</el-button>
      </div>
      <div class="button-demo">
        <el-button circle :icon="Search" />
        <el-button type="primary" circle :icon="Edit" />
        <el-button type="success" circle :icon="Check" />
        <el-button type="info" circle :icon="Message" />
        <el-button type="warning" circle :icon="Star" />
        <el-button type="danger" circle :icon="Delete" />
      </div>
      <div class="button-demo">
        <el-button disabled>禁用按钮</el-button>
        <el-button type="primary" disabled>主要按钮</el-button>
        <el-button type="success" loading>加载中</el-button>
      </div>
      <div class="button-demo">
        <el-button size="large">大型按钮</el-button>
        <el-button>默认按钮</el-button>
        <el-button size="small">小型按钮</el-button>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">输入框 Input</h2>
      <div class="input-demo">
        <el-input v-model="inputValue" placeholder="请输入内容" />
        <el-input v-model="inputValue" placeholder="带清除按钮" clearable />
        <el-input v-model="inputValue" placeholder="带图标" :prefix-icon="Search" />
        <el-input v-model="inputValue" placeholder="带图标" :suffix-icon="Calendar" />
        <el-input v-model="inputValue" type="password" placeholder="密码输入框" show-password />
        <el-input v-model="inputValue" type="textarea" placeholder="文本域" :rows="3" />
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">选择器 Select</h2>
      <div class="select-demo">
        <el-select v-model="selectValue" placeholder="请选择">
          <el-option label="选项1" value="1" />
          <el-option label="选项2" value="2" />
          <el-option label="选项3" value="3" />
        </el-select>
        <el-select v-model="selectValue" placeholder="可清空" clearable>
          <el-option label="选项1" value="1" />
          <el-option label="选项2" value="2" />
          <el-option label="选项3" value="3" />
        </el-select>
        <el-select v-model="multiSelectValue" placeholder="多选" multiple>
          <el-option label="选项1" value="1" />
          <el-option label="选项2" value="2" />
          <el-option label="选项3" value="3" />
        </el-select>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">开关 Switch</h2>
      <div class="switch-demo">
        <el-switch v-model="switchValue" />
        <el-switch v-model="switchValue" active-text="开启" inactive-text="关闭" />
        <el-switch v-model="switchValue" active-color="#13ce66" inactive-color="#ff4949" />
        <el-switch v-model="switchValue" disabled />
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">单选框 Radio</h2>
      <div class="radio-demo">
        <el-radio-group v-model="radioValue">
          <el-radio value="1">选项1</el-radio>
          <el-radio value="2">选项2</el-radio>
          <el-radio value="3">选项3</el-radio>
        </el-radio-group>
        <el-radio-group v-model="radioValue">
          <el-radio-button value="1">选项1</el-radio-button>
          <el-radio-button value="2">选项2</el-radio-button>
          <el-radio-button value="3">选项3</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">复选框 Checkbox</h2>
      <div class="checkbox-demo">
        <el-checkbox v-model="checkboxValue">单个复选框</el-checkbox>
        <el-checkbox-group v-model="checkboxGroupValue">
          <el-checkbox label="选项1" />
          <el-checkbox label="选项2" />
          <el-checkbox label="选项3" />
        </el-checkbox-group>
        <el-checkbox-group v-model="checkboxGroupValue">
          <el-checkbox-button label="选项1" />
          <el-checkbox-button label="选项2" />
          <el-checkbox-button label="选项3" />
        </el-checkbox-group>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">日期选择器 DatePicker</h2>
      <div class="date-demo">
        <el-date-picker v-model="dateValue" type="date" placeholder="选择日期" />
        <el-date-picker v-model="dateValue" type="datetime" placeholder="选择日期时间" />
        <el-date-picker v-model="dateRangeValue" type="daterange" range-separator="至" start-placeholder="开始日期"
          end-placeholder="结束日期" />
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">滑块 Slider</h2>
      <div class="slider-demo">
        <el-slider v-model="sliderValue" />
        <el-slider v-model="sliderValue" show-input />
        <el-slider v-model="sliderRangeValue" range />
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">标签 Tag</h2>
      <div class="tag-demo">
        <el-tag>标签一</el-tag>
        <el-tag type="success">成功标签</el-tag>
        <el-tag type="info">信息标签</el-tag>
        <el-tag type="warning">警告标签</el-tag>
        <el-tag type="danger">危险标签</el-tag>
        <el-tag closable>可关闭标签</el-tag>
        <el-tag effect="dark">深色标签</el-tag>
        <el-tag effect="plain">朴素标签</el-tag>
        <el-tag size="large">大型标签</el-tag>
        <el-tag size="small">小型标签</el-tag>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">进度条 Progress</h2>
      <div class="progress-demo">
        <el-progress :percentage="50" />
        <el-progress :percentage="100" status="success" />
        <el-progress :percentage="70" status="warning" />
        <el-progress :percentage="50" status="exception" />
        <el-progress :percentage="50" type="circle" />
        <el-progress :percentage="100" type="circle" status="success" />
        <el-progress :percentage="70" type="dashboard" />
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">徽章 Badge</h2>
      <div class="badge-demo">
        <el-badge :value="12">
          <el-button>评论</el-button>
        </el-badge>
        <el-badge :value="3" type="primary">
          <el-button>回复</el-button>
        </el-badge>
        <el-badge :value="1" type="warning">
          <el-button>警告</el-button>
        </el-badge>
        <el-badge :value="2" type="danger">
          <el-button>危险</el-button>
        </el-badge>
        <el-badge is-dot>
          <el-button>消息</el-button>
        </el-badge>
        <el-badge :value="100" :max="99">
          <el-button>消息</el-button>
        </el-badge>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">卡片 Card</h2>
      <h3 class="subsection-title">自定义 InfoCard 组件</h3>
      <div class="card-demo">
        <InfoCard title="卡片标题">
          <template #headerExtra>
            <el-button text>操作按钮</el-button>
          </template>
          <div>卡片内容</div>
        </InfoCard>
        <InfoCard content="鼠标悬浮时显示阴影" shadow="hover" />
        <InfoCard content="始终显示阴影" shadow="always" />
      </div>
      <h3 class="subsection-title">原生 el-card 组件</h3>
      <div class="card-demo">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>卡片标题</span>
              <el-button text>操作按钮</el-button>
            </div>
          </template>
          <div>卡片内容</div>
        </el-card>
        <el-card shadow="hover">
          <div>鼠标悬浮时显示阴影</div>
        </el-card>
        <el-card shadow="always">
          <div>始终显示阴影</div>
        </el-card>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">折叠面板 Collapse</h2>
      <el-collapse v-model="collapseValue">
        <el-collapse-item title="一致性 Consistency" name="1">
          <div>与现实生活一致</div>
        </el-collapse-item>
        <el-collapse-item title="反馈 Feedback" name="2">
          <div>控制反馈</div>
        </el-collapse-item>
        <el-collapse-item title="效率 Efficiency" name="3">
          <div>简化流程</div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <div class="section">
      <h2 class="section-title">时间线 Timeline</h2>
      <el-timeline>
        <el-timeline-item v-for="event in timelineEvents" :key="event.id" :timestamp="event.timestamp"
          :type="event.type" :color="event.color" :size="event.size" :hollow="event.hollow" placement="top">
          <InfoCard :class="['timeline-card', { clickable: event.clickable }]">
            <div class="timeline-header">
              <span class="timeline-sequence">#{{ event.id }}</span>
              <el-tag :type="event.tagType" size="small">{{ event.category }}</el-tag>
              <el-tag v-if="event.branch" type="success" size="small">
                {{ event.branch }}
              </el-tag>
              <span class="timeline-author">{{ event.author }}</span>
            </div>
            <div class="timeline-title">{{ event.title }}</div>
            <div class="timeline-description">{{ event.description }}</div>
            <div v-if="event.stats" class="timeline-stats">
              <el-space size="small">
                <span class="stat-item additions">+{{ event.stats.additions }}</span>
                <span class="stat-item deletions">-{{ event.stats.deletions }}</span>
                <span class="stat-item files">{{ event.stats.files }} 个文件</span>
              </el-space>
            </div>
          </InfoCard>
        </el-timeline-item>
      </el-timeline>
    </div>

    <div class="section">
      <h2 class="section-title">表格 Table</h2>
      <el-table :data="tableData" border style="width: 100%">
        <el-table-column prop="date" label="日期" width="180" />
        <el-table-column prop="name" label="姓名" width="180" />
        <el-table-column prop="address" label="地址" />
      </el-table>
    </div>

    <div class="section">
      <h2 class="section-title">分页 Pagination</h2>
      <div class="pagination-demo">
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[10, 20, 30, 40]"
          layout="total, sizes, prev, pager, next, jumper" :total="100" />
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">步骤条 Steps</h2>
      <el-steps :active="stepsActive" finish-status="success">
        <el-step title="步骤 1" />
        <el-step title="步骤 2" />
        <el-step title="步骤 3" />
      </el-steps>
      <div style="margin-top: 12px">
        <el-button @click="stepsActive = Math.max(0, stepsActive - 1)">上一步</el-button>
        <el-button @click="stepsActive = Math.min(3, stepsActive + 1)">下一步</el-button>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">对话框 Dialog</h2>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <div>
          <h3 class="subsection-title">自定义 BaseDialog 组件</h3>
          <el-button @click="dialogVisible = true">打开 BaseDialog</el-button>
          <BaseDialog v-model="dialogVisible" title="提示" width="500">
            <span>这是一段信息（BaseDialog）</span>
            <template #footer>
              <div class="dialog-footer">
                <el-button @click="dialogVisible = false">取消</el-button>
                <el-button type="primary" @click="dialogVisible = false">确定</el-button>
              </div>
            </template>
          </BaseDialog>
        </div>
        <div>
          <h3 class="subsection-title">原生 el-dialog 组件</h3>
          <el-button @click="nativeDialogVisible = true">打开 el-dialog</el-button>
          <el-dialog v-model="nativeDialogVisible" title="提示" width="500">
            <span>这是一段信息（el-dialog）</span>
            <template #footer>
              <div class="dialog-footer">
                <el-button @click="nativeDialogVisible = false">取消</el-button>
                <el-button type="primary" @click="nativeDialogVisible = false">确定</el-button>
              </div>
            </template>
          </el-dialog>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">抽屉 Drawer</h2>
      <el-button @click="drawerVisible = true">打开抽屉</el-button>
      <el-drawer v-model="drawerVisible" title="我是标题" direction="rtl" size="30%">
        <span>我来自抽屉</span>
      </el-drawer>
    </div>

    <div class="section">
      <h2 class="section-title">气泡确认框 Popconfirm</h2>
      <el-popconfirm title="确定删除吗?">
        <template #reference>
          <el-button>删除</el-button>
        </template>
      </el-popconfirm>
    </div>

    <div class="section">
      <h2 class="section-title">文字提示 Tooltip</h2>
      <div class="tooltip-demo">
        <el-tooltip content="提示内容" placement="top">
          <el-button>上方提示</el-button>
        </el-tooltip>
        <el-tooltip content="提示内容" placement="bottom">
          <el-button>下方提示</el-button>
        </el-tooltip>
        <el-tooltip content="提示内容" placement="left">
          <el-button>左侧提示</el-button>
        </el-tooltip>
        <el-tooltip content="提示内容" placement="right">
          <el-button>右侧提示</el-button>
        </el-tooltip>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">气泡卡片 Popover</h2>
      <el-popover placement="top" title="标题" :width="200" trigger="hover" content="这是一段内容">
        <template #reference>
          <el-button>鼠标悬浮</el-button>
        </template>
      </el-popover>
      <el-popover placement="bottom" title="标题" :width="200" trigger="click" content="这是一段内容">
        <template #reference>
          <el-button>点击激活</el-button>
        </template>
      </el-popover>
    </div>

    <div class="section">
      <h2 class="section-title">树形控件 Tree</h2>
      <el-tree :data="treeData" :props="{ children: 'children', label: 'label' }" default-expand-all />
    </div>

    <div class="section">
      <h2 class="section-title">加载 Loading</h2>
      <el-button :loading="loadingState" @click="loadingState = !loadingState">
        {{ loadingState ? '加载中' : '点击加载' }}
      </el-button>
    </div>

    <div class="section">
      <h2 class="section-title">骨架屏 Skeleton</h2>
      <el-skeleton :rows="5" animated />
    </div>

    <div class="section">
      <h2 class="section-title">空状态 Empty</h2>
      <el-empty description="暂无数据" />
    </div>

    <div class="section">
      <h2 class="section-title">结果 Result</h2>
      <div class="result-demo">
        <el-result icon="success" title="成功提示" sub-title="请根据提示进行操作">
          <template #extra>
            <el-button type="primary">返回</el-button>
          </template>
        </el-result>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import InfoCard from '@/components/common/InfoCard.vue';
import {
  Search,
  Edit,
  Check,
  Message,
  Star,
  Delete,
  Calendar,
} from '@element-plus/icons-vue';

// 表单数据
const inputValue = ref('');
const selectValue = ref('');
const multiSelectValue = ref([]);
const switchValue = ref(true);
const radioValue = ref('1');
const checkboxValue = ref(false);
const checkboxGroupValue = ref(['选项1']);
const dateValue = ref('');
const dateRangeValue = ref([]);
const sliderValue = ref(50);
const sliderRangeValue = ref([20, 50]);
const collapseValue = ref(['1']);

// 对话框和抽屉
const dialogVisible = ref(false);
const nativeDialogVisible = ref(false);
const drawerVisible = ref(false);

// 分页
const currentPage = ref(1);
const pageSize = ref(10);

// 步骤条
const stepsActive = ref(0);

// 加载状态
const loadingState = ref(false);

// 表格数据
const tableData = ref([
  {
    date: '2024-01-01',
    name: '张三',
    address: '上海市普陀区金沙江路 1518 弄',
  },
  {
    date: '2024-01-02',
    name: '李四',
    address: '上海市普陀区金沙江路 1517 弄',
  },
  {
    date: '2024-01-03',
    name: '王五',
    address: '上海市普陀区金沙江路 1519 弄',
  },
]);

// 树形数据
const treeData = ref([
  {
    label: '一级 1',
    children: [
      {
        label: '二级 1-1',
        children: [
          {
            label: '三级 1-1-1',
          },
        ],
      },
    ],
  },
  {
    label: '一级 2',
    children: [
      {
        label: '二级 2-1',
      },
      {
        label: '二级 2-2',
      },
    ],
  },
  {
    label: '一级 3',
    children: [
      {
        label: '二级 3-1',
      },
      {
        label: '二级 3-2',
      },
    ],
  },
]);

// 时间线数据（参考 git-analyzer 的设计）
const timelineEvents = ref([
  {
    id: 1,
    timestamp: '2024-01-15 10:30',
    type: 'primary',
    color: '#409eff',
    size: 'large',
    hollow: false,
    category: 'Feature',
    tagType: 'success',
    branch: 'main',
    author: '张三',
    title: '添加新功能模块',
    description: '实现了用户管理系统的核心功能',
    clickable: true,
    stats: {
      additions: 156,
      deletions: 23,
      files: 8,
    },
  },
  {
    id: 2,
    timestamp: '2024-01-14 16:45',
    type: 'success',
    color: '#67c23a',
    size: 'normal',
    hollow: false,
    category: 'Fix',
    tagType: 'warning',
    branch: 'develop',
    author: '李四',
    title: '修复登录Bug',
    description: '解决了登录页面在某些情况下无法正常跳转的问题',
    clickable: true,
    stats: {
      additions: 12,
      deletions: 8,
      files: 3,
    },
  },
  {
    id: 3,
    timestamp: '2024-01-13 14:20',
    type: 'warning',
    color: '#e6a23c',
    size: 'normal',
    hollow: false,
    category: 'Docs',
    tagType: 'info',
    branch: 'main',
    author: '王五',
    title: '更新文档',
    description: '完善了 API 接口文档和使用说明',
    clickable: true,
    stats: {
      additions: 45,
      deletions: 12,
      files: 5,
    },
  },
  {
    id: 4,
    timestamp: '2024-01-12 09:15',
    type: 'danger',
    color: '#f56c6c',
    size: 'normal',
    hollow: true,
    category: 'Refactor',
    tagType: 'danger',
    branch: 'refactor',
    author: '赵六',
    title: '代码重构',
    description: '优化了数据处理层的代码结构',
    clickable: true,
    stats: {
      additions: 89,
      deletions: 134,
      files: 12,
    },
  },
  {
    id: 5,
    timestamp: '2024-01-11 11:30',
    type: 'info',
    color: '#909399',
    size: 'normal',
    hollow: false,
    category: 'Test',
    tagType: 'info',
    branch: 'test',
    author: '孙七',
    title: '添加单元测试',
    description: '为核心模块添加了完整的单元测试覆盖',
    clickable: false,
    stats: {
      additions: 234,
      deletions: 0,
      files: 15,
    },
  },
]);
</script>

<style scoped>
.element-plus-gallery {
  max-width: 1200px;
  margin: 0 auto;
}

.section {
  margin-bottom: 32px;
  padding: 20px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background-color: var(--el-bg-color);
}

.section-title {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 600;
  border-bottom: 2px solid var(--el-color-primary);
  padding-bottom: 8px;
}

.subsection-title {
  margin-top: 12px;
  margin-bottom: 8px;
  color: var(--el-text-color-regular);
  font-size: 14px;
  font-weight: 500;
}

.button-demo,
.input-demo,
.select-demo,
.switch-demo,
.radio-demo,
.checkbox-demo,
.date-demo,
.slider-demo,
.tag-demo,
.badge-demo,
.card-demo,
.pagination-demo,
.tooltip-demo,
.result-demo {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.button-demo {
  margin-bottom: 12px;
}

.input-demo {
  flex-direction: column;
  align-items: stretch;
}

.select-demo {
  flex-direction: column;
  align-items: stretch;
}

.slider-demo {
  flex-direction: column;
  gap: 20px;
}

.progress-demo {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.progress-demo :deep(.el-progress--circle),
.progress-demo :deep(.el-progress--dashboard) {
  align-self: flex-start;
}

.card-demo {
  flex-direction: column;
  align-items: stretch;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 时间线样式 - 参考 git-analyzer */
.timeline-card {
  transition: all 0.3s;
}

.timeline-card.clickable {
  cursor: pointer;
}

.timeline-card.clickable:hover {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.timeline-sequence {
  font-weight: bold;
  font-size: 14px;
  color: var(--el-color-primary);
}

.timeline-author {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: auto;
}

.timeline-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.timeline-description {
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
  line-height: 1.5;
}

.timeline-stats {
  font-size: 12px;
  margin-top: 8px;
}

.stat-item {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-light);
  font-family: 'Consolas', 'Monaco', monospace;
  font-weight: 500;
}

.stat-item.additions {
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
  border-color: color-mix(in srgb, var(--el-color-success) 30%, transparent);
}

.stat-item.deletions {
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  border-color: color-mix(in srgb, var(--el-color-danger) 30%, transparent);
}

.stat-item.files {
  color: var(--el-text-color-secondary);
}
</style>