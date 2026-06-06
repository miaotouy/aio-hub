# 预设消息组 (Preset Message Groups) 施工级设计与实施方案

> **状态**: Approved — 待实施 (已通过架构审查与边界修正)
> **最后对齐**: 2026-06-06，基于组件行数优化后的现有架构

## 1. 背景与设计哲学

在 `llm-chat` 模块中，智能体（Agent）的预设消息（`presetMessages`）是构建对话上下文的基础。为支持更复杂的角色扮演（RP）和场景切换需求，引入"预设消息组"的概念。

### 1.1. 物理嵌套视图的缺陷

若采用类似文件夹的"物理嵌套视图"（消息必须物理上塞进组的 DOM 容器中），会带来以下问题：

1. **上下文装配冲突**：在 RP 场景中，一个"说话风格组"通常包含最前部的 `System` 提示词和后部的数个 `Few-shot` 示例对话。强行物理嵌套会破坏 LLM 上下文的经典结构。
2. **拖拽排序复杂**：跨组拖拽、组整体拖拽在 `VueDraggable` 中易产生 Bug，且与分页器冲突。
3. **数据与视图不一致**：数据结构上消息是扁平的（通过 `groupId` 关联），强行嵌套视图会导致大量转换开销。

### 1.2. 解耦控制面板方案

保持消息列表 **100% 扁平**。消息物理上不相邻，但通过 `groupId` 字段关联到同一个组。在编辑器顶部提供一个**独立的"预设组控制面板"**，用于统一管理组的开关、单选/多选模式。消息卡片上仅展示精致的"组标签"和选择状态。

这种设计实现了**物理位置的自由度**与**逻辑控制的聚合度**的统一。

---

## 2. 数据结构扩展

### 2.1. 预设消息组类型 (`PresetMessageGroup`)

在 [`src/tools/llm-chat/types/agent.ts`](src/tools/llm-chat/types/agent.ts) 中新增（当前文件中**尚无此类型**）：

```typescript
export type PresetGroupSelectionMode = "checkbox" | "radio";

export interface PresetMessageGroup {
  /** 组的唯一标识符 (UUID 或时间戳随机数) */
  id: string;
  /** 组显示名称，如 "说话风格"、"当前场景" */
  name: string;
  /** 组描述（可选） */
  description?: string;
  /**
   * 选择模式
   * - checkbox: 多选，组内消息独立启用/禁用（默认）
   * - radio: 单选，组内同时最多只能有一条消息启用
   */
  selectionMode: PresetGroupSelectionMode;
  /**
   * 组整体开关
   * - true（默认）: 组启用，组内消息根据各自的 isEnabled 参与上下文
   * - false: 组禁用，组内所有消息不参与上下文构建（无视各自的 isEnabled）
   */
  enabled: boolean;
}
```

### 2.2. 消息节点扩展 (`ChatMessageNode`)

在 [`src/tools/llm-chat/types/message.ts`](src/tools/llm-chat/types/message.ts) 的 `ChatMessageNode` 接口（第81行）中新增 `groupId` 字段（**当前尚无此字段**）：

```typescript
export interface ChatMessageNode {
  // ... 现有字段
  /** 所属预设消息组 ID，可选。无此字段则为独立消息 */
  groupId?: string;
}
```

同时在 `ChatMessageNode['metadata']`（第183行）中扩展 `lastEnabledState` 字段，用于状态记忆（**当前尚无此字段**）：

```typescript
export interface ChatMessageNode {
  // ...
  metadata?: {
    // ... 现有字段
    /** 组禁用前，消息原本的启用状态 */
    lastEnabledState?: boolean;
  };
}
```

### 2.3. 智能体配置扩展 (`AgentBaseConfig`)

In [`src/tools/llm-chat/types/agent.ts`](src/tools/llm-chat/types/agent.ts) 的 `AgentBaseConfig` 接口（第323行）中新增 `presetGroups` 字段（**当前尚无此字段**）：

```typescript
export interface AgentBaseConfig {
  // ... 现有字段
  /** 预设消息组定义 */
  presetGroups?: PresetMessageGroup[];
}
```

> ⚠️ **重要初始化规范**：
> 为避免 Vue 3 响应式丢失陷阱，在 [`PersonalitySection.vue`](src/tools/llm-chat/components/agent/agent-editor/sections/PersonalitySection.vue) 的初始化逻辑中，**必须**强制初始化 `presetGroups` 字段：
>
> ```typescript
> if (!editForm.presetGroups) {
>   editForm.presetGroups = [];
> }
> ```

