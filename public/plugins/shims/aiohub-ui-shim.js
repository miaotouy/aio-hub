/**
 * AIO Hub UI ESM Shim for Plugins
 * 
 * 这个文件将主应用提供的 UI 组件导出为 ESM 模块。
 */

if (!window.AiohubUI) {
  console.error('[AIO Hub] window.AiohubUI is not defined.');
}

const UI = window.AiohubUI || { components: {} };

// 导出所有组件
export const {
  Avatar,
  BaseDialog,
  InfoCard,
  FileIcon,
  RichTextRenderer,
  AudioPlayer,
  VideoPlayer,
  RichCodeEditor,
  DraggablePanel,
  DropZone,
  DynamicIcon,
} = UI;

export default UI;