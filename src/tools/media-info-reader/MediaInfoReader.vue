<template>
  <div class="media-info-reader-container">
    <!-- Drop Area -->
    <div
      ref="dropAreaRef"
      id="drop-area"
      :class="{ highlight: isDraggingOver }"
      @click="openFilePicker"
    >
      <div v-if="!previewSrc" class="upload-controls">
        <p>将图片拖拽到此处，或点击选择文件</p>
        <el-button id="file-select-btn">选择图片</el-button>
      </div>
      <img v-if="previewSrc" :src="previewSrc" id="preview" />
    </div>

    <!-- Info Area -->
    <div id="image-info">
      <div id="tabs">
        <button :class="{ tab: true, active: activeTab === 'webui' }" @click="activeTab = 'webui'">WebUI Info</button>
        <button :class="{ tab: true, active: activeTab === 'comfyui' }" @click="activeTab = 'comfyui'">ComfyUI Info</button>
        <button :class="{ tab: true, active: activeTab === 'st' }" @click="activeTab = 'st'">ST Character</button>
        <button :class="{ tab: true, active: activeTab === 'full' }" @click="activeTab = 'full'">完整信息</button>
      </div>

      <div v-if="!hasData" class="no-data-placeholder">
        <el-empty description="暂无图片信息" />
      </div>

      <div v-show="hasData && activeTab === 'webui'" id="webui-info">
        <InfoCard title="Positive Prompt" :content="webuiInfo.positivePrompt" />
        <InfoCard title="Negative Prompt" :content="webuiInfo.negativePrompt" />
        <InfoCard title="Generation Info" :content="webuiInfo.generationInfo" is-code />
      </div>

      <div v-show="hasData && activeTab === 'comfyui'" id="comfyui-info">
        <InfoCard title="ComfyUI Workflow" :content="comfyuiWorkflow" is-code />
      </div>

      <div v-show="hasData && activeTab === 'st'" id="st-info">
        <InfoCard title="SillyTavern Character Card" :content="stCharacterInfo" is-code />
      </div>

      <div v-show="hasData && activeTab === 'full'" id="full-info">
        <InfoCard title="Full EXIF Data" :content="fullExifInfo" is-code />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElButton, ElEmpty } from 'element-plus';
import { customMessage } from '@/utils/customMessage';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import InfoCard from '@components/common/InfoCard.vue';
import { createModuleLogger } from '@utils/logger';
import { useMediaInfoParser } from './composables/useMediaInfoParser';
import { useFileInteraction } from '@/composables/useFileInteraction';

const logger = createModuleLogger('MediaInfoReader');

// 使用 composable 获取解析功能
const { parseImageBuffer } = useMediaInfoParser();

const previewSrc = ref('');
const activeTab = ref('webui');
const dropAreaRef = ref<HTMLElement>();

const webuiInfo = ref({ positivePrompt: '', negativePrompt: '', generationInfo: '' });
const comfyuiWorkflow = ref('');
const stCharacterInfo = ref('');
const fullExifInfo = ref('');

const hasData = computed(() => webuiInfo.value.positivePrompt || comfyuiWorkflow.value || stCharacterInfo.value || fullExifInfo.value);

// Helper to convert Uint8Array to Base64
const uint8ArrayToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

const openFilePicker = async () => {
  try {
    const result = await openDialog({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });

    if (result) {
      let path: string;
      if (typeof result === 'string') {
        path = result;
      } else if (Array.isArray(result)) {
        // Should not happen with multiple: false, but handle for type safety
        path = (result as any)[0].path;
      } else {
        // This handles the case where result is a single file object
        path = (result as any).path;
      }

      const fileArray = await readFile(path);
      
      // Generate preview from buffer
      const extension = path.split('.').pop()?.toLowerCase() || 'png';
      const base64 = uint8ArrayToBase64(fileArray);
      previewSrc.value = `data:image/${extension};base64,${base64}`;
      
      // 直接使用 composable 解析图片
      await parseImageFromBuffer(fileArray, path);
    }
  } catch (error) {
    logger.error('打开文件选择器失败', error);
    customMessage.error('打开文件失败');
  }
};

