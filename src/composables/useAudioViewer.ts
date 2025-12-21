import { reactive, toRefs } from 'vue';
import { useAssetManager, assetManagerEngine } from '@/composables/useAssetManager';
import type { Asset } from '@/types/asset-management';

import type { AudioItem } from '@/components/common/AudioPlayer.vue';

interface AudioViewerState {
  visible: boolean;
  src: string;
  title: string;
  poster: string;
  artist: string;
  playlist: AudioItem[];
  initialIndex: number;
}

// 全局单例状态
const state = reactive<AudioViewerState>({
  visible: false,
  src: '',
  title: '',
  poster: '',
  artist: '',
  playlist: [],
  initialIndex: 0
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
    const item = await resolveAudioItem(source, options);
    if (!item) return;

    // 更新状态 (单曲模式)
    state.src = item.src;
    state.title = item.title || '音频预览';
    state.poster = item.poster || '';
    state.artist = item.artist || '';
    state.playlist = [item];
    state.initialIndex = 0;
    state.visible = true;
  };

  /**
   * 预览播放列表
   * @param playlist 列表数据
   * @param initialIndex 初始索引
   */
  const previewPlaylist = async (
    items: (string | Asset | AudioItem)[],
    initialIndex = 0
  ) => {
    try {
      const resolvedItems: AudioItem[] = [];
      for (const item of items) {
        if (typeof item === 'object' && 'src' in item && !('id' in item)) {
          // 已经是 AudioItem
          resolvedItems.push(item as AudioItem);
        } else {
          // 可能是 string 或 Asset
          const resolved = await resolveAudioItem(item as string | Asset);
          if (resolved) resolvedItems.push(resolved);
        }
      }

      if (resolvedItems.length === 0) return;

      const current = resolvedItems[initialIndex] || resolvedItems[0];
      state.src = current.src;
      state.title = current.title || '音频预览';
      state.poster = current.poster || '';
      state.artist = current.artist || '';
      state.playlist = resolvedItems;
      state.initialIndex = initialIndex;
      state.visible = true;
    } catch (error) {
      console.error('无法预览音频列表:', error);
    }
  };

  /**
   * 内部方法：将各种格式转换为 AudioItem
   */
  const resolveAudioItem = async (
    source: string | Asset,
    options: { title?: string; poster?: string; artist?: string } = {}
  ): Promise<AudioItem | null> => {
    let url = '';
    let title = options.title || '';
    let poster = options.poster || '';
    let artist = options.artist || '';

    try {
      if (typeof source === 'string') {
        if (source.startsWith('http') || source.startsWith('blob:') || source.startsWith('asset:')) {
          url = source;
        } else if (source.startsWith('appdata://')) {
          const relativePath = source.substring(10);
          const basePath = await assetManagerEngine.getAssetBasePath();
          url = assetManagerEngine.convertToAssetProtocol(relativePath, basePath);
          if (!title) title = relativePath.split('/').pop() || '音频';
        } else {
          const basePath = await assetManagerEngine.getAssetBasePath();
          url = assetManagerEngine.convertToAssetProtocol(source, basePath);
          if (!title) title = source.split('/').pop() || '音频';
        }
      } else {
        url = await getAssetUrl(source);
        if (!title) title = source.name;
        if (!poster && source.thumbnailPath) {
          const basePath = await assetManagerEngine.getAssetBasePath();
          poster = assetManagerEngine.convertToAssetProtocol(source.thumbnailPath, basePath);
        }
      }
      return { src: url, title, poster, artist };
    } catch (error) {
      console.error('解析音频项失败:', error);
      return null;
    }
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
    previewPlaylist,
    close
  };
}