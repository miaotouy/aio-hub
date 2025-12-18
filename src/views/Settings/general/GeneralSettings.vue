<script setup lang="ts">
import { computed } from "vue";
import { InfoFilled } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";
import type { ProxySettings, ProxyMode } from "@/utils/appSettings";

const logger = createModuleLogger("GeneralSettings");
const errorHandler = createModuleErrorHandler("GeneralSettings");

const props = defineProps<{
  showTrayIcon: boolean;
  minimizeToTray: boolean;
  theme: string;
  autoAdjustWindowPosition: boolean;
  sidebarMode: string;
  proxy: ProxySettings;
}>();

const emit = defineEmits([
  "update:showTrayIcon",
  "update:minimizeToTray",
  "update:theme",
  "update:autoAdjustWindowPosition",
  "update:sidebarMode",
  "update:proxy",
  "configImported",
]);

const showTrayIcon = computed({
  get: () => props.showTrayIcon,
  set: (value) => emit("update:showTrayIcon", value),
});

const minimizeToTray = computed({
  get: () => props.minimizeToTray,
  set: (value) => emit("update:minimizeToTray", value),
});

const theme = computed({
  get: () => props.theme,
  set: (value) => emit("update:theme", value),
});

const autoAdjustWindowPosition = computed({
  get: () => props.autoAdjustWindowPosition,
  set: (value) => emit("update:autoAdjustWindowPosition", value),
});

const sidebarMode = computed({
  get: () => props.sidebarMode,
  set: (value) => emit("update:sidebarMode", value),
});

const proxyMode = computed({
  get: () => props.proxy.mode,
  set: (value: ProxyMode) => emit("update:proxy", { ...props.proxy, mode: value }),
});

const proxyUrl = computed({
  get: () => props.proxy.customUrl,
  set: (value: string) => emit("update:proxy", { ...props.proxy, customUrl: value }),
});

