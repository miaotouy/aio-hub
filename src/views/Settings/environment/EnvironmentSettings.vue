<script setup lang="ts">
import { computed, reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpened } from "@element-plus/icons-vue";
import {
  ExternalLink,
  FileCode2,
  GitBranch,
  RadioTower,
} from "lucide-vue-next";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import {
  defaultEnvironmentSettings,
  type EnvironmentSettings,
} from "@/utils/appSettings";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

interface CommandVersionInfo {
  available: boolean;
  version?: string;
  error?: string;
}

interface DependencyCard {
  key: "ffmpegPath" | "ffprobePath" | "gitPath";
  name: string;
  description: string;
  placeholder: string;
  versionArg: string;
  downloadUrl: string;
  icon: any;
}

const settingsStore = useAppSettingsStore();
const errorHandler = createModuleErrorHandler("EnvironmentSettings");

const statusMap = reactive<
  Record<string, { checking: boolean; result: CommandVersionInfo | null }>
>({
  ffmpegPath: { checking: false, result: null },
  ffprobePath: { checking: false, result: null },
  gitPath: { checking: false, result: null },
});

const environment = computed({
  get: () => settingsStore.environment,
  set: (value: EnvironmentSettings) => {
    settingsStore.update({ environment: value });
  },
});

const dependencyCards: DependencyCard[] = [
  {
    key: "ffmpegPath",
    name: "FFmpeg 多媒体引擎",
    description: "用于视频压缩、音频提取和媒体元数据解析。",
    placeholder: "ffmpeg 或 C:\\ffmpeg\\bin\\ffmpeg.exe",
    versionArg: "-version",
    downloadUrl: "https://ffmpeg.org/download.html",
    icon: RadioTower,
  },
  {
    key: "ffprobePath",
    name: "FFprobe 媒体探针",
    description: "用于读取完整媒体流、编码器和容器信息。",
    placeholder: "ffprobe 或 C:\\ffmpeg\\bin\\ffprobe.exe",
    versionArg: "-version",
    downloadUrl: "https://ffmpeg.org/download.html",
    icon: FileCode2,
  },
  {
    key: "gitPath",
    name: "Git CLI",
    description: "用于仓库分析、技能安装和未来的版本控制集成。",
    placeholder: "git 或 C:\\Program Files\\Git\\cmd\\git.exe",
    versionArg: "--version",
    downloadUrl: "https://git-scm.com/downloads",
    icon: GitBranch,
  },
];

const updateEnvironment = (updates: Partial<EnvironmentSettings>) => {
  settingsStore.update({
    environment: {
      ...defaultEnvironmentSettings,
      ...environment.value,
      runtimes: {
        ...defaultEnvironmentSettings.runtimes,
        ...environment.value.runtimes,
      },
      documentConverters: {
        ...defaultEnvironmentSettings.documentConverters,
        ...environment.value.documentConverters,
      },
      ...updates,
    },
  });
};

const getPath = (card: DependencyCard) =>
  environment.value[card.key]?.trim() ||
  defaultEnvironmentSettings[card.key] ||
  "";

const handlePathUpdate = (card: DependencyCard, value: string) => {
  updateEnvironment({ [card.key]: value } as Partial<EnvironmentSettings>);
  statusMap[card.key].result = null;
};

const selectExecutable = async (card: DependencyCard) => {
  const selected = await open({
    multiple: false,
    title: `选择 ${card.name} 可执行文件`,
    filters: [
      {
        name: "Executable",
        extensions: ["exe", "cmd", "bat", "bin", "sh", "*"],
      },
    ],
  });

  if (selected && typeof selected === "string") {
    handlePathUpdate(card, selected);
  }
};

