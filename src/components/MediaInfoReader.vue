<template>
  <div class="media-info-reader-container">
    <div
      id="drop-area"
      :class="{ highlight: isDragging }"
      @dragenter.prevent.stop="isDragging = true"
      @dragover.prevent.stop="isDragging = true"
      @dragleave.prevent.stop="isDragging = false"
      @drop.prevent.stop="handleDrop"
      @click="openFilePicker"
    >
      <div v-if="!previewSrc" class="drop-area-content">
        <el-icon :size="50"><UploadFilled /></el-icon>
        <p>将图片拖拽到此处，或点击选择文件</p>
      </div>
      <img v-if="previewSrc" :src="previewSrc" class="preview-image" />
    </div>

    <div v-if="hasData" class="info-container">
      <el-tabs v-model="activeTab" class="info-tabs">
        <el-tab-pane label="WebUI Info" name="webui">
          <div class="info-section">
            <InfoCard title="正面提示词 (Positive Prompt)" :content="webuiInfo.positivePrompt" />
            <InfoCard title="负面提示词 (Negative Prompt)" :content="webuiInfo.negativePrompt" />
            <InfoCard title="生成参数 (Generation Info)" :content="webuiInfo.generationInfo" is-code />
          </div>
        </el-tab-pane>
        <el-tab-pane label="ComfyUI Info" name="comfyui">
          <InfoCard title="ComfyUI Workflow" :content="comfyuiWorkflow" is-code />
        </el-tab-pane>
        <el-tab-pane label="完整 EXIF 信息" name="full">
          <InfoCard title="Full EXIF Data" :content="fullExifInfo" is-code />
        </el-tab-pane>
      </el-tabs>
    </div>
    <div v-else class="no-data-placeholder">
      <el-empty description="暂无图片信息" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage, ElIcon, ElTabs, ElTabPane, ElEmpty } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
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
    const path = await openDialog({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (path) {
      const fileArray = await readFile(path as string);
      // Generate preview from buffer
      const base64 = uint8ArrayToBase64(fileArray);
      // Guess mime type from extension, default to png
      const extension = (path as string).split('.').pop()?.toLowerCase() || 'png';
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

const parseImageInfo = async (buffer: Uint8Array) => {
  try {
    const output = await exifr.parse(buffer, true);
    console.log('EXIF Output:', output);

    // Reset info
    webuiInfo.value = { positivePrompt: '', negativePrompt: '', generationInfo: '' };
    comfyuiWorkflow.value = '';
    fullExifInfo.value = JSON.stringify(output, null, 2);

    // Parse WebUI info from 'parameters' or 'userComment'
    let parameters = output.parameters || output.userComment;
    if (parameters) {
      if (parameters instanceof Uint8Array) {
        parameters = new TextDecoder().decode(parameters);
      }
      const parsedWebUI = parseWebUIInfo(parameters);
      webuiInfo.value = parsedWebUI;
    }

    // Parse ComfyUI info from 'workflow'
    if (output.workflow) {
      try {
        const workflow = JSON.parse(output.workflow);
        comfyuiWorkflow.value = JSON.stringify(workflow, null, 2);
      } catch (e) {
        comfyuiWorkflow.value = output.workflow; // Show as raw text if not valid JSON
      }
    }
    
    if(webuiInfo.value.positivePrompt) {
        activeTab.value = 'webui';
    } else if (comfyuiWorkflow.value) {
        activeTab.value = 'comfyui';
    } else {
        activeTab.value = 'full';
    }

  } catch (error) {
    console.error('Error parsing image:', error);
    ElMessage.error('解析图片信息失败');
    fullExifInfo.value = '无法解析 EXIF 数据。';
  }
};

const parseWebUIInfo = (parameters: string) => {
  const parts = parameters.split('Negative prompt:');
  const positivePrompt = parts[0].trim();
  const rest = parts[1] || '';

  // Enhanced parser from script.js
  const fields = ["Steps", "Sampler", "CFG scale", "Seed", "Size", "Model", "VAE hash", "VAE", "TI hashes", "Version", "Hashes"];
  const regex = new RegExp(`(${fields.join('|')}):\\s*(.*?)\\s*(?=(${fields.join('|')}:|$))`, 'g');

  const genInfoObject: { [key: string]: string } = {};
  let match;
  while ((match = regex.exec(rest)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/,$/, ''); // Remove trailing comma
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
.media-info-reader-container {
  padding: 20px;
  display: flex;
  gap: 20px;
}

#drop-area {
  flex: 1;
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.3s, background-color 0.3s;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

#drop-area.highlight {
  border-color: #409eff;
  background-color: #ecf5ff;
}

.drop-area-content {
  color: #888;
}

.preview-image {
  max-width: 100%;
  max-height: 400px;
  border-radius: 4px;
}

.info-container {
  flex: 1;
  min-height: 300px;
}

.no-data-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.info-tabs {
  width: 100%;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
</style>