---

## 3. 核心联动逻辑实现

### 架构说明（当前代码现状）

[`AgentPresetEditor.vue`](src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue) 已完成行数优化，部分逻辑已拆分：

- Token 计算 → [`usePresetTokenCalculator.ts`](src/tools/llm-chat/components/agent/assets/usePresetTokenCalculator.ts)
- 导入导出 → [`usePresetImportExport.ts`](src/tools/llm-chat/components/agent/assets/usePresetImportExport.ts)

**实施分工**：

- 组联动逻辑（本节 3.1~3.4）：直接在 `AgentPresetEditor.vue` 中实现，与模板强耦合，不抽取为 composable
- 导入导出 v2 格式适配（第5节）：在 `usePresetImportExport.ts` 中实现，需同步扩展其函数签名

### 3.1. 基础计算属性与辅助函数

> 注意：当前 `props.agent`（第269行）是弱类型 `{ [key: string]: any } | null`，可直接通过 `props.agent?.presetGroups` 访问。

```typescript
// 双向绑定父组件传入的 presetGroups (即 props.agent.presetGroups)
const presetGroups = computed<PresetMessageGroup[]>({
  get: () => props.agent?.presetGroups || [],
  set: (val) => {
    if (props.agent) {
      props.agent.presetGroups = val;
    }
  },
});

// 获取指定消息所属的组定义
const getMessageGroup = (groupId?: string): PresetMessageGroup | undefined => {
  if (!groupId) return undefined;
  return presetGroups.value.find((g) => g.id === groupId);
};
```

### 3.2. 组开关联动 (`handleToggleGroupEnabled`)

当切换组的 `enabled` 状态时，批量翻转组内消息的 `isEnabled` 并记忆状态。

> 当前 `handleToggleEnabled()`（第545行）极简，只调用 `syncToParent()`，本函数是新增 of 组级操作，与之并列存在。

```typescript
const handleToggleGroupEnabled = (group: PresetMessageGroup) => {
  const isEnabled = group.enabled;

  localMessages.value.forEach((msg) => {
    if (msg.groupId === group.id) {
      if (!isEnabled) {
        // 禁用组：若消息当前处于启用状态，则设为禁用，并在 metadata 中记录期望状态
        if (msg.isEnabled !== false) {
          msg.isEnabled = false;
          if (!msg.metadata) msg.metadata = {};
          msg.metadata.lastEnabledState = true;
        }
      } else {
        // 启用组：若消息记录了期望状态，则恢复启用，并清除标记
        if (msg.metadata?.lastEnabledState === true) {
          msg.isEnabled = true;
          delete msg.metadata.lastEnabledState;
        }
      }
    }
  });

  syncToParent();
};
```

### 3.3. 单选 (Radio) 组互斥联动 (`handleRadioChange`)

**设计原则**：约束由 UI 控件层承载，而非在回调中反向拦截数据。

- 单选组的消息卡片渲染 `el-radio`（见 4.3 节），`el-radio` 的交互特性天然保证"点击已选中项不会取消选中"，即不可能出现全不选的状态。
- 现有的 `handleToggleEnabled()`（第545行）挂载在 `el-switch` 的 `@toggle-enabled` 事件上，单选组根本不渲染 `el-switch`，因此该函数**永远不会被单选组消息触发**，无需修改，保持不变。

```typescript
// el-radio 的 @change 回调：点选某条消息，组内其他消息互斥关闭
const handleRadioChange = (targetMsg: ChatMessageNode) => {
  const group = getMessageGroup(targetMsg.groupId);
  if (!group || group.selectionMode !== "radio") return;

  localMessages.value.forEach((msg) => {
    if (msg.groupId === targetMsg.groupId) {
      if (msg.id === targetMsg.id) {
        msg.isEnabled = true;
        if (msg.metadata) delete msg.metadata.lastEnabledState;
      } else {
        msg.isEnabled = false;
        if (msg.metadata) delete msg.metadata.lastEnabledState;
      }
    }
  });

  syncToParent();
};
```

> `handleRadioChange` 需要从 `AgentPresetEditor` 作为 prop 传给 `PresetMessageCard`（见 §4.2）。

### 3.4. 删除组逻辑 (`handleDeleteGroup`)

删除组时，弹窗让用户选择是"仅解散组"还是"彻底删除组及组内消息"：

