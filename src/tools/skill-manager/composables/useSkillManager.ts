/**
 * useSkillManager — 技能管理 Composable
 *
 * 提供 UI 层与 Store/Service 之间的粘合逻辑。
 */
import { useSkillManagerStore } from "../stores/skillManagerStore";
import { skillLoader } from "../services/SkillLoader";
import { skillBridgeFactory } from "../services/SkillBridgeFactory";

export function useSkillManager() {
  const store = useSkillManagerStore();

  /** 初始化：加载配置 + 扫描技能 */
  async function initialize() {
    await store.loadConfig();
    store.setScanStatus("scanning");
    try {
      const manifests = await skillLoader.scanAll();
      store.setManifests(manifests);
      store.setScanStatus("ready");
    } catch (error) {
      console.error("[SkillManager] 扫描技能失败", error);
      store.setScanStatus("error");
    }
  }

  /** 刷新技能清单 */
  async function refresh() {
    await skillBridgeFactory.refresh();
  }

  /** 切换技能启用状态 */
  function toggleSkill(name: string) {
    store.toggleSkill(name);
  }

  return {
    store,
    initialize,
    refresh,
    toggleSkill,
  };
}
