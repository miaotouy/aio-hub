# Guided Flow 引导窗口 UI 体验打磨与步骤合并设计方案

> 状态：Implemented
>
> 记录日期：2026-07-27
>
> 目标版本：桌面端 `0.7.0-alpha.1`
>
> 文档定位：针对引导窗口（Guided Flow）的 UI 审美缺陷、步骤平铺冗余问题进行专项调查与重构设计。

---

## 1. 调查与问题诊断

### 1.1 引导窗口 Header 臃肿（AI 腔多行堆叠）

在 [`src/components/common/GuidedFlow/GuidedFlowShell.vue`](src/components/common/GuidedFlow/GuidedFlowShell.vue:66) 中，Header 的结构如下：

```vue
    <header class="guided-flow-header">
      <div class="header-copy">
        <p class="eyebrow">{{ runtime.definition.trigger }}</p>
        <h2>{{ runtime.definition.title }}</h2>
        <p v-if="runtime.definition.description" class="flow-description">
          {{ runtime.definition.description }}
        </p>
      </div>
      ...
```

**审美缺陷诊断**：

1. **多行堆叠**：Header 内部塞入了 `eyebrow` (触发源)、`h2` (主标题) 和 `flow-description` (流程描述)。当流程描述较长时，Header 占据了极大的垂直空间，导致内容区域被严重压缩。
2. **信息冗余**：`flow-description` 应该作为引导流程的“概览”或“前言”呈现在内容区（例如 `UpgradeSummaryStep`），而不是在每一个步骤中都作为 Header 强行挂载，这破坏了模态窗口的通透感与呼吸感。

### 1.2 步骤条（Stepper）两端对齐（毫无精致感）

在 [`src/components/common/GuidedFlow/GuidedFlowStepper.vue`](src/components/common/GuidedFlow/GuidedFlowStepper.vue:80) 中，步骤条的 CSS 布局如下：

```css
li {
  display: flex;
  min-width: 0;
  flex: 1 1 0; /* 强行平分宽度 */
  align-items: center;
  color: var(--text-color-secondary);
}
```

**审美缺陷诊断**：

1. **两端对齐拉伸**：由于 `flex: 1 1 0;`，步骤条会强行平分并撑满整个容器宽度。在宽屏下，点与点之间的连接线被拉得极长，毫无精致感。
2. **缺乏视觉聚拢**：优秀的步骤条设计应该是**水平居中聚拢**的。点与点之间通过固定或紧凑的连接线相连，只有当前激活的步骤展开标题，其余步骤仅保留精致的小点，从而在视觉上形成一条优雅的“点线”。

### 1.3 步骤平铺冗余（高风险操作缺乏物理聚合）

在 [`src/flows/knowledge-migration/knowledgeMigrationContribution.ts`](src/flows/knowledge-migration/knowledgeMigrationContribution.ts:59) 中，知识库迁移被拆分为了 3 个大步骤平铺在 Guided Flow 的 Stepper 中：

1. `plan` (迁移方案与确认)
2. `result` (迁移与校验)
3. `cleanup` (旧数据清理)

**架构与交互缺陷诊断**：

1. **步骤条过长**：如果将迁移的每一个子阶段（方案确认、执行校验、清理）都平铺为大步骤，会导致整个升级流程的步骤条变得极长（例如：版本概览 -> 迁移方案 -> 迁移执行 -> 清理 -> 完成，共 5 步），给用户带来极大的心理负担。
2. **不可逆操作缺乏内聚性**：数据迁移、清理等高风险操作是一个**不可逆的连续任务流**。它应该被物理聚合在**一个大步骤**内，由该步骤组件内部自己管理“检测/预览 -> 确认 -> 执行进度 -> 校验报告 -> 清理”的子状态与交互，在大框架中它只占一个“升级事项”步骤。

---

## 2. 改进设计方案

### 2.1 极简 Header 重构

我们将 Header 瘦身，移除 `eyebrow` 和 `flow-description`，仅保留最核心的 `title` 和关闭按钮。

**修改点**：

- 移除 `runtime.definition.trigger` (eyebrow) 和 `runtime.definition.description` (flow-description)。
- 将流程描述（`description`）移入 `UpgradeSummaryStep`（版本概览）的内容区中展示，保持 Header 的绝对清爽。

---

### 2.2 居中点线步骤条（Stepper）重构

我们将步骤条重构为**水平居中、紧凑聚拢**的精致点线。

**修改点**：

- `ol` 容器设为 `justify-content: center;`，使步骤条整体水平居中。
- `li` 设为 `flex: 0 0 auto;`，防止其强行平分宽度。
- `step-connector`（连接线）设为固定宽度（例如 `width: 32px; flex: 0 0 32px;`），使点与点之间保持紧凑的间距。
- 只有当前激活的步骤会展示 `step-title`，并且由于 `li` 是 `flex: 0 0 auto;`，它会自然地展开并容纳标题，而其他步骤只是一个小点，点与点之间通过 `32px` 的线连接。

---

### 2.3 知识库迁移步骤物理聚合（合并为一个大步骤）

我们将知识库迁移的 3 个步骤合并为**一个大步骤**：`MigrationStep`（旧知识库数据迁移）。

#### 2.3.1 内部子状态机设计

在 `MigrationStep.vue` 内部，我们通过一个 `subStep` 响应式变量来管理子状态：

