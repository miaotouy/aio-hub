<template>
  <div class="media-info-reader-container">
    <!-- Drop Area -->
    <div
      id="drop-area"
      :class="{ highlight: isDragging }"
      @dragenter.prevent.stop="isDragging = true"
      @dragover.prevent.stop="isDragging = true"
      @dragleave.prevent.stop="isDragging = false"
      @drop.prevent.stop="handleDrop"
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

      <div v-show="hasData && activeTab === 'full'" id="full-info">
        <InfoCard title="Full EXIF Data" :content="fullExifInfo" is-code />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage, ElButton, ElEmpty } from 'element-plus';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import * as exifr from 'exifr';
import InfoCard from './InfoCard.vue';

const previewSrc = ref('');
const isDragging = ref(false);
const activeTab = ref('webui');

const webuiInfo = ref({ positivePrompt: '', negativePrompt: '', generationInfo: '' });
const comfyuiWorkflow = ref('');
const fullExifInfo = ref('');

const hasData = computed(() => webuiInfo.value.positivePrompt || comfyuiWorkflow.value || fullExifInfo.value);

// Helper to convert Uint8Array to Base64
const uint8ArrayToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

const handleDrop = (e: DragEvent) => {
  isDragging.value = false;
  if (e.dataTransfer?.files) {
    handleFiles(e.dataTransfer.files);
  }
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
      
      // Pass the buffer directly to the parser
      parseImageInfo(fileArray);
    }
  } catch (error) {
    console.error('Error opening file picker:', error);
    ElMessage.error('打开文件失败');
  }
};

const handleFiles = (files: FileList) => {
  if (files.length === 0) return;
  const file = files[0];
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请上传图片文件');
    return;
  }

  // For preview
  const previewReader = new FileReader();
  previewReader.onload = (e) => {
    previewSrc.value = e.target?.result as string;
  };
  previewReader.readAsDataURL(file);

  // For parsing
  const parseReader = new FileReader();
  parseReader.onload = (e) => {
    const buffer = e.target?.result as ArrayBuffer;
    if (buffer) {
      parseImageInfo(new Uint8Array(buffer));
    }
  };
  parseReader.readAsArrayBuffer(file);
};

const parseImageInfo = async (buffer: Uint8Array | ArrayBuffer) => {
  try {
    const output = await exifr.parse(buffer, true);
    console.log('EXIF Output:', output);

    // Reset info
    webuiInfo.value = { positivePrompt: '', negativePrompt: '', generationInfo: '' };
    comfyuiWorkflow.value = '';
    fullExifInfo.value = JSON.stringify(output, null, 2);

    let parameters = output.parameters || output.userComment;
    if (parameters) {
      if (parameters instanceof Uint8Array) {
        parameters = new TextDecoder().decode(parameters);
      }
      webuiInfo.value = parseWebUIInfo(parameters);
    }

    if (output.workflow) {
      try {
        const workflow = JSON.parse(output.workflow);
        comfyuiWorkflow.value = JSON.stringify(workflow, null, 2);
      } catch (e) {
        comfyuiWorkflow.value = output.workflow;
      }
    }
    
    if (webuiInfo.value.positivePrompt) {
      activeTab.value = 'webui';
    } else if (comfyuiWorkflow.value) {
      activeTab.value = 'comfyui';
    } else {
      activeTab.value = 'full';
    }
  } catch (error) {
    console.error('Error parsing image:', error);
    ElMessage.error('解析图片信息失败');
    webuiInfo.value = { positivePrompt: '', negativePrompt: '', generationInfo: '' };
    comfyuiWorkflow.value = '';
    if (error instanceof Error) {
      fullExifInfo.value = `无法解析 EXIF 数据: ${error.message}`;
    } else {
      fullExifInfo.value = '无法解析 EXIF 数据，发生未知错误。';
    }
  }
};

const parseWebUIInfo = (parameters: string) => {
  const parts = parameters.split('Negative prompt:');
  const positivePrompt = parts[0].trim();
  const rest = parts[1] || '';
  
  const fields = ["Steps", "Sampler", "CFG scale", "Seed", "Size", "Model", "VAE hash", "VAE", "TI hashes", "Version", "Hashes"];
  const regex = new RegExp(`(${fields.join('|')}):\\s*(.*?)\\s*(?=(${fields.join('|')}:|$))`, 'g');

  const genInfoObject: { [key: string]: string } = {};
  let match;
  while ((match = regex.exec(rest)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/,$/, '');
    genInfoObject[key] = value;
  }

  const generationInfo = Object.entries(genInfoObject)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  
  const negativePromptRegex = new RegExp(`^([\\s\\S]*?)(?=(${fields.join('|')}):)`);
  const negativeMatch = rest.match(negativePromptRegex);
  const negativePrompt = negativeMatch ? negativeMatch[1].trim() : rest.trim();

  return { positivePrompt, negativePrompt, generationInfo };
};
</script>

<style scoped>
/* General Layout */
.media-info-reader-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: calc(100vh - 100px); /* Adjust based on your app's header/footer height */
  padding: 20px;
  box-sizing: border-box;
}

/* Drop Area */
#drop-area {
  flex: 3; /* 60% width */
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
  flex: 2; /* 40% width */
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
#webui-info, #comfyui-info, #full-info {
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