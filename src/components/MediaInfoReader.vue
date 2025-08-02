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

// Based on: ../../ComfyTavern/apps/backend/src/routes/characterRoutes.ts
// Note: This is a simplified browser-based implementation.
const parseCharacterData = async (buffer: Uint8Array | ArrayBuffer): Promise<object | null> => {
  try {
    const uint8Buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    // Very basic PNG chunk parsing
    const dataView = new DataView(uint8Buffer.buffer);
    // Check for PNG signature
    if (dataView.getUint32(0) !== 0x89504E47 || dataView.getUint32(4) !== 0x0D0A1A0A) {
      // Not a PNG or not a valid one
      return null;
    }

    let offset = 8;
    const textChunks: { keyword: string; text: string }[] = [];

    while (offset < uint8Buffer.length) {
      const length = dataView.getUint32(offset);
      offset += 4;
      const type = new TextDecoder().decode(uint8Buffer.subarray(offset, offset + 4));
      offset += 4;

      if (type === 'tEXt') {
        const chunkData = uint8Buffer.subarray(offset, offset + length);
        const nullSeparatorIndex = chunkData.indexOf(0);
        if (nullSeparatorIndex !== -1) {
          const keyword = new TextDecoder().decode(chunkData.subarray(0, nullSeparatorIndex));
          const text = new TextDecoder().decode(chunkData.subarray(nullSeparatorIndex + 1));
          textChunks.push({ keyword, text });
        }
      }

      offset += length; // Move to CRC
      offset += 4; // Skip CRC

      if (type === 'IEND') {
        break;
      }
    }

    if (textChunks.length === 0) {
      return null;
    }

    // Prefer ccv3 (SillyTavern format)
    const ccv3Chunk = textChunks.find(c => c.keyword === 'ccv3');
    if (ccv3Chunk) {
      const jsonStr = new TextDecoder().decode(
        Uint8Array.from(atob(ccv3Chunk.text), c => c.charCodeAt(0))
      );
      return JSON.parse(jsonStr);
    }

    // Fallback to chara (TavernAI format)
    const charaChunk = textChunks.find(c => c.keyword === 'chara');
    if (charaChunk) {
      const jsonStr = new TextDecoder().decode(
        Uint8Array.from(atob(charaChunk.text), c => c.charCodeAt(0))
      );
      return JSON.parse(jsonStr);
    }

    return null;
  } catch (error) {
    console.error('Failed to parse character data from PNG:', error);
    return null;
  }
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
    stCharacterInfo.value = '';
    fullExifInfo.value = JSON.stringify(output, null, 2);

    // --- ST Character Card Parsing ---
    const characterCard = await parseCharacterData(buffer);
    if (characterCard) {
      stCharacterInfo.value = JSON.stringify(characterCard, null, 2);
    }

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
    } else if (stCharacterInfo.value) {
      activeTab.value = 'st';
    } else {
      activeTab.value = 'full';
    }
  } catch (error) {
    console.error('Error parsing image:', error);
    ElMessage.error('解析图片信息失败');
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