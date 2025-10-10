# cherry studio 渠道配置页架构调查报告

## 📁 核心文件结构

### 页面组件
- [`index.tsx`](src/renderer/src/pages/settings/ProviderSettings/index.tsx:1) - 渠道列表主页面
- [`ProviderSetting.tsx`](src/renderer/src/pages/settings/ProviderSettings/ProviderSetting.tsx:1) - 单个渠道配置页
- [`ModelList.tsx`](src/renderer/src/pages/settings/ProviderSettings/ModelList.tsx:1) - 模型列表组件
- [`AddProviderPopup.tsx`](src/renderer/src/pages/settings/ProviderSettings/AddProviderPopup.tsx:1) - 添加渠道弹窗

### 数据层
- [`store/llm.ts`](src/renderer/src/store/llm.ts:1) - Redux状态管理（54个预设Provider）
- [`hooks/useProvider.ts`](src/renderer/src/hooks/useProvider.ts:1) - Provider操作hooks
- [`config/providers.ts`](src/renderer/src/config/providers.ts:1) - Provider元数据配置

### 类型定义
- [`types/index.ts`](src/renderer/src/types/index.ts:157) - Provider数据结构

## 🏗️ 数据结构

```typescript
Provider {
  id: string                    // 唯一标识
  type: ProviderType           // openai | anthropic | gemini | azure-openai | vertexai | mistral
  name: string                 // 显示名称
  apiKey: string              // API密钥（支持多个，逗号分隔）
  apiHost: string             // API地址
  apiVersion?: string         // API版本（Azure）
  models: Model[]             // 模型列表
  enabled: boolean            // 是否启用
  isSystem: boolean           // 是否系统预设
  isAuthed?: boolean          // OAuth认证状态
  extra_headers?: {}          // 自定义请求头
  isNotSupportArrayContent?: boolean
}
```

## 🎨 UI组件结构

```
ProvidersList (主容器)
├── 左侧面板
│   ├── 搜索框（支持按Provider和Model搜索）
│   ├── Provider列表（可拖拽排序）
│   │   ├── Logo + 名称 + ON/OFF标签
│   │   └── 右键菜单（编辑/备注/删除）
│   └── 添加按钮
└── 右侧面板 - ProviderSetting
    ├── Provider标题 + 启用开关
    ├── OAuth认证（部分Provider）
    ├── API Key配置 + 连通性检查
    ├── API Host配置 + 重置按钮
    ├── API Version（Azure）
    └── 模型列表 - ModelList
        ├── 按Group分组折叠
        ├── 模型健康检查
        └── 管理/添加按钮
```

## ⚙️ 核心功能

### 1. Provider管理
- ✅ 添加自定义Provider（支持5种类型）
- ✅ 编辑Provider（名称/类型/Logo）
- ✅ 删除Provider（系统预设不可删）
- ✅ 拖拽排序
- ✅ 启用/禁用切换
- ✅ 自定义Logo上传（支持压缩）

### 2. API配置
- ✅ API Key管理（支持多Key，逗号分隔）
- ✅ API Key列表管理弹窗
- ✅ API Host配置（支持重置为默认）
- ✅ 自定义Headers配置
- ✅ 单Key连通性检查
- ✅ 批量健康检查（支持并发/串行）

### 3. 模型管理
- ✅ 按Group分组展示
- ✅ 添加/删除模型
- ✅ 编辑模型参数
- ✅ 批量管理模型
- ✅ 健康检查（显示延迟/状态）
- ✅ 搜索过滤

### 4. 特殊Provider支持
- ✅ OAuth认证（Silicon/AiHubMix/PPIO/TokenFlux）
- ✅ LM Studio配置
- ✅ GPUStack配置
- ✅ VertexAI服务账号配置
- ✅ Github Copilot认证
- ✅ Azure OpenAI版本配置

### 5. URL Schema集成
- ✅ 支持从URL导入API Key
- ✅ Base64解码参数
- ✅ 自动添加/更新Provider

## 📊 预设Provider统计

共54个系统预设Provider，包括：
- 🇨🇳 国内：Silicon、DeepSeek、智谱、月之暗面、百川、阿里云等20+
- 🌍 国外：OpenAI、Anthropic、Gemini、Azure、Groq等20+
- 🏠 本地：Ollama、LM Studio、GPUStack、New API

## 🔧 技术要点

