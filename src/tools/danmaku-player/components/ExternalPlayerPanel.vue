<template>
  <div class="external-player-panel">
    <div class="panel-layout">
      <div class="panel-main">
        <section class="external-card">
          <header class="external-card__header">
            <div class="external-card__title">
              <Monitor :size="16" />
              <span>播放器连接</span>
            </div>
            <span class="connection-status" :class="{ 'connection-status--connected': overlayState.connected }">
              <Circle :size="8" fill="currentColor" />
              {{ overlayState.connected ? "已连接" : "未连接" }}
            </span>
          </header>

          <el-form class="connection-form" label-position="top">
            <div class="form-grid">
              <el-form-item label="播放器类型">
                <el-select v-model="playerConfig.playerType" size="small" class="full-width">
                  <el-option label="MPC-BE" value="mpc-be" />
                </el-select>
              </el-form-item>

              <el-form-item label="Web 端口">
                <el-input-number
                  v-model="playerConfig.webPort"
                  :min="1"
                  :max="65535"
                  :step="1"
                  :controls="false"
                  size="small"
                  class="full-width"
                />
              </el-form-item>
            </div>

            <div class="action-row">
              <el-button-group>
                <el-button :loading="scanning" size="small" @click="handleScanPlayerWindows(true)">
                  <Search :size="14" />
                  扫描播放器
                </el-button>
                <el-dropdown trigger="click" @command="handleScanCommand">
                  <el-button size="small" :disabled="scanning">
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="default">仅扫描 MPC-BE</el-dropdown-item>
                      <el-dropdown-item command="all">扫描所有窗口</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </el-button-group>
              <el-button :loading="testingConnection" size="small" type="primary" plain @click="handleTestConnection">
                <Link :size="14" />
                测试连接
              </el-button>
            </div>
          </el-form>

          <div class="window-list">
            <div class="window-list__title">发现的窗口</div>
            <el-radio-group
              v-if="playerWindows.length > 0"
              :model-value="overlayState.targetHwnd"
              class="window-radio-group"
              @change="handleWindowChange"
            >
              <el-radio v-for="windowInfo in playerWindows" :key="windowInfo.hwnd" :value="windowInfo.hwnd">
                <span class="window-item">
                  <span class="window-item__title" :title="windowInfo.title">{{
                    windowInfo.title || "未命名播放器窗口"
                  }}</span>
                  <span class="window-item__meta">
                    <span class="class-tag">{{ windowInfo.className }}</span>
                    hwnd: {{ windowInfo.hwnd }}
                  </span>
                </span>
              </el-radio>
            </el-radio-group>
            <el-empty v-else description="未发现播放器窗口" :image-size="48" />
          </div>
        </section>

        <section class="external-card">
          <header class="external-card__header">
            <div class="external-card__title">
              <Crop :size="16" />
              <span>覆盖区域裁切</span>
            </div>
          </header>

          <el-form class="crop-form" label-position="left" label-width="112px">
            <el-form-item label="上边距 (菜单栏)">
              <el-input-number
                v-model="playerConfig.offsetTop"
                :min="0"
                :max="500"
                :step="1"
                size="small"
                controls-position="right"
              />
              <span class="unit-label">px</span>
            </el-form-item>

            <el-form-item label="下边距 (控制栏)">
              <el-input-number
                v-model="playerConfig.offsetBottom"
                :min="0"
                :max="500"
                :step="1"
                size="small"
                controls-position="right"
              />
              <span class="unit-label">px</span>
            </el-form-item>
          </el-form>

          <p class="hint-text">
            <Info :size="14" />
            输入像素值排除播放器的菜单栏和控制栏区域。
          </p>
        </section>

        <section class="external-card external-card--status">
          <div class="cover-action">
            <el-button
              v-if="!overlayState.overlayCreated"
              type="success"
              :disabled="!canStartOverlay"
              :loading="startingOverlay"
              @click="handleStartOverlay"
            >
              <Play :size="15" />
              启动弹幕覆盖
            </el-button>
            <el-button v-else type="danger" :loading="closingOverlay" @click="handleCloseOverlay">
              <Square :size="15" />
              关闭覆盖
            </el-button>
          </div>

          <div class="status-box">
            <div class="status-box__title">播放状态</div>
            <div class="status-line">
              <Film :size="15" />
              <span class="status-line__main">{{ currentFileLabel }}</span>
            </div>
            <div class="status-line">
              <component :is="playbackIcon" :size="15" />
              <span>{{ playbackStateLabel }}</span>
              <span class="status-line__time">{{ formattedPosition }} / {{ formattedDuration }}</span>
            </div>
            <div class="status-line">
              <Circle :size="10" fill="currentColor" :class="overlayActive ? 'status-success' : 'status-danger'" />
              <span :class="overlayActive ? 'status-success' : 'status-danger'">
                {{ overlayActive ? "覆盖窗口已激活" : "覆盖窗口未启动" }}
              </span>
              <span v-if="overlayActive" class="status-line__muted">窗口位置同步中</span>
            </div>

            <div class="status-line extra-options">
              <el-checkbox v-model="playerConfig.enableFullscreenBoost" size="small">
                全屏覆盖增强 (强制置顶)
              </el-checkbox>
            </div>
          </div>

          <p v-if="!canStartOverlay && !overlayState.overlayCreated" class="start-requirements">
            需要先加载 ASS 弹幕、选择播放器窗口，并通过 Web 端口连接测试。
          </p>
        </section>
      </div>

      <div class="panel-side">
        <section class="external-card">
          <header class="external-card__header">
            <div class="external-card__title">
              <Settings2 :size="16" />
              <span>弹幕显示设置</span>
            </div>
          </header>
          <DanmakuSettingsPanel :config="config" />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Circle,
  Crop,
  Film,
  Info,
  Link,
  Monitor,
  Pause,
  Play,
  Search,
  Square,
  ArrowDown,
  Settings2,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import DanmakuSettingsPanel from "./DanmakuSettingsPanel.vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useExternalPlayer } from "../composables/useExternalPlayer";
