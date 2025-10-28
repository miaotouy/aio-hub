<script setup lang="ts">
import { ref, onMounted, markRaw } from "vue";
import { getName, getVersion } from "@tauri-apps/api/app";
import { createModuleLogger } from "@utils/logger";
import iconColor from "@/assets/aio-icon-color.svg";
import {
  Monitor,
  ChatLineRound,
  Connection,
  Brush,
  Tools,
  User,
  Link,
  DocumentCopy,
} from "@element-plus/icons-vue";
import OcrIcon from '@components/icons/OcrIcon.vue';

// 创建模块日志记录器
const logger = createModuleLogger("AboutSettings");

// 应用信息
const appInfo = ref({
  name: "",
  version: "",
});

// 核心功能特性
const coreFeatures = [
  {
    title: "多窗口支持",
    description: "工具可拖拽分离为独立浮动窗口，支持多任务布局",
    icon: markRaw(Monitor),
  },
  {
    title: "树形对话历史",
    description: "革命性的非线性对话管理，每次重新生成创建新分支",
    icon: markRaw(ChatLineRound),
  },
  {
    title: "智能 OCR",
    description: "多引擎支持，智能切图，交互式处理",
    icon: markRaw(OcrIcon),
  },
  {
    title: "LLM 服务配置",
    description: "集中管理 API 配置，支持主流服务商",
    icon: markRaw(Connection),
  },
  {
    title: "全局样式覆盖",
    description: "内置 CSS 编辑器，深度定制应用外观",
    icon: markRaw(Brush),
  },
  {
    title: "丰富的工具集",
    description: "Git 分析、正则应用、目录清理等实用工具",
    icon: markRaw(Tools),
  },
];

// 技术栈
const techStack = [
  { name: "Tauri", version: "2.0" },
  { name: "Vue", version: "3" },
  { name: "TypeScript", version: "" },
  { name: "Element Plus", version: "" },
  { name: "Rust", version: "" },
];

// 链接
const links = [
  {
    title: "开发者",
    value: "miaotouy",
    icon: markRaw(User),
  },
  {
    title: "仓库",
    value: "aiohub",
    icon: markRaw(Link),
  },
  {
    title: "许可证",
    value: "还没想好",
    icon: markRaw(DocumentCopy),
  },
];

// 初始化
onMounted(async () => {
  try {
    appInfo.value.name = await getName();
    appInfo.value.version = await getVersion();
  } catch (error) {
    logger.error("获取应用信息失败", error, {
      fallbackName: "AIO Hub",
      fallbackVersion: "1.0.0",
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
        <p class="app-description">一个功能丰富的桌面端枢纽应用</p>
      </div>
    </div>

    <!-- 核心功能 -->
    <div class="section">
      <h2 class="section-title">✨ 核心功能</h2>
      <div class="features-grid">
        <div v-for="feature in coreFeatures" :key="feature.title" class="feature-card">
          <el-icon class="feature-icon" :size="32">
            <component :is="feature.icon" />
          </el-icon>
          <div class="feature-content">
            <h3 class="feature-title">{{ feature.title }}</h3>
            <p class="feature-description">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 技术栈 -->
    <div class="section">
      <h2 class="section-title">🔧 技术栈</h2>
      <div class="tech-stack">
        <div v-for="tech in techStack" :key="tech.name" class="tech-item">
          <span class="tech-name">{{ tech.name }}</span>
          <span v-if="tech.version" class="tech-version">{{ tech.version }}</span>
        </div>
      </div>
    </div>

    <!-- 项目信息 -->
    <div class="section">
      <h2 class="section-title">📝 项目信息</h2>
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
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 功能网格 */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.feature-card {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: var(--el-bg-color-overlay);
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  transition: all 0.3s;
}

.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--el-color-primary);
}

.feature-icon {
  flex-shrink: 0;
  color: var(--el-color-primary);
}

.feature-content {
  flex: 1;
  min-width: 0;
}

.feature-title {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.feature-description {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
}

/* 技术栈 */
.tech-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tech-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--el-color-primary) 5%, transparent);
  border: 1px solid var(--el-color-primary);
  color: var(--el-color-primary);
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
}

.tech-item:hover {
  background: color-mix(in srgb, var(--el-color-primary) 25%, transparent);
  border-color: var(--el-color-primary-light-3);
}

.tech-version {
  opacity: 0.8;
  font-size: 12px;
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
/* 大屏优化 (1200px+) */
@media (min-width: 1200px) {
  .features-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* 中等屏幕 (768px - 1024px) */
@media (max-width: 1024px) {
  .about-settings {
    padding: 20px;
  }
  
  .features-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
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

  .features-grid {
    grid-template-columns: 1fr;
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
  
  .feature-card {
    padding: 12px;
  }
  
  .feature-icon {
    font-size: 24px;
  }
  
  .tech-stack {
    gap: 8px;
  }
  
  .tech-item {
    padding: 6px 12px;
    font-size: 13px;
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