1. **状态管理**：Redux Toolkit管理Provider状态
2. **拖拽排序**：使用`@hello-pangea/dnd`
3. **Logo存储**：IndexedDB存储自定义Logo
4. **健康检查**：支持并发/串行模式，显示延迟和多Key结果
5. **国际化**：完整的i18n支持
6. **主题适配**：支持亮色/暗色主题

## 🎯 关键交互流程

### 添加Provider
1. 点击添加按钮 → AddProviderPopup
2. 输入名称、选择类型、上传Logo
3. 创建Provider对象 → 添加到Store
4. 跳转到新Provider配置页

### API连通性检查
1. 点击检查按钮 → SelectProviderModelPopup选择模型
2. 调用checkApi → 发送测试请求
3. 显示成功/失败状态 + 错误信息

### 健康检查
1. 点击健康图标 → HealthCheckPopup配置参数
2. 遍历所有模型 → 并发/串行调用
3. 实时更新每个模型的状态、延迟、多Key结果
4. 显示汇总统计

这是一个功能完整、架构清晰的渠道配置系统，支持多Provider、多模型、多API Key的灵活管理。


# 渠道配置页 UI 布局设计文档

## 🎨 整体布局架构

### 双栏式布局 (Two-Column Layout)
```
┌────────────────────────────────────────────────────────────┐
│                       Navbar (导航栏)                        │
├─────────────────────┬──────────────────────────────────────┤
│   Provider List     │      Provider Setting Panel          │
│   (左侧列表)        │      (右侧配置面板)                   │
│   固定宽度          │      自适应宽度                       │
│   可滚动            │      可滚动                           │
│                     │                                      │
│   [搜索框]          │   ╔═══════════════════════════════╗  │
│   ┌─────────────┐   │   ║ Provider Name        [ON/OFF] ║  │
│   │ 🔵 Silicon  │   │   ╚═══════════════════════════════╝  │
│   │    [ON]     │   │   ─────────────────────────────────  │
│   ├─────────────┤   │   API Key: [****************] [✓]   │
│   │ 🟢 OpenAI   │◄──┼── API Host: [https://...]  [Reset] │
│   │             │   │   ─────────────────────────────────  │
│   ├─────────────┤   │   Models:                            │
│   │ ⚪ Gemini   │   │   ┌──────────────────────────────┐   │
│   │             │   │   │ 📂 GPT-4 Family          [-] │   │
│   │ ...         │   │   │   • gpt-4o [🟢 0.8s] [⚡] [-]│   │
│   └─────────────┘   │   │   • gpt-4-turbo          │   │
│   [➕ 添加]          │   └──────────────────────────────┘   │
└─────────────────────┴──────────────────────────────────────┘
```

---

## 📋 左侧：Provider 列表面板

### 布局结构
```typescript
<ProviderListContainer>  // Styled Component
  height: calc(100vh - var(--navbar-height))
  width: calc(var(--settings-width) + 10px)  // 固定宽度
  border-right: 0.5px solid var(--color-border)
  
  ├── <AddButtonWrapper> (顶部搜索)
  │   height: 50px
  │   padding: 10px 8px
  │   └── <Input>
  │       - 搜索图标后缀
  │       - 圆角: var(--list-item-border-radius)
  │       - 高度: 35px
  │       - 支持ESC清空
  │
  ├── <Scrollbar> (可滚动区域)
  │   flex: 1
  │   └── <ProviderList>
  │       padding: 8px
  │       └── <DragDropContext> (拖拽容器)
  │           └── <Droppable>
  │               └── <Draggable> × N (每个Provider)
  │                   └── <ProviderListItem>
  │                       - 拖拽手柄
  │                       - 右键菜单
  │
  └── <AddButtonWrapper> (底部按钮)
      height: 50px
      └── <Button> 添加Provider
```

### Provider列表项设计
```typescript
<ProviderListItem className={active ? 'active' : ''}>
  display: flex
  flex-direction: row
  align-items: center
  padding: 5px 10px
  border-radius: var(--list-item-border-radius)
  transition: all 0.2s ease-in-out
  
  ├── <ProviderLogo>  // Avatar组件
  │   size: 25px
  │   shape: circle (系统) | square (自定义)
  │   border: 0.5px solid var(--color-border)
  │
  ├── <ProviderItemName>
  │   margin-left: 10px
  │   font-weight: 500
  │   text-nowrap
  │
  └── <Tag> (条件渲染)
      color: green
      border-radius: 16px
      margin-left: auto
      内容: "ON"
```

