<script setup lang="ts">
import { ref, onMounted, markRaw } from "vue";
import { getName, getVersion } from "@tauri-apps/api/app";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import iconColor from "@/assets/aio-icon-color.svg";
import {
  User,
  Link,
  DocumentCopy,
  Star,
  Present,
} from "@element-plus/icons-vue";

// 创建模块错误处理器
const errorHandler = createModuleErrorHandler("AboutSettings");

// 应用信息
const appInfo = ref({
  name: "",
  version: "",
});


// 链接
const links = [
  {
    title: "开发者",
    value: "miaotouy",
    icon: markRaw(User),
  },
  {
    title: "仓库",
    value: "miaotouy/aio-hub",
    icon: markRaw(Link),
  },
  {
    title: "许可证",
    value: "MIT License",
    icon: markRaw(DocumentCopy),
  },
];

// 支持项目
const supportActions = [
  {
    title: "⭐ 给项目点个 Star",
    description: "在 GitHub 上为项目点亮 Star，这是对作者最大的鼓励",
    icon: markRaw(Star),
    action: "https://github.com/miaotouy/aio-hub",
  },
  {
    title: "☕ 爱发电赞助",
    description: "支持作者继续开发维护，探索更多创新功能",
    icon: markRaw(Present),
    action: "https://afdian.com/a/miaotouy",
    highlighted: true,
  },
];

// 打开外部链接
const openUrl = (url: string) => {
  window.open(url, "_blank");
};

// 初始化
onMounted(async () => {
  try {
    appInfo.value.name = await getName();
    appInfo.value.version = await getVersion();
  } catch (error) {
    errorHandler.error(error as Error, "获取应用信息失败", {
      context: {
        fallbackName: "AIO Hub",
        fallbackVersion: "1.0.0",
      },
      showToUser: false,
    });
    appInfo.value.name = "AIO Hub";
    appInfo.value.version = "1.0.0";
  }
});
</script>

<template>
  <div class="about-settings">
    <!-- 应用头部信息 -->
    <div class="app-header">
      <img :src="iconColor" alt="App Icon" class="app-icon" />
      <div class="app-info">
        <h1 class="app-name">{{ appInfo.name || "AIO Hub" }}</h1>
        <p class="app-version">版本 {{ appInfo.version || "1.0.0" }}</p>
        <p class="app-description">提供多种实用的开发和日常工具，以及高可控性的LLM交互。</p>
      </div>
    </div>

    <!-- 项目信息 -->
    <div class="section">
      <div class="project-info">
        <div v-for="link in links" :key="link.title" class="info-item">
          <el-icon class="info-icon" :size="18">
            <component :is="link.icon" />
          </el-icon>
          <span class="info-label">{{ link.title }}：</span>
          <span class="info-value">{{ link.value }}</span>
        </div>
      </div>
    </div>

    <!-- 支持项目 -->
    <div class="section">
      <div class="support-container">
        <p class="support-description">
          AIO Hub 是完全免费的开源项目，作者几乎全职投入开发。你的支持将帮助：
        </p>
        <ul class="support-benefits">
          <li>🚀 持续添加新功能和工具</li>
          <li>🐛 及时修复问题和优化性能</li>
          <li>📚 完善文档和使用教程</li>
          <li>💡 探索更多创新想法</li>
        </ul>
        <div class="support-actions">
          <div
            v-for="action in supportActions"
            :key="action.title"
            class="support-action-card"
            :class="{ highlighted: action.highlighted }"
            @click="openUrl(action.action)"
          >
            <el-icon class="action-icon" :size="28">
              <component :is="action.icon" />
            </el-icon>
            <div class="action-content">
              <h3 class="action-title">{{ action.title }}</h3>
              <p class="action-description">{{ action.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 版权信息 -->
    <div class="copyright">
      <p>© 2025 miaotouy. All rights reserved.</p>
    </div>
  </div>
</template>

<style scoped>
.about-settings {
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
}

/* 应用头部 */
.app-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 32px;
  background: var(--el-bg-color-overlay);
  border-radius: 12px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(var(--ui-blur));
}

.app-icon {
  width: 100px;
  height: 100px;
  flex-shrink: 0;
}

.app-info {
  flex: 1;
}

.app-name {
  margin: 0 0 8px 0;
  font-size: 32px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.app-version {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: var(--el-color-primary);
  font-weight: 500;
}

.app-description {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

/* 区块 */
.section {
  margin-bottom: 24px;
  backdrop-filter: blur(var(--ui-blur));
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 项目信息 */
.project-info {
  padding: 16px;
  background: var(--el-bg-color-overlay);
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
}

.info-item {
  margin: 0 0 16px 0;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.info-label {
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}

.info-value {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

/* 支持项目 */
.support-container {
  padding: 20px;
  background: var(--el-bg-color-overlay);
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
}

.support-description {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.support-benefits {
  margin: 0 0 20px 0;
  padding-left: 20px;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.8;
}

.support-benefits li {
  margin-bottom: 4px;
}

.support-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.support-action-card {
  display: flex;
  gap: 16px;
  padding: 20px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 2px solid var(--el-border-color);
  cursor: pointer;
  transition: all 0.3s;
}

.support-action-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: var(--el-color-primary);
}

.support-action-card.highlighted {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-primary) 10%, transparent),
    color-mix(in srgb, #ff69b4 8%, transparent)
  );
  border-color: var(--el-color-primary);
}

.support-action-card.highlighted:hover {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-primary) 15%, transparent),
    color-mix(in srgb, #ff69b4 12%, transparent)
  );
  box-shadow: 0 6px 16px rgba(255, 105, 180, 0.2);
}

.action-icon {
  flex-shrink: 0;
  color: var(--el-color-primary);
}

.support-action-card.highlighted .action-icon {
  color: #ff69b4;
}

.action-content {
  flex: 1;
  min-width: 0;
}

.action-title {
  margin: 0 0 6px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.action-description {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
}

/* 版权信息 */
.copyright {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color);
  text-align: center;
}

.copyright p {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 响应式 */
/* 中等屏幕 (768px - 1024px) */
@media (max-width: 1024px) {
  .about-settings {
    padding: 20px;
  }
}

/* 平板屏幕 (576px - 768px) */
@media (max-width: 768px) {
  .about-settings {
    padding: 16px;
  }

  .app-header {
    flex-direction: column;
    text-align: center;
    padding: 24px;
    gap: 16px;
  }

  .app-icon {
    width: 80px;
    height: 80px;
  }

  .app-name {
    font-size: 24px;
  }

  .section-title {
    font-size: 18px;
  }
}

/* 小屏手机 (<576px) */
@media (max-width: 576px) {
  .about-settings {
    padding: 12px;
  }

  .app-header {
    padding: 16px;
    gap: 12px;
  }

  .app-icon {
    width: 64px;
    height: 64px;
  }

  .app-name {
    font-size: 20px;
  }

  .app-version {
    font-size: 14px;
  }

  .app-description {
    font-size: 13px;
  }

  .section-title {
    font-size: 16px;
    margin-bottom: 12px;
  }

  .project-info {
    padding: 12px;
  }

  .info-item {
    font-size: 13px;
    margin-bottom: 12px;
  }
}
</style>
