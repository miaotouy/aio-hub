<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessageBox } from "element-plus";
import { getName, getVersion } from "@tauri-apps/api/app";

// 应用信息
const appInfo = ref({
  name: "",
  version: "",
});

// 显示关于信息
const showAbout = () => {
  ElMessageBox.alert(
    `<div style="text-align: center;">
      <h3>${appInfo.value.name}</h3>
      <p>版本: ${appInfo.value.version}</p>
      <p style="margin-top: 20px; color: #909399;">一个功能丰富的工具箱应用</p>
    </div>`,
    "关于",
    {
      dangerouslyUseHTMLString: true,
      confirmButtonText: "确定",
    }
  );
};

// 初始化
onMounted(async () => {
  // 获取应用信息
  try {
    appInfo.value.name = await getName();
    appInfo.value.version = await getVersion();
  } catch (error) {
    console.error("获取应用信息失败:", error);
    appInfo.value.name = "AIO工具箱";
    appInfo.value.version = "1.0.0";
  }
});
</script>

<template>
  <div class="about-settings">
    <div class="setting-item">
      <div class="setting-label">
        <span>应用信息</span>
      </div>
      <el-button @click="showAbout" size="small">查看详情</el-button>
    </div>

    <div class="about-info">
      <p>{{ appInfo.name }}</p>
      <p class="version">版本：{{ appInfo.version }}</p>
    </div>
  </div>
</template>

<style scoped>
.about-settings {
  padding: 0 24px 24px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-color);
}

.about-info {
  margin-top: 6px;
  border-radius: 6px;
}

.about-info p {
  margin: 4px 0;
  color: var(--text-color);
}

.about-info .version {
  font-size: 13px;
  color: var(--text-color-secondary);
}
</style>