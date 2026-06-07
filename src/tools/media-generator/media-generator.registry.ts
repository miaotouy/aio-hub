import { markRaw, watch, type WatchStopHandle } from "vue";
import { Sparkles } from "lucide-vue-next";
import type { ServiceMetadata, ToolRegistry, ToolConfig } from "@/services/types";
import type { AssetSidecarAction, Asset } from "@/types/asset-management";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import { createModuleLogger } from "@/utils/logger";
import { extractMetadata } from "@/utils/mediaMetadataManager";
import { invoke } from "@tauri-apps/api/core";
import { useGenerationInfoViewer } from "./composables/useGenerationInfoViewer";
import { useMediaGenInputManager } from "./composables/useMediaGenInputManager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useMediaGenStore } from "./stores/mediaGenStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import {
  buildAgentMethods,
  type VisibleAgentModel,
} from "./services/buildAgentMethods";
import type { MediaTaskType } from "./types";

const logger = createModuleLogger("media-generator/registry");
const errorHandler = createModuleErrorHandler("media-generator/registry");

/**
 * 媒体生成中心 UI 配置
 */
export const toolConfig: ToolConfig = {
  name: "媒体生成中心",
  path: "/media-generator",
  icon: markRaw(Sparkles),
  component: () => import("./views/MediaGeneratorView.vue"),
  description: "一站式媒体生成工作站，支持图片、视频和音频生成。",
  category: ["AI 工具", "媒体工具"],
  version: "2.1.0",
};

/**
 * 媒体生成中心工具注册
 */
export default class MediaGeneratorRegistry implements ToolRegistry {
  readonly id = "media-generator";
  readonly name = "媒体生成中心";
  readonly description = "一站式媒体生成工作站，支持图片、视频和音频生成。";

  private _inputManager: ReturnType<typeof useMediaGenInputManager> | null =
    null;
  private dynamicMethodNames = new Set<string>();
  private discoveryInvalidationStop: WatchStopHandle | null = null;

  /**
   * 获取输入管理器实例（惰性初始化）
   */
  private get inputManager() {
    if (!this._inputManager) {
      this._inputManager = useMediaGenInputManager();
    }
    return this._inputManager;
  }

  initialize() {
    this.setupDiscoveryInvalidation();
  }

  dispose() {
    this.discoveryInvalidationStop?.();
    this.discoveryInvalidationStop = null;
    this.clearDynamicHandlers();
  }

  private setupDiscoveryInvalidation() {
    if (this.discoveryInvalidationStop) return;
    const store = useMediaGenStore();
    const { profiles } = useLlmProfiles();

    this.discoveryInvalidationStop = watch(
      [
        () => store.settings.agentConfig,
        () =>
          profiles.value.map((profile) => ({
            id: profile.id,
            enabled: profile.enabled,
            type: profile.type,
            models: profile.models.map((model) => ({
              id: model.id,
              name: model.name,
              capabilities: model.capabilities,
            })),
          })),
      ],
      () => {
        this.invalidateToolDiscoveryCache();
      },
      { deep: true }
    );
  }

  private invalidateToolDiscoveryCache() {
    void import("@/tools/tool-calling/composables/useToolCalling")
      .then(({ useToolCalling }) => {
        useToolCalling().invalidateDiscoveryCache();
      })
      .catch((error) => {
        logger.debug("刷新工具发现缓存失败", error);
      });
  }

  private clearDynamicHandlers() {
    for (const methodName of this.dynamicMethodNames) {
      delete (this as any)[methodName];
    }
    this.dynamicMethodNames.clear();
  }

  private bindDynamicHandlers(
    handlers: Record<string, (args: any, context?: any) => Promise<string>>
  ) {
    this.clearDynamicHandlers();
    Object.entries(handlers).forEach(([methodName, handler]) => {
      (this as any)[methodName] = handler.bind(this);
      this.dynamicMethodNames.add(methodName);
    });
  }

  private getSupportedMediaTypes(model: LlmModelInfo): MediaTaskType[] {
    const types: MediaTaskType[] = [];
    if (model.capabilities?.imageGeneration) types.push("image");
    if (model.capabilities?.videoGeneration) types.push("video");
    if (model.capabilities?.audioGeneration) types.push("speech");
    if (model.capabilities?.musicGeneration) types.push("music");
    return types;
  }

  private collectVisibleModels(): VisibleAgentModel[] {
    const store = useMediaGenStore();
    const { enabledProfiles } = useLlmProfiles();
    const agentConfig = store.settings.agentConfig;
    const visibleByModelId = new Map<string, VisibleAgentModel[]>();

    const isModelVisible = (modelId: string) => {
      if (agentConfig.visibilityMode === "whitelist") {
        return agentConfig.whitelistModelIds.includes(modelId);
      }
      return !agentConfig.blacklistModelIds.includes(modelId);
    };

    for (const profile of enabledProfiles.value) {
      for (const model of profile.models) {
        const supportedMediaTypes = this.getSupportedMediaTypes(model);
        if (supportedMediaTypes.length === 0 || !isModelVisible(model.id)) {
          continue;
        }

        const candidate: VisibleAgentModel = {
          profile,
          model,
          supportedMediaTypes,
          isFast: agentConfig.fastModelIds.includes(model.id),
          paramNotes: agentConfig.modelParamNotes[model.id],
        };

        const existing = visibleByModelId.get(model.id) || [];
        existing.push(candidate);
        visibleByModelId.set(model.id, existing);
      }
    }

    return Array.from(visibleByModelId.values()).map((candidates) =>
      this.resolveProfileRoute(candidates, agentConfig.profilePriority)
    );
  }

