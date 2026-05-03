# Test Skill 参考指南

此文档是 `test-skill` 的补充参考资料，用于验证 `skill_read_file` 功能。

## 关于 AIO Skill 系统

AIO 的 Skill 系统采用 [Agent Skills 规范](https://agentskills.io)，主要特性：

- **渐进式披露**：未激活时仅展示摘要，激活后注入完整指令
- **安全脚本执行**：所有脚本运行在沙箱中，路径锁定在 Skill 目录内
- **多运行时支持**：支持 Bun、Node.js、Python、Bash、PowerShell 脚本
- **热加载**：安装/卸载 Skill 后自动刷新工具列表

### 文件访问示例

```text
skill:system.skill_read_file(skill_id="test-skill", path="SKILL.md")
skill:system.skill_read_file(skill_id="test-skill", path="references/guide.md")
skill:system.skill_read_file(skill_id="test-skill", path="assets/template.json")
```

---

*此文件用于验证参考文档读取功能。*