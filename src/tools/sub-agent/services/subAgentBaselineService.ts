import { AgentCategory, DEFAULT_TOOL_CALL_CONFIG, } from "@/tools/agent-manager/types/agent";
/**
 * 内置基线子智能体按需释出服务（Materialization Pattern）
 *
 * 系统随包携带高质量只读母版（public/agent-presets/builtin-*），运行时首次
 * 需要 sub-agent 能力时，检测用户物理列表中缺失的内置 ID 并释放为可自由修改的
 * 本地物理 Agent：
 * - 已存在（无论 enabled 状态）绝不重复覆盖；
 * - 彻底缺失（纯净安装或被删除）时重新释出，等价于"删除即重置内置"。
 */
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { builtinPresets } from "@/config/agent-presets";
import { createModuleLogger } from "@/utils/logger";


const logger = createModuleLogger("sub-agent/baselineService");

export const BUILTIN_BASELINE_IDS = [
  "builtin-subagent",
] as const;

export type BuiltinBaselineId = (typeof BUILTIN_BASELINE_IDS)[number];

/**
 * 确保内置基线 Subagent 已按需释出到 AppData。
 * - 若某个内置 ID 在用户物理列表中已存在（无论其 enabled 是 true 还是 false），绝不重复覆盖；
 * - 若某个内置 ID 彻底缺失（纯净安装或被用户删除），则从预设中加载并物理化。
 */
async function materializeBaselineAgents(): Promise<void> {
  const agentStore = useAgentStore();
  if (agentStore.agents.length === 0) {
    await agentStore.loadAgents();
  }

  const existingIds = new Set(agentStore.agents.map((a) => a.id));
  const missingIds = BUILTIN_BASELINE_IDS.filter(
    (id) => !existingIds.has(id)
  ) as BuiltinBaselineId[];

  if (missingIds.length === 0) {
    return; // 全量存在，无需释出
  }

  logger.info("检测到缺失内置基线子智能体，开始按需释出", { missingIds });

  for (const id of missingIds) {
    try {
      // 通过静态索引定位 configUrl，而非裸拼目录路径
      const presetMeta = builtinPresets.find((p) => p.id === id);
      if (!presetMeta) {
        logger.warn(`内置预设未在 builtinPresets 中注册: ${id}`);
        continue;
      }

      const res = await fetch(presetMeta.configUrl);
      if (!res.ok) {
        logger.warn(
          `加载内置预设失败: ${presetMeta.configUrl} (${res.status})`
        );
        continue;
      }
      // 本批预设使用 config.json；若改用 config.yaml 需引入 js-yaml 解析
      const presetData = (await res.json()) as {
        name?: string;
        displayName?: string;
        description?: string;
        icon?: string;
        category?: string;
        tags?: string[];
        presetMessages?: unknown[];
        parameters?: Record<string, unknown>;
        subAgentConfig?: Record<string, unknown>;
        toolCallConfig?: Partial<typeof DEFAULT_TOOL_CALL_CONFIG>;
      };

      // category 仅接受合法枚举值，非法时回退 workflow（内置子智能体统一工作流分类）
      const validCategories = new Set<string>(Object.values(AgentCategory));
      const category = validCategories.has(presetData.category ?? "")
        ? (presetData.category as AgentCategory)
        : AgentCategory.Workflow;

      // subAgentConfig 规范化：内置基线必须为 enabled: true
      const subAgentConfig = {
        ...(presetData.subAgentConfig ?? {}),
        enabled: true,
      };

      // 物理化落盘：customId 保持内置预设稳定 ID；传参只挑选受支持的字段，
      // 避免把预设整包展开污染 Agent 对象。
      const agentId = agentStore.createAgent(
        presetData.name ?? id, // 第一参为 name：稳定 ID/宏替换名（slug）
        "", // 模型绑定由 subAgentConfig.modelBindingMode 表达，释出时留空
        "",
        {
          displayName: presetData.displayName ?? presetMeta.name, // UI 显示名
          description: presetData.description ?? presetMeta.description,
          icon: presetMeta.icon ?? presetData.icon,
          category,
          tags: presetData.tags,
          presetMessages: (presetData.presetMessages ?? []) as never,
          parameters: presetData.parameters,
          subAgentConfig,
          toolCallConfig: presetData.toolCallConfig
            ? {
                ...DEFAULT_TOOL_CALL_CONFIG,
                ...presetData.toolCallConfig,
                toolToggles: {
                  ...DEFAULT_TOOL_CALL_CONFIG.toolToggles,
                },
                autoApproveTools: {
                  ...DEFAULT_TOOL_CALL_CONFIG.autoApproveTools,
                },
              }
            : undefined,
          customId: id, // 显式指定 ID 保持内置预设稳定 ID
        }
      );

      if (!agentId) {
        // 极端竞态：并发释出时 customId 已被占用，视为已存在直接跳过
        logger.info(`内置基线子智能体已存在，跳过释出: ${id}`);
        continue;
      }

      // 内置预设若引用 /agent-presets/{id}/icon.jpg 等资源，这里完成本地物理化
      await agentStore.ensurePresetAssetsImported(agentId);
      logger.info(`内置基线子智能体已释出落盘并完成资产导入: ${id}`);
    } catch (error) {
      logger.error(`释出内置智能体失败: ${id}`, error as Error);
    }
  }
}

/**
 * 按需释出服务：并发调用共享同一进行中的释出 Promise；结束后重置，
 * 保证删除后下次调用可再次触发重置释出。
 */
export class SubAgentBaselineService {
  private materializationPromise: Promise<void> | null = null;

  public async ensureBaselineMaterialized(): Promise<void> {
    if (this.materializationPromise) return this.materializationPromise;

    this.materializationPromise = materializeBaselineAgents().finally(() => {
      this.materializationPromise = null;
    });
    return this.materializationPromise;
  }
}

export const subAgentBaselineService = new SubAgentBaselineService();
