import { ref, toRaw, type Ref } from "vue";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import yaml from "js-yaml";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { useAnchorRegistry } from "../../../composables/ui/useAnchorRegistry";
import type { ChatMessageNode } from "../../../types";
import type { PresetMessageGroup } from "../../../types/agent";
import {
  isPromptFile,
  parsePromptFile,
  convertMacros,
  type ParsedPromptFile,
} from "../../../services/sillyTavernParser";
import { cleanupPresetMessageGroupRefs } from "./presetGroupState";

export function usePresetImportExport(options: {
  localMessages: Ref<ChatMessageNode[]>;
  presetGroups: Ref<PresetMessageGroup[]>;
  agentName: Ref<string>;
  onSyncToParent: () => void;
  importFileInput: Ref<HTMLInputElement | null>;
}) {
  const {
    localMessages,
    presetGroups,
    agentName,
    onSyncToParent,
    importFileInput,
  } = options;
  const anchorRegistry = useAnchorRegistry();

  const showSTImportDialog = ref(false);
  const stImportData = ref<ParsedPromptFile>({
    systemPrompts: [],
    injectionPrompts: [],
    unorderedPrompts: [],
    parameters: {},
  });

  function isAnchorType(type?: string): boolean {
    return !!type && type !== "message" && anchorRegistry.hasAnchor(type);
  }

  function cleanMessagesForExport(messages: ChatMessageNode[]): object {
    const cleanedMessages = messages
      .filter((m) => !isAnchorType(m.type))
      .map((m) => {
        const cloned = JSON.parse(JSON.stringify(toRaw(m)));
        if (cloned.metadata) {
          delete cloned.metadata.lastCalcHash;
          delete cloned.metadata.contentTokens;
          if (Object.keys(cloned.metadata).length === 0) delete cloned.metadata;
        }
        return cloned;
      });

    return {
      version: 2,
      groups: toRaw(presetGroups.value),
      messages: cleanedMessages,
    };
  }

  function applyImportedData(importedData: any) {
    if (
      importedData &&
      typeof importedData === "object" &&
      !Array.isArray(importedData) &&
      "messages" in importedData
    ) {
      // v2+ 格式：含 messages 字段的对象
      presetGroups.value = importedData.groups || [];
      const processed = (importedData.messages || []).map((m: any) => ({
        ...m,
        content:
          typeof m.content === "string" ? convertMacros(m.content) : m.content,
      }));
      localMessages.value = [
        ...localMessages.value.filter((m) => isAnchorType(m.type)),
        ...processed,
      ];
      cleanupPresetMessageGroupRefs(localMessages.value, presetGroups.value);
      onSyncToParent();
      customMessage.success("导入成功");
    } else if (Array.isArray(importedData)) {
      // v1 格式（纯数组）
      const processed = importedData.map((m: any) => ({
        ...m,
        content:
          typeof m.content === "string" ? convertMacros(m.content) : m.content,
      }));
      localMessages.value = [
        ...localMessages.value.filter((m) => isAnchorType(m.type)),
        ...processed,
      ];
      presetGroups.value = [];
      cleanupPresetMessageGroupRefs(localMessages.value, presetGroups.value);
      onSyncToParent();
      customMessage.success("导入成功");
    } else {
      customMessage.error("数据格式不正确");
    }
  }

  async function handleExport(format: "json" | "yaml" = "json") {
    if (localMessages.value.length === 0)
      return customMessage.warning("没有可导出的预设消息");

    const data = cleanMessagesForExport(localMessages.value);
    const dataStr =
      format === "yaml" ? yaml.dump(data) : JSON.stringify(data, null, 2);
    const prefix = agentName.value ? `${agentName.value}-` : "";
    const defaultFilename = `${prefix}preset-${new Date().toISOString().split("T")[0]}.${format}`;

    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!filePath) return;

    await writeTextFile(filePath, dataStr);
    customMessage.success(`已成功导出至：${filePath}`);
  }

  async function handleCopy(format: "json" | "yaml" = "json") {
    if (localMessages.value.length === 0)
      return customMessage.warning("没有可复制的消息");
    try {
      const data = cleanMessagesForExport(localMessages.value);
      const dataStr =
        format === "yaml" ? yaml.dump(data) : JSON.stringify(data, null, 2);
      await writeText(dataStr);
      customMessage.success(`预设已作为 ${format.toUpperCase()} 复制`);
    } catch {
      customMessage.error("复制失败");
    }
  }

  async function handlePaste() {
    try {
      const text = await readText();
      if (!text) return customMessage.warning("剪贴板为空");

      let imported: any;
      try {
        imported = JSON.parse(text);
      } catch {
        try {
          imported = yaml.load(text);
        } catch {
          return customMessage.error("剪贴板内容不是有效的 JSON 或 YAML");
        }
      }

      const hasRealMessages = localMessages.value.some(
        (m) => !isAnchorType(m.type)
      );
      if (hasRealMessages) {
        await ElMessageBox.confirm(
          "这将覆盖当前所有非锚点消息，确定吗？",
          "确认粘贴",
          {
            type: "warning",
            confirmButtonText: "覆盖",
            cancelButtonText: "取消",
            lockScroll: false,
          }
        ).catch(() => {
          throw new Error("User cancelled");
        });
      }

      applyImportedData(imported);
    } catch (error: any) {
      if (error.message !== "User cancelled") customMessage.error("粘贴失败");
    }
  }

  function handleImport() {
    importFileInput.value?.click();
  }

  async function handleFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = yaml.load(content);
      }

      if (isPromptFile(parsed)) {
        stImportData.value = parsePromptFile(parsed);
        showSTImportDialog.value = true;
      } else {
        applyImportedData(parsed);
      }
    } catch {
      customMessage.error("导入失败");
    } finally {
      (event.target as HTMLInputElement).value = "";
    }
  }

  function handleConfirmSTImport(data: ParsedPromptFile) {
    const newMessages = [
      ...data.systemPrompts,
      ...data.injectionPrompts,
      ...data.unorderedPrompts,
    ];
    if (newMessages.length > 0) {
      const historyIndex = localMessages.value.findIndex(
        (m) => m.type === "chat_history"
      );
      if (historyIndex !== -1) {
        localMessages.value.splice(historyIndex, 0, ...newMessages);
      } else {
        localMessages.value.push(...newMessages);
      }
      onSyncToParent();
      customMessage.success(`成功导入 ${newMessages.length} 条消息`);
    }
    showSTImportDialog.value = false;
  }

  return {
    showSTImportDialog,
    stImportData,
    handleExport,
    handleCopy,
    handlePaste,
    handleImport,
    handleFileSelected,
    handleConfirmSTImport,
  };
}
