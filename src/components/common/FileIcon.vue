<template>
  <Icon :icon="iconName" :width="size" :height="size" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { AssetType } from '@/types/asset-management';

interface Props {
  /** 文件名（用于根据扩展名判断图标） */
  fileName?: string;
  /** 文件类型 */
  fileType?: AssetType;
  /** 图标大小（默认 24） */
  size?: number | string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
});

/**
 * 根据文件扩展名获取对应的 VSCode 图标名称
 */
const getIconByExtension = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  // 常见文件类型映射表
  const extensionMap: Record<string, string> = {
    // 图片
    'jpg': 'vscode-icons:file-type-image',
    'jpeg': 'vscode-icons:file-type-image',
    'png': 'vscode-icons:file-type-image',
    'gif': 'vscode-icons:file-type-image',
    'svg': 'vscode-icons:file-type-svg',
    'webp': 'vscode-icons:file-type-image',
    'bmp': 'vscode-icons:file-type-image',
    'ico': 'vscode-icons:file-type-image',
    'avif': 'vscode-icons:file-type-image',
    'tiff': 'vscode-icons:file-type-image',
    'tif': 'vscode-icons:file-type-image',
    
    // 视频
    'mp4': 'vscode-icons:file-type-video',
    'avi': 'vscode-icons:file-type-video',
    'mkv': 'vscode-icons:file-type-video',
    'mov': 'vscode-icons:file-type-video',
    'wmv': 'vscode-icons:file-type-video',
    'flv': 'vscode-icons:file-type-video',
    'webm': 'vscode-icons:file-type-video',
    'mpg': 'vscode-icons:file-type-video',
    'mpeg': 'vscode-icons:file-type-video',
    'ogv': 'vscode-icons:file-type-video',
    
    // 音频
    'mp3': 'lucide:file-music',
    'wav': 'lucide:audio-waveform',
    'flac': 'lucide:file-music',
    'aac': 'lucide:file-volume',
    'ogg': 'lucide:file-volume',
    'm4a': 'lucide:file-volume',
    'wma': 'lucide:file-volume',
    'oga': 'lucide:file-volume',
    'opus': 'lucide:file-music',
    
    // 文档 - 通用
    'pdf': 'vscode-icons:file-type-pdf2',
    'doc': 'vscode-icons:file-type-word',
    'docx': 'vscode-icons:file-type-word',
    'xls': 'vscode-icons:file-type-excel',
    'xlsx': 'vscode-icons:file-type-excel',
    'ppt': 'vscode-icons:file-type-powerpoint',
    'pptx': 'vscode-icons:file-type-powerpoint',
    'txt': 'vscode-icons:file-type-text',
    'rtf': 'vscode-icons:file-type-text',
    
    // 代码文件
    'js': 'vscode-icons:file-type-js-official',
    'ts': 'vscode-icons:file-type-typescript-official',
    'jsx': 'vscode-icons:file-type-reactjs',
    'tsx': 'vscode-icons:file-type-reactts',
    'vue': 'vscode-icons:file-type-vue',
    'py': 'vscode-icons:file-type-python',
    'java': 'vscode-icons:file-type-java',
    'cpp': 'vscode-icons:file-type-cpp3',
    'c': 'vscode-icons:file-type-c3',
    'cs': 'vscode-icons:file-type-csharp2',
    'go': 'vscode-icons:file-type-go',
    'rs': 'vscode-icons:file-type-rust',
    'php': 'vscode-icons:file-type-php3',
    'rb': 'vscode-icons:file-type-ruby',
    'swift': 'vscode-icons:file-type-swift',
    'kt': 'vscode-icons:file-type-kotlin',
    
    // Web 相关
    'html': 'vscode-icons:file-type-html',
    'css': 'vscode-icons:file-type-css',
    'scss': 'vscode-icons:file-type-scss2',
    'sass': 'vscode-icons:file-type-sass',
    'less': 'vscode-icons:file-type-less',
    
    // 配置文件
    'json': 'vscode-icons:file-type-json',
    'xml': 'vscode-icons:file-type-xml',
    'yaml': 'vscode-icons:file-type-yaml',
    'yml': 'vscode-icons:file-type-yaml',
    'toml': 'vscode-icons:file-type-toml',
    'ini': 'vscode-icons:file-type-ini',
    'env': 'vscode-icons:file-type-dotenv',
    
    // Markdown
    'md': 'vscode-icons:file-type-markdown',
    'mdx': 'vscode-icons:file-type-mdx',
    
    // 压缩文件
    'zip': 'vscode-icons:file-type-zip',
    'rar': 'vscode-icons:file-type-zip',
    '7z': 'vscode-icons:file-type-zip',
    'tar': 'vscode-icons:file-type-zip',
    'gz': 'vscode-icons:file-type-zip',
    
    // 其他
    'exe': 'vscode-icons:file-type-binary',
    'apk': 'mdi:android',
    'dmg': 'vscode-icons:default-file',
    'iso': 'vscode-icons:default-file',
  };

  return extensionMap[ext] || '';
};

/**
 * 根据文件类型获取 fallback 图标
 */
const getFallbackIcon = (type?: AssetType): string => {
  switch (type) {
    case 'image':
      return 'vscode-icons:file-type-image';
    case 'video':
      return 'vscode-icons:file-type-video';
    case 'audio':
      return 'lucide:file-volume';
    case 'document':
      return 'vscode-icons:file-type-text';
    default:
      return 'vscode-icons:default-file';
  }
};

/**
 * 计算最终使用的图标名称
 */
const iconName = computed(() => {
  // 优先根据文件名匹配
  if (props.fileName) {
    const extIcon = getIconByExtension(props.fileName);
    if (extIcon) return extIcon;
  }
  
  // 使用文件类型的 fallback 图标
  return getFallbackIcon(props.fileType);
});
</script>

<style scoped>
/* 确保图标正常显示 */
:deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>