// 清除窗口状态
const handleClearWindowState = async () => {
  try {
    await ElMessageBox.confirm(
      "确定要清除所有窗口的位置和大小记忆吗？下次打开窗口时将恢复默认位置。",
      "清除窗口状态",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    await invoke("clear_window_state");
    customMessage.success("窗口状态已清除");
  } catch (error) {
    if (error !== "cancel") {
      errorHandler.error(error as Error, "清除窗口状态失败");
    }
  }
};

// 打开配置文件目录
const handleOpenConfigDir = async () => {
  try {
    const appDir = await appDataDir();

    // 使用后端命令打开目录
    try {
      await invoke("open_file_directory", { filePath: appDir });
    } catch (openError) {
      // 备用方案：复制路径到剪贴板
      logger.warn("无法直接打开目录，尝试复制路径", openError);

      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(appDir);

      ElMessageBox.alert(`无法自动打开目录，路径已复制到剪贴板：\n${appDir}`, "提示", {
        confirmButtonText: "确定",
        type: "info",
      });
    }
  } catch (error) {
    errorHandler.error(error as Error, "获取配置目录路径失败");
  }
};

// 导出配置
const handleExportConfig = async () => {
  try {
    const filePath = await save({
      title: "导出配置",
      defaultPath: `AIO-Tools-Backup-${new Date().toISOString().split("T")[0]}.zip`,
      filters: [
        {
          name: "ZIP 压缩包",
          extensions: ["zip"],
        },
      ],
    });

    if (filePath) {
      // 调用后端命令导出所有模块的配置到 ZIP（返回二进制数据）
      const zipData = await invoke<number[]>("export_all_configs_to_zip");

      // 将二进制数据转换为 Uint8Array
      const zipBuffer = new Uint8Array(zipData);

      // 直接写入到用户选择的位置
      await writeFile(filePath, zipBuffer);

      customMessage.success("配置导出成功");
      logger.info("配置已导出", { filePath });

      // 导出成功后打开文件所在目录（使用后端命令绕过路径限制）
      try {
        await invoke("open_file_directory", { filePath });
      } catch (openError) {
        // 打开目录失败时静默处理，不影响主流程
        logger.warn("无法打开导出目录", openError);
      }
    }
  } catch (error) {
    errorHandler.error(error as Error, "导出配置失败");
  }
};

// 导入配置
const handleImportConfig = async () => {
  try {
    const filePath = await openDialog({
      title: "导入配置",
      multiple: false,
      filters: [
        {
          name: "ZIP 压缩包",
          extensions: ["zip"],
        },
      ],
    });

    if (!filePath) {
      return;
    }

    // 让用户选择导入模式
    let mergeMode = false;
    try {
      await ElMessageBox({
        title: "选择导入模式",
        message:
          "请选择如何导入配置：\n\n• 合并导入：保留现有配置，仅更新导入文件中存在的项\n• 覆盖导入：完全替换为导入文件中的配置",
        showCancelButton: true,
        confirmButtonText: "合并导入",
        cancelButtonText: "覆盖导入",
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
        type: "info",
      });
      // 用户选择了"合并导入"
      mergeMode = true;
    } catch (action) {
      if (action === "cancel") {
        // 用户选择了"覆盖导入"
        mergeMode = false;
      } else {
        // 用户关闭了对话框，取消操作
        return;
      }
    }

    // 调用后端命令从 ZIP 导入所有模块的配置
    const result = await invoke<string>("import_all_configs_from_zip", {
      zipFilePath: filePath as string,
      merge: mergeMode,
    });

    // 发出事件通知父组件配置已导入，需要重新加载
    emit("configImported", result);
    logger.info("配置已导入，请求父组件刷新", { result, mergeMode });
  } catch (error) {
    if (error !== "cancel") {
      errorHandler.error(error as Error, "导入配置失败");
    }
  }
};
</script>

<template>
  <div class="general-settings">
    <div class="setting-item">
      <div class="setting-label">
        <span>显示托盘图标</span>
        <el-tooltip content="是否在系统托盘显示应用图标，可实时生效" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-switch v-model="showTrayIcon" />
    </div>

    <div class="setting-item">
      <div class="setting-label">
        <span>关闭到托盘</span>
        <el-tooltip
          content="启用后，点击关闭按钮时会最小化到系统托盘而不是退出程序"
          placement="top"
        >
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
        <span v-if="!showTrayIcon" class="setting-hint warning"> 需要先启用【显示托盘图标】 </span>
      </div>
      <el-switch v-model="minimizeToTray" :disabled="!showTrayIcon" />
    </div>

    <div class="setting-item">
      <div class="setting-label">
        <span>主题设置</span>
        <el-tooltip content="选择应用的主题模式" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-radio-group v-model="theme">
        <el-radio-button value="auto">跟随系统</el-radio-button>
        <el-radio-button value="light">浅色</el-radio-button>
        <el-radio-button value="dark">深色</el-radio-button>
      </el-radio-group>
    </div>

    <div class="setting-item">
      <div class="setting-label">
        <span>侧边栏模式</span>
        <el-tooltip content="选择侧边栏的显示方式" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-radio-group v-model="sidebarMode">
        <el-radio-button value="sidebar">默认</el-radio-button>
        <el-radio-button value="drawer">抽屉</el-radio-button>
        <el-radio-button value="dropdown">下拉菜单</el-radio-button>
      </el-radio-group>
    </div>

    <div class="setting-item">
      <div class="setting-label">
        <span>窗口位置记忆</span>
        <el-tooltip content="清除所有窗口的位置和大小记忆，恢复默认状态" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-button @click="handleClearWindowState" size="small"> 清除窗口状态 </el-button>
    </div>

    <div class="setting-item">
      <div class="setting-label">
        <span>自动调整窗口位置</span>
        <el-tooltip content="当工具窗口移动到屏幕外时，自动将其拉回可见区域" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-switch v-model="autoAdjustWindowPosition" />
    </div>

    <div class="setting-item">
      <div class="setting-label">
        <span>网络代理</span>
        <el-tooltip content="设置应用的网络代理模式" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <div class="setting-content-col">
        <el-radio-group v-model="proxyMode">
          <el-radio-button value="system">跟随系统</el-radio-button>
          <el-radio-button value="none">不使用代理</el-radio-button>
          <el-radio-button value="custom">自定义</el-radio-button>
        </el-radio-group>
        <div v-if="proxyMode === 'custom'" class="proxy-input-wrapper">
          <el-input
            v-model="proxyUrl"
            placeholder="例如 http://127.0.0.1:7890"
            clearable
            style="width: 100%"
          />
        </div>
      </div>
    </div>

    <el-divider />

    <div class="setting-item">
      <div class="setting-label">
        <span>配置管理</span>
        <el-tooltip content="打开配置文件目录、导出或导入配置文件" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <div class="config-actions">
        <el-button @click="handleOpenConfigDir" size="small"> 打开配置目录 </el-button>
        <el-button @click="handleExportConfig" size="small"> 导出配置 </el-button>
        <el-button @click="handleImportConfig" size="small"> 导入配置 </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.general-settings {
  padding: 24px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
  margin-bottom: 12px;
}

.setting-item:not(:last-child) {
  border-bottom: 1px solid var(--border-color);
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-color);
}

.setting-hint {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  margin-left: 4px;
  white-space: nowrap;
}

.setting-hint.warning {
  color: var(--warning-color, #e6a23c);
  background-color: rgba(230, 162, 60, 0.1);
  border: 1px solid rgba(230, 162, 60, 0.3);
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
}

.config-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.setting-content-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.proxy-input-wrapper {
  width: 240px;
}
</style>
