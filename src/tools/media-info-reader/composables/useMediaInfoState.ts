import { ref, computed } from "vue";
import type { ImageMetadataResult, MediaInfoState } from "../types";

export function useMediaInfoState() {
  const state = ref<MediaInfoState>({
    previewSrc: "",
    isLoading: false,
    currentAsset: undefined,
    activeTab: "webui",
    webuiInfo: { positivePrompt: "", negativePrompt: "", generationInfo: "" },
    comfyuiWorkflow: "",
    stCharacterInfo: "",
    aioInfo: "",
    aioFormat: "json" as "json" | "yaml",
    fullExifInfo: "",
  });

  const hasData = computed(
    () =>
      state.value.webuiInfo.positivePrompt ||
      state.value.comfyuiWorkflow ||
      state.value.stCharacterInfo ||
      state.value.aioInfo ||
      state.value.fullExifInfo
  );

  const clearWorkspace = () => {
    state.value = {
      previewSrc: "",
      isLoading: false,
      currentAsset: undefined,
      activeTab: "webui",
      webuiInfo: { positivePrompt: "", negativePrompt: "", generationInfo: "" },
      comfyuiWorkflow: "",
      stCharacterInfo: "",
      aioInfo: "",
      aioFormat: "json",
      fullExifInfo: "",
    };
  };

  const updateFromResult = (result: ImageMetadataResult) => {
    state.value.webuiInfo = result.webuiInfo;
    state.value.comfyuiWorkflow =
      typeof result.comfyuiWorkflow === "object"
        ? JSON.stringify(result.comfyuiWorkflow, null, 2)
        : result.comfyuiWorkflow;
    state.value.stCharacterInfo = result.stCharacterInfo
      ? JSON.stringify(result.stCharacterInfo, null, 2)
      : "";
    if (result.aioInfo) {
      state.value.aioFormat = result.aioInfo.format;
      state.value.aioInfo = typeof result.aioInfo.content === "object"
        ? JSON.stringify(result.aioInfo.content, null, 2)
        : result.aioInfo.content;
    } else {
      state.value.aioInfo = "";
      state.value.aioFormat = "json";
    }
    state.value.fullExifInfo = result.fullExifInfo
      ? JSON.stringify(result.fullExifInfo, null, 2)
      : "";

    autoSelectTab();
  };

  const autoSelectTab = () => {
    if (state.value.aioInfo) {
      state.value.activeTab = "aio";
    } else if (state.value.webuiInfo.positivePrompt) {
      state.value.activeTab = "webui";
    } else if (state.value.comfyuiWorkflow) {
      state.value.activeTab = "comfyui";
    } else if (state.value.stCharacterInfo) {
      state.value.activeTab = "st";
    } else {
      state.value.activeTab = "full";
    }
  };

  const setError = (message: string) => {
    state.value.webuiInfo = { positivePrompt: "", negativePrompt: "", generationInfo: "" };
    state.value.comfyuiWorkflow = "";
    state.value.stCharacterInfo = "";
    state.value.aioInfo = "";
    state.value.aioFormat = "json";
    state.value.fullExifInfo = message;
    state.value.activeTab = "full";
  };

  return {
    state,
    hasData,
    clearWorkspace,
    updateFromResult,
    setError,
  };
}