<script setup lang="ts">
import { ref, onMounted } from "vue";
import { InfoFilled, FolderOpened } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { updateAppSettings, loadAppSettings } from "@/utils/appSettings";
import { resetAssetBasePathCache } from "@/composables/useAssetManager";

const errorHandler = createModuleErrorHandler("Settings/AssetSettings");

// 资产路径配置
const customAssetPath = ref<string>("");
const defaultAssetPath = ref<string>("");
const currentAssetPath = ref<string>("");
const isLoading = ref(false);

// 加载当前配置
const loadConfig = async () => {
  try {
    isLoading.value = true;
    const settings = loadAppSettings();
    customAssetPath.value = settings.customAssetPath || "";

    // 获取默认路径
    defaultAssetPath.value = await invoke<string>("get_asset_base_path");

    // 获取当前实际使用的路径
    currentAssetPath.value = customAssetPath.value || defaultAssetPath.value;
  } catch (error) {
    errorHandler.error(error, "加载配置失败");
  } finally {
    isLoading.value = false;
  }
};

// 选择自定义路径
const selectCustomPath = async () => {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "选择资产存储目录",
    });

    if (selected) {
      customAssetPath.value = selected as string;
      saveConfig();
    }
  } catch (error) {
    errorHandler.error(error, "选择目录失败");
  }
};
// 保存配置
const saveConfig = () => {
  try {
    const oldSettings = loadAppSettings();
    if (oldSettings.customAssetPath === customAssetPath.value) {
      customMessage.info("资产路径未发生变化");
      return;
    }

    updateAppSettings({ customAssetPath: customAssetPath.value });
    currentAssetPath.value = customAssetPath.value || defaultAssetPath.value;

    // 清除 useAssetManager 中的路径缓存，以便下次能获取到最新路径
    resetAssetBasePathCache();

    customMessage.success("资产路径配置已保存，将在下次资源加载时生效");
  } catch (error) {
    errorHandler.error(error, "保存配置失败");
  }
};

// 重置为默认路径
const resetToDefault = () => {
  customAssetPath.value = "";
  saveConfig();
};

// 打开资产目录
const openAssetDirectory = async () => {
  try {
    await invoke("open_file_directory", {
      filePath: currentAssetPath.value,
    });
  } catch (error) {
    errorHandler.error(error, "打开目录失败");
  }
};

onMounted(() => {
  loadConfig();
});
</script>

<template>
  <div class="asset-settings" v-loading="isLoading">
    <div class="setting-group">
      <div class="group-title">资产存储位置</div>
      <div class="group-description">
        配置应用资产（图片、文档等文件）的存储位置。修改后，新导入的资产将保存到新位置，已有资产不会自动迁移。
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>默认路径</span>
          <el-tooltip content="应用数据目录下的 assets 文件夹" placement="top">
            <el-icon class="info-icon">
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </div>
        <div class="path-display">
          <el-input :model-value="defaultAssetPath" readonly />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>自定义路径</span>
          <el-tooltip content="指定一个自定义的资产存储位置，留空则使用默认路径" placement="top">
            <el-icon class="info-icon">
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </div>
        <div class="path-input-group">
          <el-input v-model="customAssetPath" placeholder="留空使用默认路径" readonly>
            <template #append>
              <el-button :icon="FolderOpened" @click="selectCustomPath"> 选择目录 </el-button>
            </template>
          </el-input>
          <el-button
            v-if="customAssetPath"
            @click="resetToDefault"
            type="warning"
            plain
            style="margin-top: 8px"
          >
            重置为默认
          </el-button>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>当前使用路径</span>
          <el-tooltip content="当前实际使用的资产存储路径" placement="top">
            <el-icon class="info-icon">
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </div>
        <div class="current-path-display">
          <el-input :model-value="currentAssetPath" readonly />
          <el-button @click="openAssetDirectory" type="primary" plain> 打开目录 </el-button>
        </div>
      </div>
    </div>

    <el-divider />

    <div class="setting-group">
      <div class="group-title">说明</div>
      <el-alert title="关于资产管理" type="info" :closable="false" show-icon>
        <ul class="info-list">
          <li>资产包括 LLM 聊天中的附件、OCR 处理的图片等文件</li>
          <li>默认存储在应用数据目录，可能占用系统盘空间</li>
          <li>可以设置自定义路径到其他磁盘，避免占用系统盘</li>
          <li>修改路径后仅对新导入的资产生效，已有资产需要手动迁移</li>
          <li>资产按类型和日期自动分类存储（如 images/2025-10/）</li>
        </ul>
      </el-alert>
    </div>
  </div>
</template>

<style scoped>
.asset-settings {
  padding: 24px 24px;
}

.setting-group {
  margin-bottom: 24px;
  padding: 8px;
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 8px;
}

.group-description {
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.6;
  margin-bottom: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
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
  font-weight: 500;
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
}

.path-display,
.current-path-display {
  display: flex;
  gap: 8px;
  align-items: center;
}

.path-input-group {
  display: flex;
  flex-direction: column;
}

.info-list {
  margin: 0;
  padding-left: 20px;
}

.info-list li {
  margin-bottom: 4px;
  line-height: 1.6;
}
</style>
