/**
 * 模型管理逻辑
 * 负责模型的增删改、从 API 获取模型列表
 */
import { ref } from "vue";
import type { Ref, ComputedRef } from "vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { fetchModelsFromApi } from "@/llm-apis/model-fetcher";
import type { LlmProfile, LlmModelInfo } from "@/types/llm-profiles";

const errorHandler = createModuleErrorHandler("LlmServiceSettings/ModelEditor");

export function useModelEditor(
  editForm: Ref<LlmProfile>,
  selectedProfile: ComputedRef<LlmProfile | null>
) {
  // 模型编辑对话框状态
  const showModelDialog = ref(false);
  const editingModel = ref<LlmModelInfo | null>(null);
  const isEditingModel = ref(false);

  // 模型获取对话框状态
  const showModelFetcherDialog = ref(false);
  const fetchedModels = ref<LlmModelInfo[]>([]);
  const fetchedRawResponse = ref<any>(null);
  const isFetchingModels = ref(false);

  const addModel = () => {
    editingModel.value = null;
    isEditingModel.value = false;
    showModelDialog.value = true;
  };

  const editModel = (index: number) => {
    editingModel.value = editForm.value.models[index];
    isEditingModel.value = true;
    showModelDialog.value = true;
  };

  const handleSaveModel = (model: LlmModelInfo) => {
    if (isEditingModel.value && editingModel.value) {
      const index = editForm.value.models.findIndex((m) => m.id === editingModel.value!.id);
      if (index !== -1) {
        editForm.value.models[index] = model;
      }
    } else {
      editForm.value.models.push(model);
    }
  };

  const deleteModel = (index: number) => {
    editForm.value.models.splice(index, 1);
  };

  const deleteModelGroup = (indices: number[]) => {
    const sortedIndices = indices.sort((a, b) => b - a);
    sortedIndices.forEach((index) => {
      editForm.value.models.splice(index, 1);
    });
    customMessage.success(`成功删除分组下的 ${indices.length} 个模型`);
  };

  const clearAllModels = () => {
    editForm.value.models = [];
    customMessage.success("已清空所有模型");
  };

  // 从 API 获取模型列表
  const fetchModels = async () => {
    if (!selectedProfile.value) {
      customMessage.error("请先选择一个配置");
      return;
    }

    isFetchingModels.value = true;
    try {
      const { models, rawResponse } = await fetchModelsFromApi(selectedProfile.value);

      if (models.length === 0) {
        customMessage.warning("未获取到任何模型");
        return;
      }

      fetchedModels.value = models;
      fetchedRawResponse.value = rawResponse;
      showModelFetcherDialog.value = true;
    } catch (error: any) {
      errorHandler.error(error, "获取模型列表失败");
    } finally {
      isFetchingModels.value = false;
    }
  };

  // 添加从弹窗选择的模型
  const handleAddModels = (modelsToAdd: LlmModelInfo[]) => {
    const newModels = modelsToAdd.filter(
      (m) => !editForm.value.models.some((em) => em.id === m.id)
    );
    editForm.value.models.push(...newModels);
    customMessage.success(`成功添加 ${newModels.length} 个模型`);
  };

  return {
    showModelDialog,
    editingModel,
    isEditingModel,
    showModelFetcherDialog,
    fetchedModels,
    fetchedRawResponse,
    isFetchingModels,
    addModel,
    editModel,
    handleSaveModel,
    deleteModel,
    deleteModelGroup,
    clearAllModels,
    fetchModels,
    handleAddModels,
  };
}