```typescript
const handleDeleteGroup = async (group: PresetMessageGroup) => {
  try {
    await ElMessageBox.confirm(
      h("div", null, [
        h("p", null, `确定要删除预设组 "${group.name}" 吗？`),
        h(
          "p",
          {
            style:
              "color: var(--el-color-danger); margin-top: 8px; font-size: 12px;",
          },
          "注意：此操作不可撤销。"
        ),
      ]),
      "删除预设组",
      {
        confirmButtonText: "仅解散组",
        cancelButtonText: "彻底删除组及消息",
        distinguishCancelAndClose: true,
        type: "warning",
        lockScroll: false,
      }
    )
      .then(() => {
        // 仅解散组：保留消息，清除 groupId
        localMessages.value.forEach((msg) => {
          if (msg.groupId === group.id) {
            msg.groupId = undefined;
            if (msg.metadata) {
              delete msg.metadata.lastEnabledState;
            }
          }
        });
        presetGroups.value = presetGroups.value.filter(
          (g) => g.id !== group.id
        );
        customMessage.success("已解散预设组");
      })
      .catch((action) => {
        if (action === "cancel") {
          // 彻底删除：删除组及组内所有消息
          localMessages.value = localMessages.value.filter(
            (msg) => msg.groupId !== group.id
          );
          presetGroups.value = presetGroups.value.filter(
            (g) => g.id !== group.id
          );
          customMessage.success("已彻底删除组及组内消息");
        } // action === 'close'：用户点 X，不做任何操作
      });
    syncToParent();
  } catch {
    // 兜底：非预期异常
  }
};
```

### 3.5. 消息组归属操作 (`handleGroupCommand`)

此函数在 `AgentPresetEditor.vue` 中实现，响应 `PresetMessageCard` 抛出的 `group-command` 事件（见 §4.2）。

```typescript
const handleGroupCommand = (msg: ChatMessageNode, cmd: string) => {
  if (cmd === "leave") {
    msg.groupId = undefined;
    if (msg.metadata) delete msg.metadata.lastEnabledState;
    syncToParent();
  } else if (cmd.startsWith("move:")) {
    const targetGroupId = cmd.slice(5);
    msg.groupId = targetGroupId;

    const targetGroup = getMessageGroup(targetGroupId);

    // 边界修正：若移入一个已被禁用的组，强制将消息设为禁用并记录 lastEnabledState
    if (targetGroup && !targetGroup.enabled) {
      if (msg.isEnabled !== false) {
        msg.isEnabled = false;
        if (!msg.metadata) msg.metadata = {};
        msg.metadata.lastEnabledState = true;
      }
    }

    // 移入单选组时，确保该组内只有此消息启用
    if (targetGroup?.selectionMode === "radio") {
      handleRadioChange(msg);
    } else {
      syncToParent();
    }
  } else if (cmd === "new") {
    // 新建组并加入：先弹对话框让用户输入组名
    handleCreateGroupAndJoin(msg);
  }
};

const handleCreateGroupAndJoin = async (msg: ChatMessageNode) => {
  try {
    const { value: groupName } = await ElMessageBox.prompt(
      "请输入新建组的名称",
      "新建预设消息组",
      {
        confirmButtonText: "创建",
        cancelButtonText: "取消",
        inputPlaceholder: "如：说话风格、当前场景",
        inputValidator: (v) => !!v?.trim() || "组名不能为空",
        lockScroll: false,
      }
    );
    const newGroup: PresetMessageGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: groupName.trim(),
      selectionMode: "checkbox",
      enabled: true,
    };
    presetGroups.value = [...presetGroups.value, newGroup];
    msg.groupId = newGroup.id;
    syncToParent();
    customMessage.success(`已创建组"${newGroup.name}"并加入`);
  } catch {
    // 用户取消
  }
};
```

---

## 4. UI 交互与布局设计

### 4.1. 预设组控制面板

在 [`AgentPresetEditor.vue`](src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue) 的头部操作栏（第4~107行）下方，消息列表上方，新增一个可折叠的面板：

