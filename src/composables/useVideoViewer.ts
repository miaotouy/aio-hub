import { reactive, toRefs } from 'vue';
import { useAssetManager, assetManagerEngine } from '@/composables/useAssetManager';
import type { Asset } from '@/types/asset-management';

interface VideoViewerState {
  visible: boolean;
  src: string;
  title: string;
  poster?: string;
}

// 全局单例状态
const state = reactive<VideoViewerState>({
  visible: false,
  src: '',
  title: '',
  poster: ''
});

/**
 * 视频预览服务
 */
export function useVideoViewer() {
  const { getAssetUrl } = useAssetManager();

  /**
   * 预览视频
   * @param source 视频源 (URL 字符串 或 Asset 对象)
   * @param options 额外选项
   */
  const previewVideo = async (source: string | Asset, options: { title?: string; poster?: string } = {}) => {
    let url = '';
    let title = options.title || '视频预览';

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
            title = relativePath.split('/').pop() || '视频';
          }
        } else {
          // 假设是相对路径，尝试转换为 asset 协议
          const basePath = await assetManagerEngine.getAssetBasePath();
          url = assetManagerEngine.convertToAssetProtocol(source, basePath);
          if (!title) title = source.split('/').pop() || '视频';
        }
      } else {
        // Asset 对象
        // getAssetUrl 已经被我们优化过，会返回 asset:// 协议
        url = await getAssetUrl(source);
        if (!title) title = source.name;
      }

      // 更新状态
      state.src = url;
      state.title = title;
      state.poster = options.poster;
      state.visible = true;

    } catch (error) {
      console.error('无法预览视频:', error);
    }
  };

  const close = () => {
    state.visible = false;
    // 稍微延迟清空 src，避免关闭动画时画面突然消失
    setTimeout(() => {
      if (!state.visible) {
        state.src = '';
      }
    }, 300);
  };

  return {
    ...toRefs(state),
    previewVideo,
    close
  };
}