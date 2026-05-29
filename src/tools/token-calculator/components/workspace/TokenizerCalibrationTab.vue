<template>
  <div class="placeholder-tab">
    <div class="placeholder-card">
      <el-icon :size="42" color="var(--text-color-light)">
        <SetUp />
      </el-icon>
      <h3 class="placeholder-title">校准设置</h3>
      <p class="placeholder-desc">
        为没有公开分词器的模型（如新 Claude）配置乘性倍率与固定 overhead，<br />
        得到保守的 token 估算。<br />
        Phase 6 实施，敬请期待。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SetUp } from "@element-plus/icons-vue";
</script>

<style scoped>
.placeholder-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}

.placeholder-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 60px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
  text-align: center;
  max-width: 480px;
}

.placeholder-title {
  margin: 0;
  font-size: 18px;
  color: var(--text-color);
  font-weight: 600;
}

.placeholder-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-color-secondary);
}
</style>
