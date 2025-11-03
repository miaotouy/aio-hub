<template>
  <div class="messaging-test">
    <div class="section">
      <h2 class="section-title">Message 消息提示</h2>
      <div class="message-demo">
        <el-button @click="showMessage('success')">成功消息</el-button>
        <el-button @click="showMessage('info')">信息消息</el-button>
        <el-button @click="showMessage('warning')">警告消息</el-button>
        <el-button @click="showMessage('error')">错误消息</el-button>
        <el-button @click="showMessage('default')">普通消息</el-button>
      </div>
      <div class="message-demo">
        <el-button @click="showHTMLMessage">HTML 消息</el-button>
        <el-button @click="showClosableMessage">可关闭消息</el-button>
        <el-button @click="showCenteredMessage">居中消息</el-button>
        <el-button @click="showGroupedMessage">分组消息</el-button>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">CustomMessage 自定义消息提示</h2>
      <p class="note">使用项目封装的 customMessage，会自动添加 offset 避免被标题栏遮挡</p>
      <div class="message-demo">
        <el-button @click="showCustomMessage('success')">成功消息</el-button>
        <el-button @click="showCustomMessage('info')">信息消息</el-button>
        <el-button @click="showCustomMessage('warning')">警告消息</el-button>
        <el-button @click="showCustomMessage('error')">错误消息</el-button>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Notification 通知</h2>
      <div class="notification-demo">
        <el-button @click="showNotification('success')">成功通知</el-button>
        <el-button @click="showNotification('info')">信息通知</el-button>
        <el-button @click="showNotification('warning')">警告通知</el-button>
        <el-button @click="showNotification('error')">错误通知</el-button>
      </div>
      <div class="notification-demo">
        <el-button @click="showNotification('success', 'top-right')">右上角</el-button>
        <el-button @click="showNotification('info', 'top-left')">左上角</el-button>
        <el-button @click="showNotification('warning', 'bottom-right')">右下角</el-button>
        <el-button @click="showNotification('error', 'bottom-left')">左下角</el-button>
      </div>
      <div class="notification-demo">
        <el-button @click="showHTMLNotification">HTML 通知</el-button>
        <el-button @click="showLongNotification">长内容通知</el-button>
        <el-button @click="showNoAutoCloseNotification">不自动关闭</el-button>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">MessageBox 消息弹框</h2>
      <div class="messagebox-demo">
        <el-button @click="showAlert">Alert 警告</el-button>
        <el-button @click="showConfirm">Confirm 确认</el-button>
        <el-button @click="showPrompt">Prompt 输入</el-button>
      </div>
      <div class="messagebox-demo">
        <el-button @click="showCustomIcon">自定义图标</el-button>
        <el-button @click="showHTMLContent">HTML 内容</el-button>
        <el-button @click="showCenterAlign">居中对齐</el-button>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Loading 加载</h2>
      <div class="loading-demo">
        <el-button @click="showFullscreenLoading">全屏加载</el-button>
        <el-button @click="showCustomLoading">自定义文本</el-button>
        <el-button @click="showBackgroundLoading">自定义背景</el-button>
        <div class="loading-target" v-loading="targetLoading" element-loading-text="加载中...">
          <el-button @click="toggleTargetLoading">容器加载</el-button>
          <p>这是一个可以被加载遮罩覆盖的容器</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">测试结果</h2>
      <div class="result-display">
        <p v-if="lastResult">最后操作结果: {{ lastResult }}</p>
        <p v-else class="placeholder">点击上方按钮进行测试...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElNotification, ElMessageBox, ElLoading } from 'element-plus';
import { customMessage } from '@/utils/customMessage';
import { WarningFilled } from '@element-plus/icons-vue';
import { h } from 'vue';

const lastResult = ref('');
const targetLoading = ref(false);

// Message 消息提示
const showMessage = (type: 'success' | 'info' | 'warning' | 'error' | 'default') => {
  const messages = {
    success: '恭喜你，这是一条成功消息',
    info: '这是一条消息提示',
    warning: '警告哦，这是一条警告消息',
    error: '错了哦，这是一条错误消息',
    default: '这是一条普通消息',
  };

  if (type === 'default') {
    ElMessage(messages[type]);
  } else {
    ElMessage[type](messages[type]);
  }
  lastResult.value = `显示了 ${type} 类型的消息`;
};

const showHTMLMessage = () => {
  ElMessage({
    dangerouslyUseHTMLString: true,
    message: '<strong>这是 <i>HTML</i> 片段</strong>',
  });
  lastResult.value = '显示了 HTML 消息';
};

const showClosableMessage = () => {
  ElMessage({
    showClose: true,
    message: '这是一条可关闭的消息',
    duration: 0,
  });
  lastResult.value = '显示了可关闭的消息';
};

const showCenteredMessage = () => {
  ElMessage({
    message: '居中的文字',
    center: true,
  } as any); // 类型定义缺少 center 属性，使用 any 绕过
  lastResult.value = '显示了居中消息';
};

const showGroupedMessage = () => {
  ElMessage({
    message: '相同内容的消息会被分组',
    grouping: true,
  });
  lastResult.value = '显示了分组消息';
};

// CustomMessage 自定义消息提示
const showCustomMessage = (type: 'success' | 'info' | 'warning' | 'error') => {
  const messages = {
    success: '成功！这是自定义消息（带 offset）',
    info: '提示：这是自定义消息（带 offset）',
    warning: '警告：这是自定义消息（带 offset）',
    error: '错误：这是自定义消息（带 offset）',
  };

  customMessage[type](messages[type]);
  lastResult.value = `显示了自定义 ${type} 消息`;
};

