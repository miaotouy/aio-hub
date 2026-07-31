<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->
<script setup lang="ts">
import { CircleCheckFilled } from "@element-plus/icons-vue";
import type { UpgradeFlowContext } from "../types";

defineProps<{ context: UpgradeFlowContext }>();
</script>

<template>
  <div class="upgrade-complete">
    <el-icon><CircleCheckFilled /></el-icon>
    <h3>版本信息已确认</h3>
    <p>
      已处理 {{ context.releaseVersions.length }} 份版本说明。你可以随时在“设置
      → 关于”中重新查看当前版本说明。
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
