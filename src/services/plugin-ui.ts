/**
 * AIO Hub Plugin UI Components
 * 
 * 这个文件汇总了所有暴露给插件使用的 UI 组件。
 */

import RichTextRenderer from '@/tools/rich-text-renderer/RichTextRenderer.vue';
import Avatar from '@/components/common/Avatar.vue';
import BaseDialog from '@/components/common/BaseDialog.vue';
import InfoCard from '@/components/common/InfoCard.vue';
import FileIcon from '@/components/common/FileIcon.vue';

// 导出组件 Map，供主应用挂载或 SDK 查询
export const components: Record<string, any> = {
  RichTextRenderer,
  Avatar,
  BaseDialog,
  InfoCard,
  FileIcon,
};

// 导出单个组件，供 ESM Shim 使用
export {
  RichTextRenderer,
  Avatar,
  BaseDialog,
  InfoCard,
  FileIcon,
};