```html
<div class="preset-groups-panel">
  <div class="panel-header" @click="isGroupsCollapsed = !isGroupsCollapsed">
    <div class="panel-title">
      <el-icon :class="{ 'is-collapsed': isGroupsCollapsed }"
        ><ArrowDown
      /></el-icon>
      <span>预设消息组管理 ({{ presetGroups.length }})</span>
    </div>
    <el-button type="primary" size="small" @click.stop="handleCreateGroup">
      <el-icon><Plus /></el-icon> 新建组
    </el-button>
  </div>

  <el-collapse-transition>
    <div v-show="!isGroupsCollapsed" class="groups-list">
      <div
        v-for="group in presetGroups"
        :key="group.id"
        class="group-item"
        :class="{ disabled: !group.enabled }"
      >
        <div class="group-info">
          <span class="group-name">{{ group.name }}</span>
          <el-tag
            size="small"
            :type="group.selectionMode === 'radio' ? 'warning' : 'info'"
          >
            {{ group.selectionMode === 'radio' ? '单选' : '多选' }}
          </el-tag>
          <span v-if="group.description" class="group-desc"
            >{{ group.description }}</span
          >
        </div>
        <div class="group-actions">
          <el-switch
            v-model="group.enabled"
            size="small"
            @change="handleToggleGroupEnabled(group)"
          />
          <el-button link size="small" @click="handleEditGroup(group)"
            ><el-icon><Edit /></el-icon
          ></el-button>
          <el-button
            link
            size="small"
            type="danger"
            @click="handleDeleteGroup(group)"
            ><el-icon><Delete /></el-icon
          ></el-button>
        </div>
      </div>
    </div>
  </el-collapse-transition>
</div>
```

### 4.2. 消息卡片中的组标签与下拉菜单

**`PresetMessageCard` 新增 Props 与 Emits**：

> ⚠️ **鲁棒性设计**：为兼容不传组定义的紧凑调用场景，`presetGroups` 和 `onRadioChange` 必须设为**可选属性**并提供默认值。

```typescript
interface Props {
  // ... 现有字段
  presetGroups?: PresetMessageGroup[]; // 设为可选
  onRadioChange?: (msg: ChatMessageNode) => void; // 设为可选
}

interface Emits {
  // ... 现有事件
  (e: "group-command", msg: ChatMessageNode, cmd: string): void;
}
```

`AgentPresetEditor.vue` 中的 `<PresetMessageCard>` 绑定（当前第143行）需同步添加：

```html
<PresetMessageCard
  ...
  :preset-groups="presetGroups"
  :on-radio-change="handleRadioChange"
  @group-command="handleGroupCommand"
/>
```

> **注意**：同时需要将 `element.groupId` 加入第132行的 `v-memo` 数组，否则分配/移除组时卡片不会重新渲染：
>
> ```ts
> v-memo="[element.isEnabled, element.content, element.role, element.name,
>           element.injectionStrategy, element.modelMatch,
>           messageTokens.get(element.id), element.groupId, presetGroups]"
> ```

在消息卡片的 `role-tags` 区域（当前 [`PresetMessageCard.vue`](src/tools/llm-chat/components/agent/assets/PresetMessageCard.vue) 第135行的 `.role-tags` div 内）添加：

```html
<!-- 组标签下拉菜单 -->
<el-dropdown
  v-if="element.groupId"
  trigger="click"
  @command="(cmd) => $emit('group-command', element, cmd)"
>
  <el-tag size="small" class="group-tag-clickable" style="cursor: pointer;"
    >🏷️ {{ getMessageGroup(element.groupId)?.name || '未知组' }}
  </el-tag>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item
        v-for="g in presetGroups"
        :key="g.id"
        :command="`move:${g.id}`"
        :disabled="g.id === element.groupId"
      >
        移动到: {{ g.name }}
      </el-dropdown-item>
      <el-dropdown-item divided command="leave">脱离当前组</el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>

<!-- 如果没有组，显示一个轻量的"加入组"按钮 -->
<el-dropdown
  v-else-if="presetGroups.length > 0 || true"
  trigger="click"
  @command="(cmd) => $emit('group-command', element, cmd)"
>
  <el-tag
    size="small"
    type="info"
    class="group-tag-add"
    style="cursor: pointer; opacity: 0.6;"
  >
    + 加入组
  </el-tag>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item
        v-for="g in presetGroups"
        :key="g.id"
        :command="`move:${g.id}`"
      >
        加入: {{ g.name }}
      </el-dropdown-item>
      <el-dropdown-item divided command="new">新建组并加入</el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```

> **注意**：根据 AGENTS.md 规范，`el-dropdown` 内嵌 `el-tooltip` 时需要包裹 `<div>`。此处组标签本身是 `el-tag` 作为触发器，不涉及该问题。

同时在 `PresetMessageCard` 中新增 `getMessageGroup` 辅助函数（依赖传入的 `presetGroups` prop）：