import { useDanmakuOverlay } from "../composables/useDanmakuOverlay";
import type { AssScriptInfo, DanmakuConfig, ParsedDanmaku } from "../types";

const props = defineProps<{
  danmakus: ParsedDanmaku[];
  scriptInfo: AssScriptInfo;
  config: DanmakuConfig;
}>();

const errorHandler = createModuleErrorHandler("danmaku-player/externalPlayerPanel");

const {
  playerWindows,
  playerConfig,
  overlayState,
  scanning,
  scanPlayerWindows,
  testConnection,
  selectPlayerWindow,
  startStatusPreview,
  stopStatusPreview,
} = useExternalPlayer();

const { overlayActive, createOverlay, closeOverlay, initOverlay, syncConfig, syncDanmakus, startPositionSync } =
  useDanmakuOverlay();

const testingConnection = ref(false);
const startingOverlay = ref(false);
const closingOverlay = ref(false);

const canStartOverlay = computed(() => {
  return (
    props.danmakus.length > 0 && overlayState.targetHwnd !== null && overlayState.connected && !startingOverlay.value
  );
});

const currentFileLabel = computed(() => overlayState.currentFile || "未获取到播放文件");

const playbackStateLabel = computed(() => {
  switch (overlayState.playbackState) {
    case "Playing":
      return "正在播放";
    case "Paused":
      return "已暂停";
    case "Stopped":
      return "已停止";
    case "Disconnected":
    default:
      return "未连接";
  }
});

const playbackIcon = computed(() => {
  return overlayState.playbackState === "Playing" ? Play : Pause;
});

const formattedPosition = computed(() => formatDuration(overlayState.currentPosition));
const formattedDuration = computed(() => formatDuration(overlayState.totalDuration));

function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "00:00:00";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

async function handleScanPlayerWindows(useDefault = true): Promise<void> {
  try {
    // 默认扫描支持多种常见的 MPC 类名
    const classNames = useDefault ? ["MediaPlayerClassicW", "MPC-BE"] : undefined;
    const windows = await scanPlayerWindows(classNames);

    if (windows.length === 0) {
      customMessage.warning(useDefault ? "未发现 MPC-BE 窗口，请尝试“扫描所有窗口”" : "未发现任何可见窗口");
      return;
    }

    customMessage.success(`发现 ${windows.length} 个窗口`);
  } catch (error) {
    errorHandler.error(error, "扫描播放器窗口失败");
  }
}

function handleScanCommand(command: string): void {
  if (command === "all") {
    void handleScanPlayerWindows(false);
  } else {
    void handleScanPlayerWindows(true);
  }
}

async function handleTestConnection(): Promise<void> {
  testingConnection.value = true;

  try {
    const connected = await testConnection();

    if (connected) {
      customMessage.success("MPC-BE Web 接口连接成功");
    } else {
      customMessage.error("MPC-BE Web 接口连接失败，请检查端口和播放器设置");
    }
  } catch (error) {
    errorHandler.error(error, "MPC-BE Web 接口连接测试失败", {
      port: playerConfig.webPort,
    });
  } finally {
    testingConnection.value = false;
  }
}

function handleWindowChange(value: string | number | boolean | undefined): void {
  const hwnd = Number(value);

  if (!Number.isFinite(hwnd)) {
    return;
  }

  selectPlayerWindow(hwnd);
}

