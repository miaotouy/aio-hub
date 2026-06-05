# 预设消息组 (Preset Message Groups) 施工级设计与实施方案

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

在 [`src/tools/llm-chat/types/agent.ts`](src/tools/llm-chat/types/agent.ts) 中新增：

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

在 [`src/tools/llm-chat/types/message.ts`](src/tools/llm-chat/types/message.ts) 的 `ChatMessageNode` 接口中新增 `groupId` 字段：

```typescript
export interface ChatMessageNode {
  // ... 现有字段
  /** 所属预设消息组 ID，可选。无此字段则为独立消息 */
  groupId?: string;
}
```

同时在 `ChatMessageNode['metadata']` 中扩展 `lastEnabledState` 字段，用于状态记忆：

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

在 [`src/tools/llm-chat/types/agent.ts`](src/tools/llm-chat/types/agent.ts) 的 `AgentBaseConfig` 接口中新增 `presetGroups` 字段：

```typescript
export interface AgentBaseConfig {
  // ... 现有字段
  /** 预设消息组定义 */
  presetGroups?: PresetMessageGroup[];
}
```

---

## 3. 核心联动逻辑实现 (伪代码与细节)

所有联动逻辑均收拢在 [`src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue`](src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue) 中。

### 3.1. 基础计算属性与辅助函数

```typescript
// 1. 双向绑定父组件传入的 presetGroups (即 props.agent.presetGroups)
const presetGroups = computed<PresetMessageGroup[]>({
  get: () => props.agent?.presetGroups || [],
  set: (val) => {
    if (props.agent) {
      props.agent.presetGroups = val;
    }
  },
});

// 2. 获取指定消息所属的组定义
const getMessageGroup = (groupId?: string): PresetMessageGroup | undefined => {
  if (!groupId) return undefined;
  return presetGroups.value.find((g) => g.id === groupId);
};
```

### 3.2. 组开关联动 (`handleToggleGroupEnabled`)

当切换组的 `enabled` 状态时，批量翻转组内消息的 `isEnabled` 并记忆状态：

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

### 3.3. 单选 (Radio) 组互斥联动 (`handleRadioChange` 与 `handleToggleEnabled`)

**设计原则**：约束由 UI 控件层承载，而非在回调中反向拦截数据。

- 单选组的消息卡片渲染 `el-radio`（见 4.3 节），`el-radio` 的交互特性天然保证"点击已选中项不会取消选中"，即不可能出现全不选的状态。
- `handleToggleEnabled` 挂载在 `el-switch` 的 `@change` 上，单选组根本不渲染 `el-switch`，因此该函数**永远不会被单选组消息触发**，无需在其中做任何 radio 模式的拦截逻辑。

```typescript
// 1. el-radio 的 @change 回调：点选某条消息，组内其他消息互斥关闭
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

// 2. el-switch 的 @change 回调：仅多选组或独立消息会触发此函数
const handleToggleEnabled = (_msg: ChatMessageNode) => {
  // 单选组渲染 el-radio 而非 el-switch，不会走到这里
  // 此处只需同步状态，无需任何组模式判断
  syncToParent();
};
```

### 3.4. 删除组逻辑 (`handleDeleteGroup`)

删除组时，弹窗让用户选择是“仅解散组”还是“彻底删除组及组内消息”：

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
        lockScroll: false, // 遵循 AGENTS.md 规范，防止 Tauri 窗口抖动
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
        }
      });
    syncToParent();
  } catch (e) {
    // 取消或关闭
  }
};
```

---

## 4. UI 交互与布局设计

### 4.1. 预设组控制面板

在 `AgentPresetEditor.vue` 的头部操作栏下方，消息列表上方，新增一个可折叠的面板：

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

在消息卡片的 `role-tags` 区域（正常模式和紧凑模式均适用）：

```html
<!-- 组标签下拉菜单 -->
<el-dropdown
  v-if="element.groupId"
  trigger="click"
  @command="(cmd) => handleGroupTagCommand(element, cmd)"
>
  <el-tag size="small" class="group-tag-clickable" style="cursor: pointer;">
    🏷️ {{ getMessageGroup(element.groupId)?.name || '未知组' }}
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

<!-- 如果没有组，显示一个轻量的“加入组”按钮 -->
<el-dropdown
  v-else
  trigger="click"
  @command="(cmd) => handleGroupTagCommand(element, cmd)"
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

### 4.3. 消息卡片的选择控件自适应

在消息卡片右侧的操作区域，根据组的选择模式自适应渲染：

```html
<!-- 如果是单选组且启用，显示 el-radio -->
<el-radio
  v-if="getMessageGroup(element.groupId)?.selectionMode === 'radio' && getMessageGroup(element.groupId)?.enabled"
  :value="true"
  :model-value="element.isEnabled"
  size="small"
  @change="handleRadioChange(element)"
/>
<!-- 否则显示 el-switch -->
<el-switch
  v-else
  v-model="element.isEnabled"
  :active-value="true"
  :inactive-value="false"
  size="small"
  :disabled="getMessageGroup(element.groupId)?.enabled === false"
  @change="handleToggleEnabled(element)"
/>
```

---

## 5. 导入与导出适配

### 5.1. 导出格式（v2）

导出时，将扁平消息列表和组定义打包成一个 v2 格式的对象：

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

在 `handleFileSelected` 和 `handlePaste` 中，兼容新旧格式：

```typescript
let importedData: any;
// ... 解析出 importedData ...

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
    syncToParent();
    customMessage.success("导入成功");
  } else {
    customMessage.error("不支持的预设格式版本");
  }
} else if (Array.isArray(importedData)) {
  // v1 格式（纯数组）
  const processed = importedData.map((m) => ({
    ...m,
    content:
      typeof m.content === "string" ? convertMacros(m.content) : m.content,
  }));
  localMessages.value = [
    ...localMessages.value.filter((m) => isAnchorType(m.type)),
    ...processed,
  ];
  syncToParent();
  customMessage.success("导入成功");
}
```

---