```typescript
const getMessageGroup = (groupId?: string): PresetMessageGroup | undefined => {
  if (!groupId) return undefined;
  return props.presetGroups.find((g) => g.id === groupId);
};
```

### 4.3. 消息卡片的选择控件自适应

在 [`PresetMessageCard.vue`](src/tools/llm-chat/components/agent/assets/PresetMessageCard.vue) 的正常模式操作区域（当前第249行，`el-switch`）和紧凑模式操作区域（当前第111行）替换为自适应逻辑：

> ⚠️ **视觉一致性修正**：单选组在禁用时，不应退化为 `el-switch`，而应保持 `el-radio` 且设为 `disabled`。

```html
<!-- 如果是单选组，显示 el-radio -->
<el-radio
  v-if="getMessageGroup(element.groupId)?.selectionMode === 'radio'"
  :value="true"
  :model-value="element.isEnabled"
  size="small"
  :disabled="getMessageGroup(element.groupId)?.enabled === false"
  @change="onRadioChange ? onRadioChange(element) : null"
/>
<!-- 否则显示 el-switch -->
<el-switch
  v-else
  v-model="element.isEnabled"
  :active-value="true"
  :inactive-value="false"
  size="small"
  :disabled="getMessageGroup(element.groupId)?.enabled === false"
  @change="$emit('toggle-enabled')"
/>
```

---

## 5. 导入与导出适配

### 实施位置

导入导出逻辑在 [`usePresetImportExport.ts`](src/tools/llm-chat/components/agent/assets/usePresetImportExport.ts) 中，需要：

1. **扩展函数签名**，新增 `presetGroups: Ref<PresetMessageGroup[]>` 参数：```typescript
   export function usePresetImportExport(options: {
   localMessages: Ref<ChatMessageNode[]>;
   presetGroups: Ref<PresetMessageGroup[]>; // 新增
   agentName: Ref<string>;
   onSyncToParent: () => void;
   importFileInput: Ref<HTMLInputElement | null>;
   });

   ```

   `AgentPresetEditor.vue` 调用处（第375行）同步传入 `presetGroups`。

   ```

2. **更新 `cleanMessagesForExport`**（当前第38行），导出时包装为 v2 格式（含 `groups`）。

3. **更新 `handlePaste`**（当前第86行），当前第101行强制校验数组，需改为兼容 v2 对象格式。

4. **更新 `handleFileSelected`**（当前第143行），在 `Array.isArray(parsed)` 分支前插入 v2 格式判断。

### 5.1. 导出格式（v2）

`cleanMessagesForExport` 更新为返回 v2 对象（调用方 `handleExport` 和 `handleCopy` 直接使用）：

```json
{
  "version": 2,
  "groups": [
    {
      "id": "style-group",
      "name": "说话风格",
      "selectionMode": "radio",
      "enabled": true
    }
  ],
  "messages": [
    {
      "id": "msg-1",
      "role": "system",
      "content": "傲娇语气...",
      "isEnabled": true,
      "groupId": "style-group"
    }
  ]
}
```

### 5.2. 导入与粘贴兼容逻辑

在 `handleFileSelected` 和 `handlePaste` 中，兼容新旧格式（替换当前的 `Array.isArray` 判断逻辑）：

> ⚠️ **边界修正**：导入旧版 v1 格式（纯数组）时，必须主动清空现有的 `presetGroups`，避免残留无用的组定义。

```typescript
// 辅助函数：处理导入数据（v1/v2 兼容）
function applyImportedData(importedData: any) {
  if (
    importedData &&
    typeof importedData === "object" &&
    !Array.isArray(importedData)
  ) {
    // v2 格式
    if (importedData.version === 2) {
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
      onSyncToParent();
      customMessage.success("导入成功");
    } else {
      customMessage.error("不支持的预设格式版本");
    }
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
    // 边界修正：清空现有的组，避免残留不一致的组定义
    presetGroups.value = [];
    onSyncToParent();
    customMessage.success("导入成功");
  }
}
```

> `handlePaste` 中需移除当前第101行的 `if (!Array.isArray(imported)) return ...` 硬校验，改为调用 `applyImportedData`。`handleFileSelected` 中在 `isPromptFile` 判断之后、`Array.isArray` 之前插入 v2 对象分支，或统一调用 `applyImportedData`。

---

## 6. 模块化重构与交互体验优化方案 (2026-06-06 追加)

为解决上一版实现中"组面板臃肿、无法直观管理组内消息、创建组无法选择单选/多选模式、消息编辑器遗漏组归属"等体验缺陷，进行以下模块化重构：

### 6.1. 架构重构与组件拆分

1. **`PresetGroupEditDialog.vue` (新增)**：
   - 专门负责创建和编辑预设消息组的弹窗。
   - 支持编辑：组名称、组描述、选择模式（单选 `radio` / 多选 `checkbox`）、启用状态。
   - 彻底解决"创建组时无法选择单选/多选模式"的问题。

2. **`PresetGroupPanel.vue` (新增)**：
   - 从 `AgentPresetEditor.vue` 中剥离出来的独立组管理器面板。
   - **折叠面板交互**：每个组作为一个可展开的卡片，点击组名可展开查看组内包含哪些消息。
   - **组内消息直观管理**：
     - 展开后，列出当前属于该组的所有消息（显示角色、名称/内容缩略、启用状态）。
     - 提供快捷开关（如果是单选组，切换时自动互斥）。
     - 提供"移出组"的快捷按钮。
     - **快捷加入组**：在展开的组底部，显示一个下拉选择器，列出所有**未归属**的消息，点击即可快速将现有消息加入该组。

3. **`PresetMessageEditor.vue` (修改)**：
   - 接收 `presetGroups` 作为 Prop。
   - 在"名称"输入行下方，新增"所属预设组"选择行（使用 `el-select`，支持选择已有组，或选择"无/独立消息"）。
   - 在表单保存时，将 `groupId` 字段同步回传。

4. **`AgentPresetEditor.vue` (修改)**：
   - 彻底删除原有的 `preset-groups-panel` 标签和相关样式，大幅缩减文件体积。
   - 引入并挂载 `<PresetGroupPanel>`，将 `presetGroups` 和 `localMessages` 传给它，并监听其同步事件。
   - 在打开 `PresetMessageEditor` 时，将当前消息的 `groupId` 传入，并在保存时正确更新。

### 6.2. 详细接口设计

#### 6.2.1. `PresetGroupEditDialog.vue` 接口

```typescript
interface Props {
  visible: boolean;
  group?: PresetMessageGroup | null; // 若为 null 则为新建模式
}