const testDependency = async (card: DependencyCard) => {
  const targetPath = getPath(card);
  statusMap[card.key].checking = true;
  try {
    const result = await invoke<CommandVersionInfo>("check_command_version", {
      path: targetPath,
      versionArg: card.versionArg,
    });
    statusMap[card.key].result = result;
    if (result.available) {
      customMessage.success(`${card.name} 可用`);
    } else {
      customMessage.error(`${card.name} 未检测到`);
    }
  } catch (error) {
    statusMap[card.key].result = {
      available: false,
      error: String(error),
    };
    errorHandler.error(error as Error, `检测 ${card.name} 失败`);
  } finally {
    statusMap[card.key].checking = false;
  }
};

const openDownload = (url: string) => {
  window.open(url, "_blank");
};
</script>

<template>
  <div class="environment-settings">
    <div class="intro-row">
      <div>
        <h3>运行环境与外部依赖</h3>
        <p>这里配置全局默认路径。工具自身路径留空时会自动跟随这些全局设置。</p>
      </div>
    </div>

    <div class="dependency-grid">
      <article
        v-for="card in dependencyCards"
        :key="card.key"
        class="dependency-card"
      >
        <header class="card-header">
          <div class="title-area">
            <el-icon class="dependency-icon"
              ><component :is="card.icon"
            /></el-icon>
            <div>
              <h4>{{ card.name }}</h4>
              <p>{{ card.description }}</p>
            </div>
          </div>
          <el-tag
            :type="
              statusMap[card.key].result?.available
                ? 'success'
                : statusMap[card.key].result
                  ? 'danger'
                  : 'info'
            "
            effect="plain"
            size="small"
          >
            {{
              statusMap[card.key].result?.available
                ? "已就绪"
                : statusMap[card.key].result
                  ? "未检测到"
                  : "未检测"
            }}
          </el-tag>
        </header>

        <el-form label-position="top" class="dependency-form">
          <el-form-item label="执行路径">
            <el-input
              :model-value="getPath(card)"
              :placeholder="card.placeholder"
              @update:model-value="
                (value: string) => handlePathUpdate(card, value)
              "
            >
              <template #append>
                <el-tooltip content="选择文件" placement="top">
                  <el-button @click="selectExecutable(card)">
                    <el-icon><FolderOpened /></el-icon>
                  </el-button>
                </el-tooltip>
              </template>
            </el-input>
          </el-form-item>
        </el-form>

        <div v-if="statusMap[card.key].result" class="status-line">
          <span
            class="status-dot"
            :class="{ ok: statusMap[card.key].result?.available }"
          ></span>
          <span class="status-text">
            {{
              statusMap[card.key].result?.version ||
              statusMap[card.key].result?.error ||
              "未检测到可用版本"
            }}
          </span>
        </div>

        <footer class="card-actions">
          <el-button
            type="primary"
            plain
            :loading="statusMap[card.key].checking"
            @click="testDependency(card)"
          >
            检测
          </el-button>
          <el-button
            link
            type="primary"
            @click="openDownload(card.downloadUrl)"
          >
            <el-icon><ExternalLink /></el-icon>
            下载指引
          </el-button>
        </footer>
      </article>
    </div>
  </div>
</template>

<style scoped>
.environment-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.intro-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.intro-row h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 18px;
  font-weight: 600;
}

.intro-row p {
  margin: 6px 0 0;
  color: var(--text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.dependency-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.dependency-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 18px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.title-area {
  display: flex;
  gap: 12px;
  min-width: 0;
}

.dependency-icon {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  border-radius: 8px;
}

.title-area h4 {
  margin: 0;
  color: var(--text-color);
  font-size: 15px;
  font-weight: 600;
}

.title-area p {
  margin: 4px 0 0;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.dependency-form {
  min-width: 0;
}

.dependency-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger-color);
  flex-shrink: 0;
}

.status-dot.ok {
  background: var(--success-color);
}

.status-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
}

@media (max-width: 520px) {
  .dependency-grid {
    grid-template-columns: 1fr;
  }

  .card-header,
  .card-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
