import { reactive, toRefs } from 'vue';
import { useAssetManager, assetManagerEngine } from '@/composables/useAssetManager';
import type { Asset } from '@/types/asset-management';

interface AudioViewerState {
  visible: boolean;
  src: string;
  title: string;
  poster: string;
  artist: string;
}

// 全局单例状态
const state = reactive<AudioViewerState>({
  visible: false,
  src: '',
  title: '',
  poster: '',
  artist: ''
});

/**
 * 音频预览服务
 */
export function useAudioViewer() {
  const { getAssetUrl } = useAssetManager();

  /**
   * 预览音频
   * @param source 音频源 (URL 字符串 或 Asset 对象)
   * @param options 额外选项
   */
  const previewAudio = async (
    source: string | Asset,
    options: { title?: string; poster?: string; artist?: string } = {}
  ) => {
    let url = '';
    let title = options.title || '';

    try {
      if (typeof source === 'string') {
        if (source.startsWith('http') || source.startsWith('blob:') || source.startsWith('asset:')) {
          // 普通 URL 或已转换的 asset 协议
          url = source;
        } else if (source.startsWith('appdata://')) {
          // appdata 协议路径: appdata://path/to/file
          const relativePath = source.substring(10);
          // 使用 assetManagerEngine 获取 asset 协议 URL
          const basePath = await assetManagerEngine.getAssetBasePath();
          url = assetManagerEngine.convertToAssetProtocol(relativePath, basePath);

          if (!title) {
            title = relativePath.split('/').pop() || '音频';
          }
        } else {
          // 假设是相对路径，尝试转换为 asset 协议
          const basePath = await assetManagerEngine.getAssetBasePath();
          url = assetManagerEngine.convertToAssetProtocol(source, basePath);
          if (!title) title = source.split('/').pop() || '音频';
        }
      } else {
        // Asset 对象
        // getAssetUrl 已经被优化过，会返回 asset:// 协议
        url = await getAssetUrl(source);
        if (!title) title = source.name;
        
        // 从 Asset 的 thumbnailPath 获取封面图
        if (!options.poster && source.thumbnailPath) {
          const basePath = await assetManagerEngine.getAssetBasePath();
          options.poster = assetManagerEngine.convertToAssetProtocol(source.thumbnailPath, basePath);
        }
      }

      // 更新状态
      state.src = url;
      state.title = title || '音频预览';
      state.poster = options.poster || '';
      state.artist = options.artist || '';
      state.visible = true;

    } catch (error) {
      console.error('无法预览音频:', error);}
  };

  const close = () => {
    state.visible = false;
    // 稍微延迟清空 src，避免关闭动画时音频突然停止
    setTimeout(() => {
      if (!state.visible) {
        state.src = '';
      }
    }, 300);
  };

  return {
    ...toRefs(state),
    previewAudio,
    close
  };
}