interface Emits {
  (e: "update:visible", visible: boolean): void;
  (e: "save", group: PresetMessageGroup): void;
}
```

#### 6.2.2. `PresetGroupPanel.vue` 接口

```typescript
interface Props {
  presetGroups: PresetMessageGroup[];
  localMessages: ChatMessageNode[];
}

interface Emits {
  (e: "update:presetGroups", groups: PresetMessageGroup[]): void;
  (e: "update:localMessages", messages: ChatMessageNode[]): void;
  (e: "sync"): void; // 触发父组件同步
}
```

#### 6.2.3. `PresetMessageEditor.vue` 扩展

```typescript
interface MessageForm {
  role: MessageRole;
  name?: string;
  content: string;
  groupId?: string; // 新增
  injectionStrategy?: InjectionStrategy;
  modelMatch?: {
    enabled: boolean;
    mode?: "any" | "all";
    exclude?: boolean;
    patterns: string[];
    profilePatterns?: string[];
    matchProfileName?: boolean;
  };
}

interface Props {
  // ... 现有字段
  presetGroups?: PresetMessageGroup[]; // 新增
}
```

### 6.3. 状态迁移说明

现有 `AgentPresetEditor.vue` 中的组相关状态和数据需要在拆分后重新分配：

| 状态/函数                  | 迁移目标                      | 说明                         |
| -------------------------- | ----------------------------- | ---------------------------- |
| `isGroupsCollapsed`        | 保留在 `AgentPresetEditor`    | 控制整个面板折叠             |
| `handleCreateGroup`        | 改用 `PresetGroupEditDialog`  | 弹窗创建                     |
| `handleEditGroup`          | 改用 `PresetGroupEditDialog`  | 弹窗编辑                     |
| `handleDeleteGroup`        | 迁移到 `PresetGroupPanel`     | 组内管理                     |
| `handleGroupCommand`       | 保留在 `AgentPresetEditor`    | 响应消息卡片的组事件         |
| `handleRadioChange`        | 保留在 `AgentPresetEditor`    | 需要访问全部 `localMessages` |
| `handleToggleGroupEnabled` | 迁移到 `PresetGroupPanel`     | UI 直接联动                  |
| `getMessageGroup`          | 保留在 `AgentPresetEditor`    | 多个组件共用                 |
| 组面板 DOM                 | 全部移动到 `PresetGroupPanel` | 独立渲染                     |