  private resolveProfileRoute(
    candidates: VisibleAgentModel[],
    profilePriority: string[]
  ): VisibleAgentModel {
    const { enabledProfiles } = useLlmProfiles();
    const profileOrder = new Map(
      enabledProfiles.value.map((profile: LlmProfile, index: number) => [
        profile.id,
        index,
      ])
    );
    const priorityOrder = new Map(
      profilePriority.map((profileId, index) => [profileId, index])
    );

    return [...candidates].sort((a, b) => {
      const ap = priorityOrder.get(a.profile.id);
      const bp = priorityOrder.get(b.profile.id);
      const ar = ap === undefined ? Number.MAX_SAFE_INTEGER : ap;
      const br = bp === undefined ? Number.MAX_SAFE_INTEGER : bp;
      if (ar !== br) return ar - br;
      return (
        (profileOrder.get(a.profile.id) ?? Number.MAX_SAFE_INTEGER) -
        (profileOrder.get(b.profile.id) ?? Number.MAX_SAFE_INTEGER)
      );
    })[0];
  }

  getMetadata(): ServiceMetadata {
    const visibleModels = this.collectVisibleModels();
    const { methods, handlers } = buildAgentMethods(visibleModels);
    this.bindDynamicHandlers(handlers);
    return { methods };
  }

  // ==================== 核心业务方法 ====================

  /**
   * 向输入框添加内容
   * @param content 要添加的内容
   * @param options 添加选项
   */
  public addContentToInput(
    content: string,
    options: { position?: "append" | "prepend" } = {}
  ) {
    return errorHandler.wrapSync(
      () => {
        const { position = "append" } = options;
        logger.info("添加内容到输入框", {
          contentLength: content.length,
          position,
        });
        this.inputManager.addContent(content, position);
        return {
          success: true,
          currentContent: this.inputManager.getContent(),
          currentAttachmentCount: this.inputManager.attachmentCount,
        };
      },
      {
        userMessage: "添加内容到输入框失败",
      }
    )!;
  }

  /**
   * 获取当前输入框内容
   */
  public getInputContent(): string {
    return this.inputManager.getContent();
  }

  /**
   * 设置输入框内容（完全覆盖）
   */
  public setInputContent(content: string) {
    return errorHandler.wrapSync(
      () => {
        logger.info("设置输入框内容", { contentLength: content.length });
        this.inputManager.setContent(content);
        return {
          success: true,
          currentContent: this.inputManager.getContent(),
          currentAttachmentCount: this.inputManager.attachmentCount,
        };
      },
      {
        userMessage: "设置输入框内容失败",
      }
    )!;
  }

  /**
   * 批量添加附件
   */
  public addAssets(assets: Asset[]): number {
    return errorHandler.wrapSync(
      () => {
        logger.info("批量添加附件", { count: assets.length });
        return this.inputManager.addAssets(assets);
      },
      {
        userMessage: "添加附件失败",
      }
    )!;
  }

  /**
   * 注册资产附属操作
   * 允许在资产管理器中查看生成参数或进行二次创作
   */
  getAssetSidecarActions(): AssetSidecarAction[] {
    return [
      {
        id: "media-generator:view-info",
        label: "查看生成参数",
        icon: markRaw(Sparkles),
        isVisible: (asset: Asset) => {
          // 只要是本模块生成的资产，或者包含衍生数据的资产
          const hasGenerationData = !!asset.metadata?.derived?.["generation"];
          const isGenerated = asset.origins.some(
            (o) => o.sourceModule === "media-generator"
          );
          return hasGenerationData || isGenerated;
        },
        handler: async (asset: Asset) => {
          logger.info("查看生成参数", { assetId: asset.id });

          let generationData = asset.metadata?.derived?.["generation"] as any;

          // 如果没有衍生数据，尝试从文件读取
          if (!generationData) {
            try {
              const bytes = await invoke<number[]>("get_asset_binary", {
                relativePath: asset.path,
              });
              let mimeType = asset.mimeType;
              if (!mimeType) {
                if (asset.type === "image") mimeType = "image/png";
                else if (asset.type === "video") mimeType = "video/mp4";
                else if (asset.type === "audio") mimeType = "audio/mpeg";
              }
              generationData = await extractMetadata(
                new Uint8Array(bytes).buffer,
                mimeType || "application/octet-stream"
              );
              if (generationData) {
                logger.info("从文件内嵌元数据中提取到生成参数");
              }
            } catch (e) {
              logger.warn("从文件提取元数据失败", e);
            }
          }

          if (!generationData) {
            // 如果还是没有，提示用户
            const { customMessage } = await import("@/utils/customMessage");
            customMessage.warning("未找到生成参数信息");
            return;
          }

          // 弹出全局查看对话框
          const { show } = useGenerationInfoViewer();
          show(asset, generationData);
        },
        order: 100,
      },
    ];
  }
}
