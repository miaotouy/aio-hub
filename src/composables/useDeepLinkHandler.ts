/**
 * Deep Link 处理器
 * 负责监听 aiohub:// 协议并处理相关操作
 */
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { listen } from "@tauri-apps/api/event";
import { onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { llmPresets } from "@/config/llm-presets";
import type { LlmProfile, ProviderType } from "@/types/llm-profiles";

const logger = createModuleLogger("DeepLinkHandler");
const errorHandler = createModuleErrorHandler("DeepLinkHandler");

export function useDeepLinkHandler() {
  const router = useRouter();
  const { saveProfile, generateId } = useLlmProfiles();

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
      await ElMessageBox.confirm(
        `检测到来自链接的渠道配置：\n\n名称：${profileName}\n类型：${providerType}\n地址：${address}\n\n是否确认添加？`,
        "添加渠道确认",
        {
          confirmButtonText: "确定添加",
          cancelButtonText: "取消",
          type: "info",
        }
      );

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

      await saveProfile(newProfile);
      customMessage.success("渠道添加成功");

      // 导航到设置页面的模型服务板块
      router.push({ path: "/settings", query: { section: "llm-service" } });
    } catch (e) {
      // 用户取消或保存失败
      if (e !== "cancel") {
        errorHandler.error(e, "添加渠道失败");
      }
    }
  };

  /**
   * 核心处理逻辑
   */
  const processUrl = async (url: string) => {
    logger.info("收到 Deep Link", { url });
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

  onMounted(async () => {
    try {
      // 1. 监听原生插件提供的 Deep Link 事件
      unlistenDeepLink = await onOpenUrl((urls) => {
        for (const url of urls) {
          processUrl(url);
        }
      });

      // 2. 监听 Rust 端通过 single-instance 转发的自定义事件
      unlistenEvent = await listen<string[]>("deep-link://opened", (event) => {
        const urls = event.payload;
        for (const url of urls) {
          processUrl(url);
        }
      });
    } catch (e) {
      logger.error("初始化 Deep Link 监听失败", e as Error);
    }
  });

  onUnmounted(() => {
    if (unlistenDeepLink) unlistenDeepLink();
    if (unlistenEvent) unlistenEvent();
  });
}
