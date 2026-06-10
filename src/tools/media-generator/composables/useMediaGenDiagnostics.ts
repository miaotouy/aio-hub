import { computed } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useFileDownload } from "@/composables/useFileDownload";
import { getActiveModelProperties } from "@/config/model-metadata";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { createModuleLogger, logger as appLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import type { MediaMessage, MediaTaskType } from "../types";

const logger = createModuleLogger("media-generator/diagnostics");

function safeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function hasObjectKeys(value: unknown): boolean {
  return !!value && typeof value === "object" && Object.keys(value).length > 0;
}

function summarizeModel(model: LlmModelInfo | undefined) {
  if (!model) return null;
  const mediaGenParams = model.mediaGenParams;
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    group: model.group,
    capabilities: model.capabilities ? safeClone(model.capabilities) : {},
    hasMediaGenParams: hasObjectKeys(mediaGenParams),
    mediaGenParamKeys: mediaGenParams ? Object.keys(mediaGenParams) : [],
    mediaGenParams: mediaGenParams ? safeClone(mediaGenParams) : null,
  };
}

function summarizeProfile(profile: LlmProfile | undefined) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    type: profile.type,
    enabled: profile.enabled,
    modelCount: profile.models.length,
  };
}

function summarizeTask(task: any) {
  if (!task) return null;
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    progress: task.progress,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    input: {
      promptLength: task.input?.prompt?.length || 0,
      modelId: task.input?.modelId,
      profileId: task.input?.profileId,
      includeContext: task.input?.includeContext,
      paramKeys: task.input?.params ? Object.keys(task.input.params) : [],
      params: task.input?.params ? safeClone(task.input.params) : null,
      referenceAssetIds: task.input?.referenceAssetIds || [],
      contextMessageIds: task.input?.contextMessageIds || [],
    },
    error: task.error,
  };
}

function summarizeNode(node: MediaMessage | undefined) {
  if (!node) return null;
  return {
    id: node.id,
    role: node.role,
    status: node.status,
    parentId: node.parentId,
    childrenIds: node.childrenIds,
    lastSelectedChildId: node.lastSelectedChildId,
    isEnabled: node.isEnabled,
    contentLength: node.content?.length || 0,
    attachmentCount: node.attachments?.length || 0,
    metadata: {
      taskId: node.metadata?.taskId,
      isMediaTask: node.metadata?.isMediaTask,
      includeContext: node.metadata?.includeContext,
      hasTaskSnapshot: !!node.metadata?.taskSnapshot,
      taskSnapshot: summarizeTask(node.metadata?.taskSnapshot),
      error: node.metadata?.error,
    },
  };
}

export function useMediaGenDiagnostics() {
  const store = useMediaGenStore();
  const { profiles, getProfileById } = useLlmProfiles();
  const { downloadFile } = useFileDownload();

  const currentTypeConfig = computed(
    () => store.currentConfig.types[store.currentConfig.activeType]
  );

  const inspectCombo = (mediaType: MediaTaskType) => {
    const config = store.currentConfig.types[mediaType];
    const modelCombo = config?.modelCombo || "";
    const [profileId, modelId] = parseModelCombo(modelCombo);
    const profile = getProfileById(profileId);
    const model = profile?.models.find((item) => item.id === modelId);
    const matchedMetadata = modelId
      ? getActiveModelProperties(modelId, model?.provider || profile?.type)
      : undefined;

    return {
      mediaType,
      modelCombo,
      parsed: { profileId, modelId },
      profileFound: !!profile,
      modelFound: !!model,
      profile: summarizeProfile(profile),
      model: summarizeModel(model),
      matchedMetadata: matchedMetadata
        ? {
            hasMediaGenParams: hasObjectKeys(matchedMetadata.mediaGenParams),
            mediaGenParamKeys: matchedMetadata.mediaGenParams
              ? Object.keys(matchedMetadata.mediaGenParams)
              : [],
            capabilities: matchedMetadata.capabilities || {},
          }
        : null,
      currentParamKeys: config?.params ? Object.keys(config.params) : [],
      currentParams: config?.params ? safeClone(config.params) : null,
      includeContext: config?.includeContext,
    };
  };

  const findSameIdModels = (modelId: string) => {
    if (!modelId) return [];
    return profiles.value.flatMap((profile) =>
      profile.models
        .filter((model) => model.id === modelId)
        .map((model) => ({
          profile: summarizeProfile(profile),
          model: summarizeModel(model),
        }))
    );
  };

  const collectDiagnostics = () => {
    const activeType = store.currentConfig.activeType;
    const activeComboInfo = inspectCombo(activeType);
    const activeNode = store.nodes[store.activeLeafId];
    const activeTaskId =
      activeNode?.metadata?.taskId ||
      activeNode?.metadata?.taskSnapshot?.id ||
      store.activeLeafId;
    const activeTask = activeTaskId ? store.getTask(activeTaskId) : undefined;
    const activeModelId = activeComboInfo.parsed.modelId;

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      purpose: "media-generator-parameter-panel-diagnostics",
      app: {
        location: window.location.href,
        userAgent: navigator.userAgent,
      },
      session: {
        currentSessionId: store.currentSessionId,
        currentSessionName: store.currentSession?.name,
        rootNodeId: store.rootNodeId,
        activeLeafId: store.activeLeafId,
        messageCount: store.messages.length,
        nodeCount: Object.keys(store.nodes).length,
        taskCount: store.tasks.length,
      },
      currentConfig: safeClone(store.currentConfig),
      activeType,
      activeTypeConfig: safeClone(currentTypeConfig.value),
      comboInspection: {
        active: activeComboInfo,
        allTypes: {
          image: inspectCombo("image"),
          video: inspectCombo("video"),
          speech: inspectCombo("speech"),
          music: inspectCombo("music"),
        },
      },
      sameIdModels: findSameIdModels(activeModelId),
      activeNode: summarizeNode(activeNode),
      activeTask: summarizeTask(activeTask),
      visibleMessagePath: store.messages.map(summarizeNode),
      recentTasks: store.tasks.slice(0, 20).map(summarizeTask),
      profilesSummary: profiles.value.map((profile) => ({
        ...summarizeProfile(profile),
        models: profile.models.map((model) => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
          hasMediaGenParams: hasObjectKeys(model.mediaGenParams),
          mediaGenParamKeys: model.mediaGenParams
            ? Object.keys(model.mediaGenParams)
            : [],
          capabilities: model.capabilities || {},
        })),
      })),
      recentLogs: appLogger.getLogBuffer().slice(-300),
    };
  };

  const exportDiagnostics = async () => {
    const diagnostics = collectDiagnostics();
    const fileName = `media-generator-diagnostics-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;

    logger.info("导出媒体生成诊断信息", {
      fileName,
      activeType: diagnostics.activeType,
      activeCombo:
        diagnostics.comboInspection.active.modelCombo || "(empty)",
      activeModelHasRules:
        diagnostics.comboInspection.active.model?.hasMediaGenParams,
      sameIdModelCount: diagnostics.sameIdModels.length,
    });

    const savedPath = await downloadFile({
      filename: fileName,
      content: JSON.stringify(diagnostics, null, 2),
      mode: "manual",
      type: "text",
    });

    if (savedPath) {
      customMessage.success("诊断信息已导出");
    }

    return savedPath;
  };

  return {
    collectDiagnostics,
    exportDiagnostics,
  };
}
