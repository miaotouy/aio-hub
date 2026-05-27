import { ref } from "vue";
import { defineStore } from "pinia";
import { useSketchSettings } from "../composables/useSketchSettings";
import { useSketchStorage } from "../composables/useSketchStorage";
import type { SketchProject } from "../types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";

const errorHandler = createModuleErrorHandler("SketchPad/Store");

export const useSketchPadStore = defineStore("sketchPad", () => {
  // ─── 项目索引（画廊用） ───
  const projects = ref<SketchProject[]>([]);

  // ─── 全局设置 ───
  const { settings, loadSettings, saveSettings, resetSettings } =
    useSketchSettings();

  // ─── 多实例管理预留 ───
  const activeSessionId = ref<string | null>(null);

  // ─── 存储引擎 ───
  const storage = useSketchStorage();

  // ─── 项目级操作 ───

  /** 同步索引与实际目录状态 */
  async function syncIndex(): Promise<void> {
    const index = await storage.syncIndex();
    projects.value = index.projects;
  }

  /** 加载索引 */
  async function loadIndex(): Promise<void> {
    const index = await storage.loadIndex();
    projects.value = index.projects;
  }

  /** 删除项目 */
  async function deleteProject(id: string): Promise<boolean> {
    const success = await storage.deleteProject(id);
    if (success) {
      projects.value = projects.value.filter((p) => p.id !== id);
      customMessage.success("删除成功");
    }
    return !!success;
  }

  /** 重命名项目 */
  async function renameProject(id: string, newName: string): Promise<boolean> {
    const result = await errorHandler.wrapAsync(
      async () => {
        const manifest = await storage.loadProject(id);
        if (!manifest) return false;

        manifest.project.name = newName;
        manifest.project.updatedAt = new Date().toISOString();

        // 更新本地索引
        const idx = projects.value.findIndex((p) => p.id === id);
        if (idx !== -1) {
          projects.value[idx].name = newName;
          projects.value[idx].updatedAt = manifest.project.updatedAt;
        }

        // 注意：完整保存需要 canvases 和 stage，这里只更新 manifest
        // 实际的 manifest 写入由调用方在编辑器上下文中完成
        // 这里仅更新索引
        await loadIndex();
        return true;
      },
      { userMessage: "重命名项目失败" }
    );

    if (result) {
      customMessage.success("重命名成功");
    }
    return !!result;
  }

  return {
    // 状态
    projects,
    settings,
    activeSessionId,

    // 项目操作
    syncIndex,
    loadIndex,
    deleteProject,
    renameProject,

    // 设置操作
    loadSettings,
    saveSettings,
    resetSettings,

    // 存储引擎（供 session 内部使用）
    storage,
  };
});
