/**
 * AIO Hub SDK ESM Shim for Plugins
 */

if (!window.AiohubSDK) {
  console.error('[AIO Hub] window.AiohubSDK is not defined.');
}

const SDK = window.AiohubSDK;

// 导出 SDK 中的所有内容
export const {
  execute,
  executeMany,
  pluginConfigService,
  pluginStateService,
  startupManager,
  customMessage,
  createModuleErrorHandler,
  ErrorLevel,
  createModuleLogger,
  logger,
  useTheme,
  useAssetManager,
  useNotification,
  useImageViewer,
  useModelMetadata,
  useLlmProfiles,
  useLlmRequest,
  useAppSettingsStore,
  ui,
  // 如果未来有更多导出，可以在这里添加
} = SDK;

export default SDK;