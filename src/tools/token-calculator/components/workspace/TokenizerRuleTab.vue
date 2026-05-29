<template>
  <div class="placeholder-tab">
    <div class="placeholder-card">
      <el-icon :size="42" color="var(--text-color-light)">
        <Connection />
      </el-icon>
      <h3 class="placeholder-title">匹配规则</h3>
      <p class="placeholder-desc">
        管理「模型 ID → Tokenizer Profile」的显式映射规则。<br />
        Phase 4 实施，敬请期待。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Connection } from "@element-plus/icons-vue";
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
