<script setup lang="ts">
// 插件市场 - 阶段四功能，当前仅为占位
</script>

<template>
  <div class="plugin-market">
    <el-empty description="插件市场功能即将推出" :image-size="150">
      <template #image>
        <div class="coming-soon-icon">🚀</div>
      </template>
      <template #default>
        <div class="coming-soon-content">
          <p class="hint-title">敬请期待</p>
          <p class="hint-text">我们正在构建插件市场，届时你将可以：</p>
          <ul class="feature-list">
            <li>浏览官方和社区插件</li>
            <li>一键安装和更新插件</li>
            <li>查看插件评分和评论</li>
            <li>发布自己的插件</li>
          </ul>
        </div>
      </template>
    </el-empty>
  </div>
</template>

<style scoped>
.plugin-market {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.coming-soon-icon {
  font-size: 120px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.coming-soon-content {
  max-width: 400px;
  text-align: center;
}

.hint-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
  margin: 16px 0 8px 0;
}

.hint-text {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin: 0 0 16px 0;
}

.feature-list {
  text-align: left;
  display: inline-block;
  margin: 0;
  padding-left: 24px;
  color: var(--text-color);
  font-size: 14px;
  line-height: 2;
}

.feature-list li {
  position: relative;
}

.feature-list li::marker {
  color: var(--primary-color);
}
</style>