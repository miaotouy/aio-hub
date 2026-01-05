<script setup lang="ts">
import { showToast } from 'vant';

const onClick = () => {
  showToast('AIO Hub Mobile 准备就绪！');
};
</script>

<template>
  <div class="mobile-container">
    <van-nav-bar title="AIO Hub Mobile" />
    
    <div class="content">
      <van-empty description="移动端开发环境已就绪">
        <van-button round type="primary" class="bottom-button" @click="onClick">
          测试 Vant
        </van-button>
      </van-empty>
    </div>
  </div>
</template>

<style scoped>
.mobile-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f7f8fa;
}

.content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bottom-button {
  width: 160px;
  height: 40px;
}
</style>