### 交互状态
- **默认**: 透明背景
- **悬停**: `background: var(--color-background-soft)`
- **激活**: 
  - `background: var(--color-background-soft)`
  - `border: 0.5px solid var(--color-border)`
  - `font-weight: bold`
- **拖拽中**: `cursor: grab`

### 右键菜单
```
┌─────────────────────┐
│ ✏️ 编辑             │ (仅自定义Provider)
│ 📝 备注             │ (所有Provider)
│ 🗑️ 删除 (危险)     │ (非预设Provider)
└─────────────────────┘
```

---

## 🎛️ 右侧：Provider 配置面板

### 面板结构
```typescript
<SettingContainer>
  height: calc(100vh - var(--navbar-height))
  padding: 20px
  padding-bottom: 75px
  overflow-y: scroll
  background: var(--color-background) | transparent
  
  ├── ╔═══════════════════════════════════╗
  │   ║ <SettingTitle>                   ║
  │   ║   Provider Name [🔗] [⚙️]  [ON/OFF] ║
  │   ╚═══════════════════════════════════╝
  │
  ├── <Divider> margin: 10px 0
  │
  ├── [条件组件]
  │   ├── <ProviderOAuth> (OAuth认证)
  │   ├── <OpenAIAlert> (OpenAI提示)
  │   ├── <DMXAPISettings> (DMXAPI设置)
  │   ├── <VertexAISettings> (VertexAI设置)
  │   ├── <LMStudioSettings> (LMStudio设置)
  │   ├── <GPUStackSettings> (GPUStack设置)
  │   └── <GithubCopilotSettings> (Copilot设置)
  │
  ├── ─────────────────────
  │   <SettingSubtitle> API Key [⚙️]
  │   ├── <Space.Compact>
  │   │   ├── <Input.Password>
  │   │   │   - prefix: 错误指示器
  │   │   │   - 防抖更新: 150ms
  │   │   └── <Button> 检查连通性
  │   │       状态: 默认 | 加载 | 成功(绿色✓) | 错误
  │   └── <SettingHelpTextRow>
  │       获取API Key链接 | 提示文本
  │
  ├── ─────────────────────
  │   <SettingSubtitle> API Host [⚙️]
  │   ├── <Space.Compact>
  │   │   ├── <Input>
  │   │   │   - onBlur更新
  │   │   └── <Button danger> 重置 (条件显示)
  │   └── <SettingHelpTextRow>
  │       预览URL | 提示文本
  │
  ├── ─────────────────────
  │   [Azure OpenAI]
  │   <SettingSubtitle> API Version
  │   └── <Input> placeholder="2024-xx-xx-preview"
  │
  └── ─────────────────────
      <SettingSubtitle> Models
      ├── <ModelListSearchBar> (条件显示)
      ├── <Button> 健康检查图标 (动画)
      └── <ModelList> 模型列表
```

### 标题栏布局
```typescript
<SettingTitle>
  display: flex
  justify-content: space-between
  align-items: center
  
  ├── <Flex gap={5}>
  │   ├── <ProviderName>
  │   │   font-size: 14px
  │   │   font-weight: 500
  │   ├── <Link> 官网图标 (条件)
  │   │   icon: <SquareArrowOutUpRight size={14} />
  │   └── <Button> 高级设置 (自定义Provider)
  │       icon: <Settings2 size={14} />
  │
  └── <Switch>
      启用/禁用切换
      - 启用时自动移到列表顶部
```

### API Key 输入组
```typescript
<Space.Compact>
  width: 100%
  margin-top: 5px
  
  ├── <Input.Password>
  │   - 实时防抖更新 (150ms)
  │   - 自动聚焦 (当启用且无Key时)
  │   - prefix: 连通性错误指示器
  │   - spellCheck: false
  │
  └── <Button>
      type: primary (成功) | default
      ghost: true (成功时)
      disabled: !apiHost || checking
      
      图标状态:
      - 检查中: <LoadingOutlined spin />
      - 成功: <CheckOutlined /> (绿色)
      - 默认: "检查"文本
```

---

## 📦 模型列表组件

