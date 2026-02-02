import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { GenerationSession } from "../types";
import { useNodeManager } from "./useNodeManager";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";

const logger = createModuleLogger("media-generator/export-manager");

export interface ExportOptions {
  includeMetadata?: boolean;
  includeAssets?: boolean;
  includeTaskDetails?: boolean;
}

export function useMediaExportManager() {
  const nodeManager = useNodeManager();

  /**
   * 将分支导出为 Markdown
   */
  const exportBranchAsMarkdown = async (
    session: GenerationSession,
    leafId: string,
    options: ExportOptions = {
      includeMetadata: true,
      includeAssets: true,
      includeTaskDetails: true,
    }
  ) => {
    try {
      const path = nodeManager.getNodePath(session, leafId);
      let markdown = `# Media Generation Branch Export\n\n`;
      markdown += `*Session: ${session.name}*\n`;
      markdown += `*Export Time: ${new Date().toLocaleString()}*\n\n---\n\n`;

      path.forEach((node, index) => {
        markdown += `### [${index + 1}] ${node.role.toUpperCase()}\n\n`;
        markdown += `${node.content}\n\n`;

        // 如果开启了元数据导出且是媒体任务，导出参数快照
        if (
          options.includeTaskDetails &&
          node.metadata?.isMediaTask &&
          node.metadata.taskSnapshot
        ) {
          const task = node.metadata.taskSnapshot;
          markdown += `#### Generation Parameters\n\n`;
          markdown += `- **Type**: ${task.type}\n`;
          markdown += `- **Model**: ${task.input.modelId}\n`;

          if (task.input.negativePrompt) {
            markdown += `- **Negative Prompt**: ${task.input.negativePrompt}\n`;
          }

          markdown += `\n\`\`\`json\n${JSON.stringify(task.input.params, null, 2)}\n\`\`\`\n\n`;

          if (options.includeAssets && task.status === "completed" && task.resultAssetIds?.length) {
            markdown += `> Result Assets: ${task.resultAssetIds.join(", ")}\n\n`;
          }
        }

        // 导出其他元数据
        if (options.includeMetadata && node.metadata && Object.keys(node.metadata).length > 0) {
          const filteredMeta = { ...node.metadata };
          delete filteredMeta.taskSnapshot; // 已经单独处理了
          if (Object.keys(filteredMeta).length > 0) {
            markdown += `#### Metadata\n\n\`\`\`json\n${JSON.stringify(filteredMeta, null, 2)}\n\`\`\`\n\n`;
          }
        }

        markdown += `---\n\n`;
      });

      const savePath = await save({
        defaultPath: `media_branch_${session.id.slice(0, 8)}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });

      if (savePath) {
        await writeTextFile(savePath, markdown);
        customMessage.success("分支已成功导出为 Markdown");
      }
    } catch (error) {
      logger.error("导出 Markdown 失败", error);
      customMessage.error("导出失败");
    }
  };

  /**
   * 将分支导出为 JSON (Raw)
   */
  const exportBranchAsJson = async (session: GenerationSession, leafId: string) => {
    try {
      const path = nodeManager.getNodePath(session, leafId);
      const exportData = {
        type: "media-generator-branch",
        version: "1.0",
        sessionId: session.id,
        sessionName: session.name,
        exportTime: new Date().toISOString(),
        nodes: path,
      };

      const savePath = await save({
        defaultPath: `media_branch_${session.id.slice(0, 8)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (savePath) {
        await writeTextFile(savePath, JSON.stringify(exportData, null, 2));
        customMessage.success("分支已成功导出为 JSON");
      }
    } catch (error) {
      logger.error("导出 JSON 失败", error);
      customMessage.error("导出失败");
    }
  };

  return {
    exportBranchAsMarkdown,
    exportBranchAsJson,
  };
}