// Notification 通知
const showNotification = (
  type: 'success' | 'info' | 'warning' | 'error',
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-right'
) => {
  const titles = {
    success: '成功',
    info: '提示',
    warning: '警告',
    error: '错误',
  };

  const messages = {
    success: '这是一条成功的提示消息',
    info: '这是一条消息的提示消息',
    warning: '这是一条警告的提示消息',
    error: '这是一条错误的提示消息',
  };

  ElNotification[type]({
    title: titles[type],
    message: messages[type],
    position,
  });
  lastResult.value = `显示了 ${type} 通知（位置：${position}）`;
};

const showHTMLNotification = () => {
  ElNotification({
    title: 'HTML 片段',
    dangerouslyUseHTMLString: true,
    message: '<strong>这是 <i>HTML</i> 片段</strong>',
  });
  lastResult.value = '显示了 HTML 通知';
};

const showLongNotification = () => {
  ElNotification({
    title: '长内容通知',
    message:
      '这是一条很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长的通知内容，用于测试通知框的文本换行和滚动效果。',
  });
  lastResult.value = '显示了长内容通知';
};

const showNoAutoCloseNotification = () => {
  ElNotification({
    title: '不会自动关闭',
    message: '这条通知不会自动关闭，需要手动点击关闭按钮',
    duration: 0,
  });
  lastResult.value = '显示了不自动关闭的通知';
};

// MessageBox 消息弹框
const showAlert = async () => {
  try {
    await ElMessageBox.alert('这是一段内容', '标题名称', {
      confirmButtonText: '确定',
    });
    lastResult.value = 'Alert 已确认';
  } catch {
    lastResult.value = 'Alert 已取消';
  }
};

const showConfirm = async () => {
  try {
    await ElMessageBox.confirm('此操作将永久删除该文件, 是否继续?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    lastResult.value = 'Confirm 已确认';
  } catch {
    lastResult.value = 'Confirm 已取消';
  }
};

const showPrompt = async () => {
  try {
    const { value } = await ElMessageBox.prompt('请输入邮箱', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /[\w!#$%&'*+/=?^_`{|}~-]+(?:\.[\w!#$%&'*+/=?^_`{|}~-]+)*@(?:[\w](?:[\w-]*[\w])?\.)+[\w](?:[\w-]*[\w])?/,
      inputErrorMessage: '邮箱格式不正确',
    });
    lastResult.value = `Prompt 输入: ${value}`;
  } catch {
    lastResult.value = 'Prompt 已取消';
  }
};

const showCustomIcon = async () => {
  try {
    await ElMessageBox.confirm('此操作将永久删除该文件, 是否继续?', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      icon: h(WarningFilled, { style: { color: '#f56c6c' } }),
    });
    lastResult.value = '自定义图标已确认';
  } catch {
    lastResult.value = '自定义图标已取消';
  }
};

const showHTMLContent = async () => {
  try {
    await ElMessageBox.confirm(
      '<strong>这是 <i>HTML</i> 片段</strong>',
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        dangerouslyUseHTMLString: true,
      }
    );
    lastResult.value = 'HTML 内容已确认';
  } catch {
    lastResult.value = 'HTML 内容已取消';
  }
};

const showCenterAlign = async () => {
  try {
    await ElMessageBox.confirm('此操作将永久删除该文件, 是否继续?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info',
    });
    lastResult.value = '对话框已确认';
  } catch {
    lastResult.value = '对话框已取消';
  }
};

// Loading 加载
const showFullscreenLoading = () => {
  const loading = ElLoading.service({
    lock: true,
    text: '加载中',
    background: 'rgba(0, 0, 0, 0.7)',
  });
  setTimeout(() => {
    loading.close();
    lastResult.value = '全屏加载已关闭';
  }, 2000);
};

const showCustomLoading = () => {
  const loading = ElLoading.service({
    lock: true,
    text: '拼命加载中...',
  });
  setTimeout(() => {
    loading.close();
    lastResult.value = '自定义文本加载已关闭';
  }, 2000);
};

const showBackgroundLoading = () => {
  const loading = ElLoading.service({
    lock: true,
    text: '加载中',
    background: 'rgba(255, 0, 0, 0.3)',
  });
  setTimeout(() => {
    loading.close();
    lastResult.value = '自定义背景加载已关闭';
  }, 2000);
};

const toggleTargetLoading = () => {
  targetLoading.value = true;
  setTimeout(() => {
    targetLoading.value = false;
    lastResult.value = '容器加载已关闭';
  }, 2000);
};
</script>

<style scoped>
.messaging-test {
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

.note {
  margin-bottom: 12px;
  padding: 8px 12px;
  background-color: var(--el-fill-color-light);
  border-left: 4px solid var(--el-color-primary);
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.message-demo,
.notification-demo,
.messagebox-demo,
.loading-demo {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.loading-target {
  margin-top: 12px;
  padding: 20px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.result-display {
  padding: 16px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
  min-height: 60px;
}

.result-display p {
  margin: 0;
  color: var(--el-text-color-primary);
  font-family: 'Courier New', monospace;
}

.result-display .placeholder {
  color: var(--el-text-color-placeholder);
  font-style: italic;
}
</style>