### 整体结构
```typescript
<ModelList>
  ├── <Flex gap={12} vertical>
  │   └── <CustomCollapseWrapper> × N (每个Group)
  │       └── <CustomCollapse>
  │           defaultActiveKey: i <= 5 ? ['1'] : []
  │           
  │           ├── label: <Flex>
  │           │   └── Group名称 (加粗)
  │           │
  │           ├── extra: <Button>
  │           │   icon: <MinusOutlined />
  │           │   tooltip: "删除整组"
  │           │   className: "toolbar-item" (hover显示)
  │           │
  │           └── content:
  │               └── <Flex gap={10} vertical>
  │                   └── <ListItem> × N (每个Model)
  │
  ├── <SettingHelpTextRow> (条件)
  │   文档链接 | 模型列表链接
  │
  └── <Flex gap={10}>
      ├── <Button type="primary"> 管理
      │   icon: <ListCheck />
      └── <Button> 添加
          icon: <PlusOutlined />
```

### 模型列表项布局
```typescript
<ListItem>
  display: flex
  align-items: center
  gap: 10px
  font-size: 14px
  
  ├── <HStack> (左侧，flex: 1)
  │   ├── <Avatar>
  │   │   src: getModelLogo(model.id)
  │   │   size: 26×26
  │   │   fallback: 首字母大写
  │   │
  │   └── <ModelIdWithTags>
  │       - model.name
  │       - model.type标签
  │       - overflow: hidden
  │
  └── <Flex gap={4}> (右侧操作)
      ├── <ModelLatencyText> (条件)
      │   font-size: 12px
      │   color: secondary
      │   内容: "0.8s" 格式
      │
      ├── <StatusIndicator> (条件)
      │   状态图标:
      │   - checking: <LoadingOutlined spin />
      │   - success: <CheckCircleFilled /> (绿色)
      │   - error: <CloseCircleFilled /> (红色)
      │   - partial: <ExclamationCircleFilled /> (黄色)
      │   + Tooltip详情
      │
      ├── <Button> 编辑参数
      │   icon: <Bolt size={16} />
      │   disabled: checking
      │
      └── <Button> 删除
          icon: <MinusOutlined />
          disabled: checking
```

### 折叠组动画
```scss
.toolbar-item {
  opacity: 0;
  transition: opacity 0.2s;
}

&:hover .toolbar-item {
  opacity: 1;
}
```

---

## 🪟 弹窗组件设计

### 1. AddProviderPopup (添加Provider)
```
┌─────────────────────────────────────────┐
│  添加Provider                     [×]    │
├─────────────────────────────────────────┤
│                                         │
│           ┌─────────────┐               │
│           │  [Logo预览]  │ ← 点击上传    │
│           │   60×60     │               │
│           └─────────────┘               │
│                                         │
│  名称: [___________________________]   │
│                                         │
│  类型: [OpenAI ▼]                      │
│       - OpenAI                          │
│       - OpenAI-Response                 │
│       - Gemini                          │
│       - Anthropic                       │
│       - Azure OpenAI                    │
│                                         │
├─────────────────────────────────────────┤
│                      [取消]  [确定]      │
└─────────────────────────────────────────┘
```

**布局特点**:
- 居中显示: `centered: true`
- 宽度: 360px
- Logo: 60×60px，圆角12px
- 支持拖放上传
- 自动压缩图片 (GIF除外)

### 2. ApiKeyListPopup (API Key管理)
```
┌──────────────────────────────────────────────┐
│  Provider Name - API Key管理          [×]    │
├──────────────────────────────────────────────┤
│  API Keys列表:                               │
│  ┌────────────────────────────────────────┐  │
│  │ sk-xxxxx...xxxxx  [🟢检查] [❌删除]    │  │
│  │ sk-yyyyy...yyyyy  [⚪未检] [❌删除]    │  │
│  │ sk-zzzzz...zzzzz  [🔴失败] [❌删除]    │  │
│  └────────────────────────────────────────┘  │
│  [➕ 添加新Key]                              │
│                                              │
│  批量操作:                                   │
│  [全部检查] [删除失败] [导出]               │
├──────────────────────────────────────────────┤
│                             [关闭]            │
└──────────────────────────────────────────────┘
```

### 3. HealthCheckPopup (健康检查配置)
```
┌──────────────────────────────────────────┐
│  模型健康检查                      [×]    │
├──────────────────────────────────────────┤
│  检查模式:                               │
│  ○ 并发检查 (快速，消耗配额多)          │
│  ● 串行检查 (慢速，节省配额)            │
│                                          │
│  API Keys: (选择要测试的Keys)           │
│  ☑ sk-xxxxx...xxxxx                     │
│  ☑ sk-yyyyy...yyyyy                     │
│  ☐ sk-zzzzz...zzzzz                     │
│                                          │
│  预计耗时: ~30秒                        │
│  消耗配额: ~0.001美元                   │
├──────────────────────────────────────────┤
│                      [取消]  [开始检查]  │
└──────────────────────────────────────────┘
```

