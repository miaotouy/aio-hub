# Skill Manager 工具调用重构方案

## 1. 现状回顾 (Current Situation)

目前 `skill-manager` 的工具调用架构采用的是“1+N”模式：
- **1个系统代理 (`SkillManagerProxy`)**: ID 为 `skill:system`，提供通用的 `skill_run_script`、`skill_read_file` 和 `skill_list_dir` 方法。
- **N个技能代理 (`SkillProxy`)**: 每个已安装且启用的 Skill 都会注册为一个独立的 `ToolRegistry`（ID 为 `skill:{name}`），仅提供一个 `activate` 方法。

## 2. 已知问题 (Known Issues)

1. **工具列表散乱**: 在 Agent 编辑器的工具列表中，用户会看到大量以 `skill:` 开头的独立工具，且每个工具只有一个 `activate` 方法，核心功能却在另一个 `skill:system` 工具里，体验割裂。
2. **上下文聚合度低**: 由于每个 Skill 是独立的 Registry，它们在生成的 System Prompt 中位置是不确定的（取决于 ID 排序），无法在逻辑上形成“技能簇”。
3. **管理冗余与残留**: 关闭 `skill-manager` 总开关虽然能移除工具，但这种散落的结构不利于在 Agent 级别进行精细化的方法级开关控制。
4. **背离设计初衷**: Skill 的设计初衷是轻量级的“能力包”，而不是完整的“工具”。过多的独立 Registry 增加了系统开销，且 `getExtraPromptContext` 的渐进式披露逻辑在当前架构下容易导致缓存利用率下降。

## 3. 改动方案 (Proposed Changes)

核心思路：**收拢 SkillProxy -> SkillManagerProxy**。将所有散落的 Skill 逻辑聚合到单一的系统管理模块下。

### 3.1. 架构调整
- **废弃 `SkillProxy.ts`**: 不再为每个 Skill 创建独立的 `ToolRegistry` 实例。
- **改造 `SkillBridgeFactory.ts`**: `createRegistries()` 仅返回单例的 `skillManagerProxy`。
- **强化 `SkillManagerProxy.ts`**:
    - **动态元数据**: 在 `getMetadata()` 中遍历 `skillManagerStore.enabledManifests`，为每个 Skill 动态生成 `activate_<name>` 方法。
    - **简介即描述**: Skill 的摘要介绍直接放入 `activate_<name>` 方法的 `description` 字段中，不再使用 `getExtraPromptContext`。
    - **动态调度**: 在 `SkillManagerProxy` 实例上动态挂载或统一调度这些 `activate_*` 方法。

### 3.2. 交互逻辑
- **“激活”即返回**: 调用 `activate_<name>` 方法后，工具直接返回该 Skill 的完整指令（`SKILL.md` 内容）。Agent 接收到返回内容后，即获得了操作该 Skill 的知识。
- **方法级开关**: 所有的 `activate_<name>` 方法都会出现在 Agent 编辑器的 `skill:system` (或 `skill-manager`) 模块下，用户可以利用已有的 `methodToggles` 功能精确控制哪些 Skill 对当前 Agent 可见。

## 4. 实施步骤 (Execution Steps)

1. **删除 `src/tools/skill-manager/services/SkillProxy.ts`**。
2. **修改 `src/tools/skill-manager/services/SkillBridgeFactory.ts`**:
    - 移除 `SkillProxy` 引用。
    - 简化 `createRegistries` 逻辑，仅返回 `skillManagerProxy`。
3. **修改 `src/tools/skill-manager/services/SkillManagerProxy.ts`**:
    - 实现动态 `getMetadata`。
    - 实现 `activate_<name>` 的动态处理逻辑。
    - 整合原 `SkillProxy` 的 `buildFullContext` 逻辑到激活方法中。
4. **验证**:
    - 检查 Agent 编辑器中的工具列表显示。
    - 验证 `activate_<name>` 的调用和结果返回。
    - 验证总开关和方法级开关的联动效果。

## 5. 预期效果 (Expected Results)

- **清爽的 UI**: 所有 Skill 能力聚合在一个卡片下。
- **高效的上下文**: Skill 简介和方法在 Prompt 中物理聚合，提高模型理解效率。
- **极简的管理**: 关掉管理器总开关，所有 Skill 瞬间消失；通过方法开关，可精细控制单个 Skill 的可见性。