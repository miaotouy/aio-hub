<template>
  <div ref="dropZoneRef" class="file-input-zone" :class="{ 'is-dragover': isDraggingOver }" @click="selectFiles">
    <div class="zone-content">
      <div class="icon-wrapper">
        <UploadCloud :size="48" class="upload-icon" />
      </div>
      <h3 class="zone-title">拖放配置文件或目录到这里</h3>
      <p class="zone-desc">支持 JSON, YAML, TOML, INI, XML, .env 格式</p>
      <div class="zone-actions" @click.stop>
        <el-button type="primary" :icon="FileCode" @click="selectFiles"> 选择文件 </el-button>
        <el-button :icon="FolderOpen" @click="selectDirectory"> 选择目录 </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { UploadCloud, FileCode, FolderOpen } from "lucide-vue-next";
import { useFileDrop } from "@/composables/useFileDrop";

const emit = defineEmits<{
  (e: "addPaths", paths: string[]): void;
}>();

const dropZoneRef = ref<HTMLElement>();

// 拖放集成
const { isDraggingOver } = useFileDrop({
  element: dropZoneRef,
  multiple: true,
  directoryOnly: false,
  onDrop: (paths) => {
    if (paths.length > 0) {
      emit("addPaths", paths);
    }
  },
});

/**
 * 选择文件
 */
const selectFiles = async () => {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "选择配置文件",
      filters: [
        {
          name: "配置文件",
          extensions: ["json", "yaml", "yml", "toml", "ini", "cfg", "xml", "env"],
        },
        {
          name: "所有文件",
          extensions: ["*"],
        },
      ],
    });

    if (selected && Array.isArray(selected)) {
      emit("addPaths", selected);
    } else if (selected) {
      emit("addPaths", [selected as string]);
    }
  } catch (error) {
    console.error("选择文件失败:", error);
  }
};

/**
 * 选择目录
 */
const selectDirectory = async () => {
  try {
    const selected = await open({
      multiple: false,
      directory: true,
      title: "选择配置目录",
    });

    if (selected) {
      emit("addPaths", [selected as string]);
    }
  } catch (error) {
    console.error("选择目录失败:", error);
  }
};
</script>

<style scoped>
.file-input-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.02));
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  width: 100%;
  height: 100%;
  flex: 1;
  box-sizing: border-box;
}

.file-input-zone:hover,
.file-input-zone.is-dragover {
  border-color: var(--primary-color);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
}

.icon-wrapper {
  margin-bottom: 16px;
  color: var(--text-color-light);
  transition: color 0.2s;
}

.file-input-zone:hover .icon-wrapper,
.file-input-zone.is-dragover .icon-wrapper {
  color: var(--primary-color);
}

.zone-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px 0;
}

.zone-desc {
  font-size: 13px;
  color: var(--text-color-light);
  margin: 0 0 24px 0;
}

.zone-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
