# 技能系统集成 (Skill System Integration)

系统通过 `skill-manager` 模块引入了对 Agent Skills 规范的支持，将外部 Skill 包作为一种特殊的工具能力注入到对话中。

## 1. 渐进式披露 (Progressive Disclosure)

遵循 [Agent Skills 规范](https://agentskills.io/llms.txt)。初始仅向 LLM 展示 Skill 的摘要（通过 `activate_<name>` 方法描述），只有当模型决定调用该 Skill 时，才会返回完整的 `SKILL.md` 指令、资源索引和宿主环境信息。

## 2. 工具桥接

`SkillManagerProxy` 充当了 Skill 能力与 `tool-calling` 系统之间的桥梁，动态生成工具定义并处理脚本执行请求。

## 3. `skill_read_file` 资源感知工具

模型可以通过通用工具按需读取 Skill 目录内的具体文档或代码，实现深度的上下文感知。

- **工具定义注册位置**: 在 [`SkillManagerProxy.getMetadata()`](../../../skill-manager/services/SkillManagerProxy.ts:63) 中静态注册到 `methods` 数组，工具 ID 隶属于 `id: "skill:system"` 这个全局 `ToolRegistry`；参数为 `skill_id` + `path` 两个必填 string，返回 `Promise<string>` 文本内容。
- **安全约束（路径白名单）**: **前端代码层无显式路径白名单校验**——`SkillManagerProxy` 仅做参数透传，所有路径合法性由底层 Rust 命令 `read_skill_resource` 把关（依赖 Tauri 文件系统沙箱与 Skill 目录的物理隔离）。如需在前端加强校验，可在 [`SkillService.readResource()`](../../../skill-manager/services/SkillService.ts) 内增加路径前缀检查。
- **二进制 / 大文件处理**: **当前实现没有专门的二进制识别与大文件分段策略**——所有读取请求都直接调用 Rust 命令读取整个文件内容；二进制文件（如图片、音频）通常返回空字符串或乱码，需要 LLM 自行避免请求；超大文本文件可能造成响应延迟，建议工具描述明确"仅适用于文本类资源"。
- **与 `agent-asset://` 协议的边界**: 两者**作用域完全独立**——`skill_read_file` 读取 **Skill 目录内的文档/代码**（位于 `{appConfigDir}/skill-manager/skills/{skill_id}/...`），主要供模型理解 Skill 用法；`agent-asset://` 协议读取 **Agent 私有的媒体资产**（位于 `{appConfigDir}/llm-chat/agents/{agent_id}/assets/...`，详见 [`agent-assets.md`](./agent-assets.md)），主要供消息内联渲染。两者不共享路径、不共享权限、不互相暴露。