### 4. ModelEditContent (模型参数编辑)
```
┌────────────────────────────────────────────┐
│  编辑模型 - gpt-4o                   [×]   │
├────────────────────────────────────────────┤
│  基础信息:                                 │
│  模型ID:   [gpt-4o]                        │
│  显示名称: [GPT-4 Optimized]               │
│  分组:     [GPT-4 Family]                  │
│                                            │
│  定价信息:                                 │
│  输入价格: [5.00] 美元/百万tokens          │
│  输出价格: [15.00] 美元/百万tokens         │
│                                            │
│  模型类型:                                 │
│  ☑ text  ☑ vision  ☐ embedding            │
│  ☑ reasoning  ☑ function_calling          │
│                                            │
│  端点类型:                                 │
│  ● openai  ○ anthropic  ○ gemini          │
├────────────────────────────────────────────┤
│                      [取消]  [保存]        │
└────────────────────────────────────────────┘
```

---

## 🎨 设计规范

### 颜色系统
```css
/* 主题变量 */
--color-background: 背景色
--color-background-soft: 柔和背景
--color-background-mute: 静音背景
--color-border: 边框色
--color-text: 主文本色
--color-text-1: 一级文本
--color-text-2: 二级文本
--color-text-3: 三级文本

/* 状态颜色 */
--color-status-success: 成功 (绿色)
--color-status-error: 错误 (红色)
--color-status-warning: 警告 (黄色)
--color-primary-outline: 主色调轮廓
```

### 尺寸系统
```css
/* 圆角 */
--list-item-border-radius: 列表项圆角

/* 高度 */
--navbar-height: 导航栏高度

/* 宽度 */
--settings-width: 设置面板宽度 (左侧列表)
```

### 字体规范
```css
/* 标题 */
font-size: 14px
font-weight: bold

/* 副标题 */
font-size: 14px
font-weight: bold
color: var(--color-text-1)

/* 正文 */
font-size: 14px
font-weight: 500

/* 辅助文本 */
font-size: 11-12px
opacity: 0.4

/* 代码字体 */
font-family: 'Monaco', 'Menlo', 'Consolas', monospace
```

### 间距系统
```css
/* 外边距 */
margin: 5px, 10px, 15px, 20px

/* 内边距 */
padding: 5px, 8px, 10px, 16px, 20px

/* 间隙 */
gap: 4px, 5px, 8px, 10px, 12px
```

---

## 🎭 交互设计

### 过渡动画
```css
/* 通用过渡 */
transition: all 0.2s ease-in-out

/* 透明度过渡 */
transition: opacity 0.2s

/* 变换过渡 */
transform: translateZ(0)
will-change: opacity
```

### 悬停效果
- Provider列表项: 背景变浅
- 按钮: 颜色加深
- 工具栏项: 淡入淡出 (opacity: 0 → 1)

### 激活状态
- 列表项: 加粗 + 边框 + 背景
- 开关: 颜色变化 + 动画
- 按钮: Ghost样式 (成功时)

---

## 📱 响应式设计

### 固定元素
- 左侧列表宽度: `calc(var(--settings-width) + 10px)`
- 高度: `calc(100vh - var(--navbar-height))`

### 滚动区域
- Provider列表: 独立滚动
- 配置面板: 独立滚动
- 隐藏滚动条: `::-webkit-scrollbar { display: none }`

### 自适应
- 右侧面板: `flex: 1` 自适应宽度
- 文本溢出: `text-nowrap` + `overflow: hidden`

---

## 🔧 特殊功能

### 拖拽排序
- 库: `@hello-pangea/dnd`
- 视觉反馈: `cursor: grab`
- 禁用条件: 搜索激活时

### 搜索过滤
- 实时过滤: Provider名称 + 模型名称
- 快捷键: ESC清空
- 拖拽禁用: 搜索时不可拖拽

### 防抖更新
- API Key: 150ms防抖
- 避免频繁状态更新

### 状态管理
- Redux存储: Provider状态
- IndexedDB: 自定义Logo
- 本地状态: UI交互状态

---

这是一个层次清晰、交互流畅、功能完整的渠道配置UI系统，采用现代化的双栏布局、卡片式设计和直观的操作流程。