const parseImageFromBuffer = async (buffer: Uint8Array, fileName?: string) => {
  try {
    logger.debug('开始解析图片', { fileName });
    
    // 直接使用 composable 解析图片 buffer
    const result = await parseImageBuffer(buffer);
    
    webuiInfo.value = result.webuiInfo;
    comfyuiWorkflow.value = typeof result.comfyuiWorkflow === 'object'
      ? JSON.stringify(result.comfyuiWorkflow, null, 2)
      : result.comfyuiWorkflow;
    stCharacterInfo.value = result.stCharacterInfo
      ? JSON.stringify(result.stCharacterInfo, null, 2)
      : '';
    fullExifInfo.value = result.fullExifInfo
      ? JSON.stringify(result.fullExifInfo, null, 2)
      : '';
    
    // 自动选择合适的标签页
    if (webuiInfo.value.positivePrompt) {
      activeTab.value = 'webui';
    } else if (comfyuiWorkflow.value) {
      activeTab.value = 'comfyui';
    } else if (stCharacterInfo.value) {
      activeTab.value = 'st';
    } else {
      activeTab.value = 'full';
    }
    
    logger.debug('图片解析成功', { fileName });
  } catch (error) {
    logger.error('解析图片信息失败', error, { fileName });
    customMessage.error('解析图片信息失败');
    webuiInfo.value = { positivePrompt: '', negativePrompt: '', generationInfo: '' };
    comfyuiWorkflow.value = '';
    stCharacterInfo.value = '';
    if (error instanceof Error) {
      fullExifInfo.value = `无法解析 EXIF 数据: ${error.message}`;
    } else {
      fullExifInfo.value = '无法解析 EXIF 数据，发生未知错误。';
    }
  }
};

// 处理拖放的文件路径
const handlePaths = async (paths: string[]) => {
  if (paths.length === 0) return;
  const path = paths[0];
  
  try {
    const fileArray = await readFile(path);
    
    // Generate preview from buffer
    const extension = path.split('.').pop()?.toLowerCase() || 'png';
    const base64 = uint8ArrayToBase64(fileArray);
    previewSrc.value = `data:image/${extension};base64,${base64}`;
    
    // 解析图片
    await parseImageFromBuffer(fileArray, path);
  } catch (error) {
    logger.error('读取拖放的文件失败', error, { path });
    customMessage.error('读取文件失败');
  }
};

// 处理粘贴的文件对象
const handleFiles = async (files: File[]) => {
  if (files.length === 0) return;
  const file = files[0];

  // For preview
  const previewReader = new FileReader();
  previewReader.onload = (e) => {
    previewSrc.value = e.target?.result as string;
  };
  previewReader.readAsDataURL(file);

  // For parsing
  const parseReader = new FileReader();
  parseReader.onload = async (e) => {
    const buffer = e.target?.result as ArrayBuffer;
    if (buffer) {
      await parseImageFromBuffer(new Uint8Array(buffer), file.name);
    }
  };
  parseReader.readAsArrayBuffer(file);
};

// 使用文件拖放交互 composable（仅接受图片文件）
const { isDraggingOver } = useFileInteraction({
  element: dropAreaRef,
  onPaths: handlePaths,  // 处理拖放（路径）
  onFiles: handleFiles,   // 处理粘贴（File 对象）
  multiple: false,
  imageOnly: true,
  accept: ['.png', '.jpg', '.jpeg', '.webp'],
  showPasteMessage: false, // 不显示粘贴消息，因为我们有自己的消息处理
});
</script>

<style scoped>
/* General Layout */
.media-info-reader-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

/* Drop Area */
#drop-area {
  flex: 3;
  border: 3px dashed var(--border-color);
  border-radius: 10px;
  padding: 20px;
  background-color: var(--card-bg);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}
#drop-area.highlight {
  background-color: var(--container-bg);
  border-color: var(--primary-color);
}
.upload-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  font-size: 1.2em;
  font-weight: bold;
  color: var(--text-color-light);
}
#file-select-btn {
  margin-top: 15px;
}
#preview {
  max-width: 100%;
  max-height: calc(100% - 60px);
  border-radius: 5px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}

/* Info Area */
#image-info {
  flex: 4;
  display: flex;
  flex-direction: column;
  gap: 15px;
  overflow: hidden;
}

/* Tabs */
#tabs {
  display: flex;
  border-radius: 5px;
  overflow: hidden;
}
.tab {
  padding: 10px 20px;
  background-color: var(--card-bg);
  color: var(--primary-color);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.3s, color 0.3s;
  flex-grow: 1;
  font-size: 1em;
  font-weight: bold;
  border-radius: 0;
}
.tab.active {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}
.tab:hover:not(.active) {
  background-color: var(--container-bg);
}

/* Info Sections */
#webui-info, #comfyui-info, #full-info, #st-info {
  display: flex;
  flex-direction: column;
  gap: 15px;
  flex: 1; /* 占满剩余空间 */
  min-height: 0; /* 允许内容区域在需要时缩小 */
  overflow: hidden; /* 防止整个区域滚动，让子元素处理滚动 */
}

.no-data-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>