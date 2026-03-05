/**
 * Deep Link 处理器
 * 负责监听 aiohub:// 协议并处理相关操作
 */
import { onOpenUrl, getCurrent as getCurrentDeepLinkUrls } from "@tauri-apps/plugin-deep-link";
import { listen } from "@tauri-apps/api/event";
import { onMounted, onUnmounted } from "vue";
import { customMessage } from "@/utils/customMessage";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useDeepLinkStore } from "@/stores/deepLink";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { llmPresets } from "@/config/llm-presets";
import type { LlmProfile, ProviderType } from "@/types/llm-profiles";

const logger = createModuleLogger("DeepLinkHandler");
const errorHandler = createModuleErrorHandler("DeepLinkHandler");

// 用于防止重复触发
let lastProcessedUrl = "";
let lastProcessedTime = 0;
const DUPLICATE_THRESHOLD = 2000; // 2秒内忽略相同 URL

export function useDeepLinkHandler() {
  const deepLinkStore = useDeepLinkStore();
  const { generateId } = useLlmProfiles();

  /**
   * 解析 URL 参数
   */
  const parseUrlParams = (urlStr: string) => {
    try {
      const url = new URL(urlStr);
      const params = new URLSearchParams(url.search);
      const action = url.host || url.pathname.replace(/^\/+/, "");

      return {
        action,
        params: Object.fromEntries(params.entries()),
      };
    } catch (e) {
      logger.error("解析 Deep Link URL 失败", e as Error, { urlStr });
      return null;
    }
  };

  /**
   * 提供商类型映射表 (处理别名)
   */
  const TYPE_ALIAS_MAP: Record<string, ProviderType> = {
    openai: "openai",
    anthropic: "claude",
    claude: "claude",
    google: "gemini",
    gemini: "gemini",
    deepseek: "deepseek",
    siliconflow: "siliconflow",
    groq: "groq",
    ollama: "ollama",
    openrouter: "openrouter",
    azure: "azure",
    xai: "xai",
    grok: "xai",
    cohere: "cohere",
    vertex: "vertexai",
    vertexai: "vertexai",
    suno: "suno-newapi",
  };

  /**
   * 推断提供商类型
   */
  const inferProviderType = (address: string, typeParam?: string): ProviderType => {
    // 1. 优先使用传进来的 type 参数并进行映射
    if (typeParam) {
      const normalizedType = typeParam.toLowerCase();
      if (TYPE_ALIAS_MAP[normalizedType]) {
        return TYPE_ALIAS_MAP[normalizedType];
      }
    }

    // 2. 根据地址推断
    const addr = address.toLowerCase();
    if (addr.includes("api.openai.com")) return "openai";
    if (addr.includes("api.deepseek.com")) return "deepseek";
    if (addr.includes("anthropic.com") || addr.includes("claude.ai")) return "claude";
    if (addr.includes("googleapis.com")) {
      if (addr.includes("aiplatform")) return "vertexai";
      return "gemini";
    }
    if (addr.includes("siliconflow.cn")) return "siliconflow";
    if (addr.includes("groq.com")) return "groq";
    if (addr.includes("openrouter.ai")) return "openrouter";
    if (addr.includes("api.x.ai")) return "xai";
    if (addr.includes("azure.com")) return "azure";
    if (addr.includes("api.cohere.com")) return "cohere";

    return "openai-compatible";
  };

  /**
   * 处理添加渠道操作
   */
  const handleAddProfile = async (params: Record<string, string>) => {
    const { key, address, name, type } = params;

    if (!key || !address) {
      customMessage.error("链接参数不完整，缺少 key 或 address");
      return;
    }

    const providerType = inferProviderType(address, type);
    const profileName = name || `新渠道 (${new URL(address).hostname})`;

    try {
      // 查找预设以获取默认模型
      const preset = llmPresets.find(
        (p) => p.type === providerType || p.name.toLowerCase() === providerType.toLowerCase()
      );

      const newProfile: LlmProfile = {
        id: generateId(),
        name: profileName,
        type: providerType,
        baseUrl: address.replace(/\/+$/, ""), // 移除末尾斜杠
        apiKeys: [key],
        enabled: true,
        models: preset?.defaultModels ? [...preset.defaultModels] : [],
        networkStrategy: "auto",
        relaxIdCerts: false,
        http1Only: true,
        options: {},
      };

      // 显示确认弹窗，由弹窗组件负责保存和导航
      deepLinkStore.showConfirm(newProfile, address);
    } catch (e) {
      errorHandler.error(e, "准备渠道添加失败");
    }
  };

  /**
   * 核心处理逻辑
   */
  const processUrl = async (url: string) => {
    // 防抖去重逻辑
    const now = Date.now();
    if (url === lastProcessedUrl && now - lastProcessedTime < DUPLICATE_THRESHOLD) {
      logger.info("忽略重复的 Deep Link 请求", { url });
      return;
    }
    lastProcessedUrl = url;
    lastProcessedTime = now;

    logger.info("正在处理 Deep Link", { url });
    const parsed = parseUrlParams(url);
    if (!parsed) return;

    const { action, params } = parsed;

    switch (action) {
      case "add-profile":
      case "providers": // 兼容某些中转格式
        await handleAddProfile(params);
        break;
      default:
        logger.warn("未知的 Deep Link 操作", { action });
    }
  };
  let unlistenDeepLink: (() => void) | null = null;
  let unlistenEvent: (() => void) | null = null;
  let unlistenSingleInstance: (() => void) | null = null;

  onMounted(async () => {
    try {
      // 1. 获取初始 Deep Link (处理冷启动)
      // 在 Windows 上，冷启动的 URL 也会出现在 getCurrentDeepLinkUrls 中
      getCurrentDeepLinkUrls()
        .then((urls) => {
          if (urls && urls.length > 0) {
            logger.info("获取到初始 Deep Link", { urls });
            for (const url of urls) {
              processUrl(url);
            }
          }
        })
        .catch((err) => {
          logger.error("获取初始 Deep Link 失败", err);
        });

      // 2. 监听原生插件提供的 Deep Link 事件 (主要针对 macOS/iOS/Android)
      unlistenDeepLink = await onOpenUrl((urls) => {
        logger.info("onOpenUrl 捕获到协议请求", { urls });
        for (const url of urls) {
          processUrl(url);
        }
      });

      // 3. 监听 Rust 端转发的自定义事件
      unlistenEvent = await listen<string[]>("deep-link://opened", (event) => {
        logger.info("收到 Rust 转发的 deep-link://opened 事件", { payload: event.payload });
        const urls = event.payload;
        if (Array.isArray(urls)) {
          for (const url of urls) {
            processUrl(url);
          }
        }
      });

      // 4. 监听 single-instance 事件 (针对 Windows/Linux 的热启动)
      unlistenSingleInstance = await listen<any>("single-instance", (event) => {
        logger.info("收到 single-instance 原始参数", { data: event.payload });

        const payload = event.payload;
        // 尝试从所有可能的字段中提取参数列表
        const allPossibleArgs = [
          ...(Array.isArray(payload) ? payload : []),
          ...(Array.isArray(payload?.args) ? payload.args : []),
        ];

        if (allPossibleArgs.length > 0) {
          // 过滤出所有符合协议格式的字符串，并去重
          const urls = Array.from(
            new Set(
              allPossibleArgs
                .filter((arg) => typeof arg === "string")
                .map((arg) => arg.replace(/^["']|["']$/g, "").trim())
                .filter((arg) => arg.startsWith("aiohub://"))
            )
          );

          if (urls.length > 0) {
            logger.info("从原始参数中提取到有效 URL", { urls });
            for (const url of urls) {
              processUrl(url);
            }
          } else {
            logger.warn("所有原始参数中均未找到 aiohub:// 协议", { allPossibleArgs });
          }
        }
      });
    } catch (e) {
      logger.error("初始化 Deep Link 监听失败", e as Error);
    }
  });

  onUnmounted(() => {
    if (unlistenDeepLink) unlistenDeepLink();
    if (unlistenEvent) unlistenEvent();
    if (unlistenSingleInstance) unlistenSingleInstance();
  });
}
