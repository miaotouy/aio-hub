<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { CircleCheckFilled } from "@element-plus/icons-vue";
import type { UpgradeFlowContext } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const handledCount = Object.keys(props.context.contributions).length;
</script>

<template>
  <div class="upgrade-complete">
    <el-icon><CircleCheckFilled /></el-icon>
    <h3>升级事项已处理</h3>
    <p>
      本次流程已处理
      {{ handledCount }} 个升级事项。版本说明可随时从消息中心或“设置 →
      关于”单独查看。
    </p>
  </div>
</template>

<style scoped>
.upgrade-complete {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 28px 18px;
  text-align: center;
}

.el-icon {
  color: var(--el-color-success);
  font-size: 54px;
}

h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 22px;
}

p {
  max-width: 480px;
  margin: 0;
  color: var(--text-color-secondary);
  line-height: 1.7;
}
</style>