- `plan`：展示迁移方案、备份提示与风险确认（合并原 `MigrationPlanStep`）。
- `executing`：展示迁移执行进度条（合并原 `MigrationExecuteStep`）。
- `verify`：展示结构化校验报告与清理选择（合并原 `MigrationVerifyStep` 与 `MigrationCleanupStep`）。

#### 2.3.2 底部按钮接管机制

为了让步骤内部的子状态切换更加自然，我们允许步骤组件**接管底部的操作按钮**：

- 当处于 `plan` 状态时，步骤组件内部提供“确认并开始迁移”按钮。点击后，触发迁移执行，并将 `subStep` 切换为 `executing`。
- 当处于 `executing` 状态时，禁用大框架的关闭与返回，步骤组件内部展示进度条。
- 当处于 `verify` 状态时，展示校验报告与清理选择。步骤自有操作区的“完成迁移事项”通过 `GuidedFlowStepControls` 请求大框架进入下一步；清理确认不完整时保持禁用。

这样，在大框架的步骤条中，知识库迁移只占一个点，极大地简化了用户的心智模型！

---

## 3. 实施计划与代码变更预览

### 3.1 `GuidedFlowStepper.vue` 样式重构

```css
ol {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: center; /* 居中对齐 */
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  min-width: 0;
  flex: 0 0 auto; /* 不平分宽度，自适应 */
  align-items: center;
  color: var(--text-color-secondary);
}

.step-connector {
  width: 32px; /* 固定连接线宽度 */
  height: 1px;
  flex: 0 0 32px;
  margin: 0 8px;
  background: var(--border-color);
}
```

### 3.2 `GuidedFlowShell.vue` Header 瘦身

```vue
<header class="guided-flow-header">
      <div class="header-copy">
        <h2>{{ runtime.definition.title }}</h2>
      </div>
      <el-button
        v-if="canRequestClose"
        class="close-button"
        text
        circle
        :aria-label="closeAriaLabel"
        @click="emit('requestClose')"
      >
        <el-icon><Close /></el-icon>
      </el-button>
    </header>
```

### 3.3 知识库迁移步骤合并

我们将重构 `src/flows/knowledge-migration/knowledgeMigrationContribution.ts`，将其 `steps` 缩减为单个步骤：

```ts
steps: [
  {
    id: "migration",
    title: "旧知识库数据迁移",
    description: "将旧文件目录中的 Recall 数据迁移到新的 SQLite 存储。",
    component: MigrationStep,
    footer: "step",
    validate: (context) => {
      const snapshot = getKnowledgeMigrationSnapshot(context);
      // 主数据必须完成；完整报告选择清理时还必须输入 DELETE。
      return canCompleteKnowledgeMigration(snapshot);
    },
    nextLabel: "完成迁移事项",
  },
];
```

同时，我们将新建 `MigrationStep.vue` 作为统一的容器组件，内部引入 `MigrationPlanStep.vue`、`MigrationExecuteStep.vue`、`MigrationVerifyStep.vue` 和 `MigrationCleanupStep.vue`，并通过内部状态机进行优雅的流转。

---

## 4. 方案审查结论与实施记录

### 4.1 审查结论

方案的视觉方向与步骤聚合方向成立，可以实施。审查时发现原方案中的“步骤组件接管底部按钮”和“执行期间禁止关闭”无法由现有 `GuidedFlowStepComponentProps` 直接实现：步骤组件原本只能读取上下文并触发上下文更新，无法复用 `GuidedFlowManager` 的 busy、错误记录与持久化能力。

为避免在通用 Shell 中硬编码知识库迁移状态，本次增加了两项通用能力：

- `GuidedFlowStep.footer: "step"`：允许步骤隐藏框架默认 Footer，并在步骤内容中提供自己的操作区。
- `runActiveStepAction()` 与 `GuidedFlowStepControls`：步骤内部的长任务仍通过 Manager 执行，统一获得 busy 状态、关闭锁定、错误记录和状态持久化。

同时修正了原方案预览代码中的一个安全边界：不能仅根据 `executionStatus === "partial"` 放行。只有迁移报告的 `mainStatus === "completed"` 时才允许完成迁移事项；向量部分未完成时仍保留为模块待处理事项。永久清理只在完整报告通过后开放，并继续要求输入 `DELETE`。

### 4.2 已实施内容

- `GuidedFlowShell.vue` 已移除 trigger eyebrow 与流程描述，仅保留标题和关闭按钮，并缩减 Header 高度。
- 升级流程描述已移入 `UpgradeOverviewStep.vue`，由 `UpgradeSummaryStep` 的内容区展示。
- `GuidedFlowStepper.vue` 已改为整体居中、固定连接线宽度、非激活步骤仅显示圆点。
- 知识库迁移 contribution revision 已升级为 `3`，外部步骤合并为单个 `migration` 步骤。
- 新增 `MigrationStep.vue`，内部管理“确认方案 → 执行迁移 → 校验与清理”子状态，并复用原有计划、进度、校验和清理组件。
- 迁移执行逻辑已移至 `knowledgeMigrationOperations.ts`，便于组件和单元测试共同复用。
- 已同步更新知识库迁移单元测试、Guided Flow Manager 测试和 Tauri E2E 步骤选择器。