async function handleStartOverlay(): Promise<void> {
  if (overlayState.targetHwnd === null) {
    customMessage.warning("请先选择播放器窗口");
    return;
  }

  if (props.danmakus.length === 0) {
    customMessage.warning("请先加载 ASS 弹幕文件");
    return;
  }

  startingOverlay.value = true;

  try {
    const label = await createOverlay(overlayState.targetHwnd);

    if (!label) {
      customMessage.error("弹幕覆盖窗口创建失败");
      return;
    }

    await initOverlay(props.danmakus, props.scriptInfo, props.config, playerConfig.webPort);
    startPositionSync(overlayState.targetHwnd, playerConfig);
    overlayState.overlayCreated = true;
    customMessage.success("弹幕覆盖已启动");
  } catch (error) {
    overlayState.overlayCreated = false;
    errorHandler.error(error, "启动弹幕覆盖失败", {
      targetHwnd: overlayState.targetHwnd,
      danmakuCount: props.danmakus.length,
      port: playerConfig.webPort,
    });
  } finally {
    startingOverlay.value = false;
  }
}

async function handleCloseOverlay(): Promise<void> {
  closingOverlay.value = true;

  try {
    await closeOverlay();
    overlayState.overlayCreated = false;
    customMessage.success("弹幕覆盖已关闭");
  } catch (error) {
    errorHandler.error(error, "关闭弹幕覆盖失败", {
      targetHwnd: overlayState.targetHwnd,
    });
  } finally {
    closingOverlay.value = false;
  }
}

watch(
  () => props.config,
  async (config) => {
    if (!overlayActive.value) {
      return;
    }

    await syncConfig(config);
  },
  { deep: true },
);

watch(
  () => [props.danmakus, props.scriptInfo] as const,
  async ([danmakus, scriptInfo]) => {
    if (!overlayActive.value) {
      return;
    }

    await syncDanmakus(danmakus, scriptInfo);
  },
  { deep: true },
);

watch(
  () => [
    playerConfig.offsetTop,
    playerConfig.offsetBottom,
    playerConfig.fullscreenOffsetTop,
    playerConfig.fullscreenOffsetBottom,
    playerConfig.enableFullscreenBoost,
  ],
  () => {
    if (!overlayActive.value || overlayState.targetHwnd === null) {
      return;
    }

    startPositionSync(overlayState.targetHwnd, playerConfig);
  },
);

onMounted(() => {
  startStatusPreview();
  // 挂载时自动扫描一次默认播放器窗口，提升用户体验
  void handleScanPlayerWindows(true);
});

onBeforeUnmount(() => {
  stopStatusPreview();

  if (overlayActive.value) {
    void handleCloseOverlay();
  }
});
</script>

<style scoped>
.external-player-panel {
  width: 100%;
  height: 100%;
  padding: 12px;
  overflow: auto;
  background: var(--container-bg);
  box-sizing: border-box;
}

.panel-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 12px;
  align-items: start;
}

.panel-main,
.panel-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.external-card {
  flex-shrink: 0;
  padding: 12px;
  border-radius: 10px;
  border: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.external-card--status {
  margin-bottom: 4px;
}

.external-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.external-card__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.connection-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.connection-status--connected {
  color: var(--el-color-success);
}

.connection-form :deep(.el-form-item),
.crop-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px;
  gap: 10px;
}

.full-width {
  width: 100%;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-row :deep(.el-button),
.cover-action :deep(.el-button) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.window-list {
  margin-top: 12px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--input-bg);
}

.window-list__title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.window-radio-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.window-radio-group :deep(.el-radio) {
  width: 100%;
  height: auto;
  min-height: 28px;
  margin-right: 0;
  white-space: normal;
}

.window-radio-group :deep(.el-radio__label) {
  flex: 1;
  min-width: 0;
}

.window-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.window-item__title {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-item__meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.class-tag {
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  font-family: var(--el-font-family-mono);
}

.crop-form {
  max-width: 320px;
}

.crop-form :deep(.el-form-item__content) {
  flex-wrap: nowrap;
}

.unit-label {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.hint-text,
.start-requirements {
  margin: 6px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.cover-action {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.status-box {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--input-bg);
}

.status-box__title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 24px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.status-line__main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-line__time,
.status-line__muted {
  color: var(--el-text-color-secondary);
}

.extra-options {
  margin-top: 4px;
  padding-left: 2px;
}

.status-success {
  color: var(--el-color-success);
}

.status-danger {
  color: var(--el-color-danger);
}
@media (max-width: 900px) {
  .panel-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .window-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
}
</style>
