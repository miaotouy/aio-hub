# 智能OCR工具 (Smart OCR) - 设计文档

## 1. 概述

### 1.1. 项目目标

开发一款集成在AIOTools中的OCR文字识别工具，支持多种识别引擎（本地/云端/VLM），能够高效识别图片中的文字内容。为了更好地处理超长截图场景，工具提供了智能切图的辅助功能，可自动检测空白区域并切割长图，从而提升识别效率和准确率。

### 1.2. 核心功能

- **多引擎OCR识别**:
  - 内置基于`Tesseract.js`的**本地离线OCR引擎**。
  - 支持集成**传统云端OCR服务**（如白描）。
  - 支持通过**通用API端点**接入各类**视觉语言模型 (VLM)**，如本地部署的Ollama模型 (Qwen-VL, Llama3.2-vision) 或商业模型 (Gemini, GPT-4o)。
- **智能切图辅助功能**:
  - 自动检测并基于无文本的空白横带对长截图进行切割。
  - 用户可选择是否启用，也可设置长宽比阈值自动触发。
  - 有助于提升长截图的识别效率和准确率。
- **可视化操作**: 在UI上清晰地展示切割线、切割后的图片块以及实时的OCR结果。
- **灵活配置**: 用户可以管理和保存多个自定义VLM服务的配置（API端点、模型、密钥等）。

## 2. 功能设计

### 2.1. OCR识别流程

1. **图像输入**: 用户上传图片或截图。
2. **预处理判断**: 检查是否需要启用智能切图（基于用户设置和图片长宽比）。
3. **OCR执行**:
   - 若不需要切图，直接对整图进行OCR识别。
   - 若需要切图，先执行智能切图算法，再对每个图片块进行OCR识别。
4. **结果汇总**: 收集所有识别结果并展示给用户。

### 2.2. 智能切图算法（辅助功能）

采用基于**水平投影**的空白区域检测算法。

1.  **图像预处理**:
    - **主题检测**: 通过检测图像四角的平均亮度，判断是亮色主题（白底黑字）还是暗色主题（黑底白字）。
    - **智能二值化**: 根据主题检测结果，将图像转换为统一的“白底黑字”二值化图，消除主题颜色对后续步骤的干扰。
2.  **水平投影**:
    - 沿Y轴方向，计算二值化图中**每一行**的黑色像素点数量，生成一个一维直方图。
3.  **寻找切割点**:
    - 在直方图中寻找连续的、值低于预设**空白阈值**的区域。
    - 当一个低值区域的连续行数超过预设的**最小行高**时，将其视为一个有效的“空白横带”。
    - 取该横带的中线作为切割点。
4.  **图像切割**:
    - 根据所有找到的切割点，将原始彩色图像切割成多个子图片块。

### 2.3. 切图触发条件

- 在执行切图算法前，会检查用户是否启用了智能切图，以及图片的长宽比是否超过了设定的阈值。
- 只有满足条件时，才会执行切图流程；否则，将整张图直接送入OCR引擎进行识别。

## 3. 技术方案

### 3.1. 前端 (Vue 3 + TypeScript + Vite)

- **图像处理**: 使用原生的**Canvas API**进行图像加载、像素级操作（主题检测、二值化、投影计算）和切割。不引入额外的图像处理库。
- **UI框架**: **Element Plus**，用于快速构建高质量的UI界面。
- **状态管理**: 使用Vue 3的Composition API (`ref`, `reactive`) 进行组件内的状态管理。
- **模块化**:
  - 业务逻辑将被拆分到`composables`目录下的hooks中 (e.g., `useImageSlicer.ts`, `useOcrRunner.ts`)。
  - UI界面将被拆分为多个独立的子组件 (`ControlPanel.vue`, `PreviewPanel.vue`, `ResultPanel.vue`)。

### 3.2. OCR引擎

- **本地引擎**: **Tesseract.js**，实现离线识别能力。中文语言包将存放于`public`目录。
- **云端引擎**:
  - 通过**`@tauri-apps/plugin-http`**发送网络请求，以绕过浏览器CORS限制。
  - 设计一个可插拔的**OCR引擎管理器 (`OCREngineManager.ts`)**，用于统一管理和调用不同的OCR服务。
  - 实现一个**`GenericVLMEngine`**类，用于处理所有符合OpenAI Vision API格式的VLM服务。

### 3.3. 配置与数据存储

- **`@tauri-apps/plugin-store`**: 用于持久化存储用户的API配置（如VLM服务的端点、密钥等），数据将保存在用户本地的应用数据目录中。

## 4. UI/UX 设计

### 4.1. 布局

采用**三栏式布局**:

- **左栏 (ControlPanel.vue)**: 配置与控制区。包括图片上传、OCR引擎选择、API设置入口、算法参数调整（开关、阈值滑块等）和操作按钮。
- **中栏 (PreviewPanel.vue)**: 图像预览区。用于显示原始上传图片、算法计算出的切割线以及切割后的图片块列表。
- **右栏 (ResultPanel.vue)**: OCR结果展示区。实时显示每个图片块的识别进度和结果，并提供复制功能。

### 4.2. 交互流程

1.  用户上传图片。
2.  图片显示在中栏预览区，用户在左侧选择OCR引擎并进行相关配置。
3.  点击"开始识别"。
4.  若启用了智能切图，应用会在中栏可视化显示切割线和切割结果；否则直接处理整图。
5.  应用调用选定的OCR引擎，并在右栏实时更新识别结果。
6.  用户在右栏查看和复制识别出的文本内容。

## 5. 实现计划

### Phase 1: 核心功能搭建 (MVP)
- 搭建新工具页面和基础的三栏UI布局。
- 集成`Tesseract.js`本地OCR引擎。
- 实现基础的图片上传和OCR识别功能。

### Phase 2: 智能切图辅助功能
- 实现完整的智能切图算法逻辑。
- 在UI上可视化展示切割线和切割结果。
- 支持对切图后的图片块进行批量OCR识别。

### Phase 3: 通用VLM与云端API支持
- 实现`OCREngineManager`和`GenericVLMEngine`。
- 创建VLM配置管理界面，并使用`plugin-store`进行数据持久化。
- 实现动态加载和调用用户自定义的VLM服务。

### Phase 4: 优化与完善
- 将UI拆分为独立的子组件。
- 将业务逻辑抽离到`composables`。
- 完善UI细节，如加载状态、进度条、错误提示等。

---

## 6. LLM API 配置系统设计

### 6.1. 设计目标

创建一个**通用的 LLM API 配置中心**，作为全局模块供所有需要 LLM/VLM 服务的工具使用。该系统采用基于模板的设计思想（参考 `api-tester` 的 presets 机制），实现高度的灵活性和可扩展性。

**核心原则**：
- **配置复用**：一次配置，多处使用，避免在不同工具中重复填写 API 凭证。
- **关注点分离**：配置管理与具体工具解耦，工具只需关心"使用"而非"管理"。
- **模板化设计**：通过预设模板定义请求结构，用户只需填写变量值（如 API Key、Base URL）。
- **通用性**：命名和设计与任何特定工具（OCR/Vision）无关，支持所有类型的 LLM 服务（聊天、视觉、通用）。

### 6.2. 核心概念

#### 6.2.1. LLM API 模板 (`LlmApiTemplate`)

**定义**：应用内置的预设模板，定义了调用某类 LLM 服务的完整请求结构。

**用途分类** (`category`)：
- `'vision'`：用于视觉任务（VLM），如图像识别、OCR。Body 模板包含 `{{imageBase64}}` 和 `{{prompt}}` 占位符。
- `'chat'`：用于文本对话任务。Body 模板包含 `{{messages}}` 或 `{{userInput}}` 占位符。
- `'general'`：用于其他通用 LLM API。

**存储位置**：`src/config/llm-api-templates.ts`（应用内置，不可由用户修改）

#### 6.2.2. LLM 配置档案 (`LlmProfile`)

**定义**：用户基于某个模板创建的具体配置实例，包含了该模板所需变量的实际值（API Key、Base URL 等）以及可用模型列表。

**存储位置**：用户本地（localStorage 或 `@tauri-apps/plugin-store`）

### 6.3. 数据结构定义

#### 6.3.1. 模板相关类型

```typescript
// src/config/llm-api-templates.ts

/**
 * 模板变量定义
 */
export interface TemplateVariable {
  key: string;              // 变量键名，如 'apiKey', 'baseUrl'
  label: string;            // 显示标签，如 'API Key', 'Base URL'
  type: 'string' | 'password' | 'enum';
  defaultValue?: string;
  options?: string[];       // 当 type 为 'enum' 时可用
  required?: boolean;
  placeholder?: string;
  description?: string;
}

/**
 * LLM API 模板
 */
export interface LlmApiTemplate {
  id: string;               // 模板唯一标识，如 'openai-vision-compatible'
  name: string;             // 显示名称，如 'OpenAI-Compatible Vision API'
  category: 'vision' | 'chat' | 'general';  // 模板分类
  
  // 请求构建信息
  urlTemplate: string;      // URL 模板，如 '{{protocol}}://{{baseUrl}}/v1/chat/completions'
  method: 'POST';
  headers: Record<string, string>;  // Header 模板，如 { 'Content-Type': 'application/json' }
  bodyTemplate: string;     // JSON Body 模板字符串，包含占位符
  
  // 用户需填写的变量
  variables: TemplateVariable[];
}
```

**Body 模板示例** (OpenAI-Compatible Vision):
```json
{
  "model": "{{model}}",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "{{prompt}}" },
        { 
          "type": "image_url", 
          "image_url": { 
            "url": "data:image/jpeg;base64,{{imageBase64}}" 
          } 
        }
      ]
    }
  ],
  "max_tokens": 2000
}
```

#### 6.3.2. 用户配置类型

```typescript
// src/types/llm-profiles.ts

/**
 * 模型信息
 */
export interface LlmModelInfo {
  id: string;       // 模型ID，用于 API 请求，如 'gpt-4o', 'llava'
  name: string;     // 显示名称，如 'GPT-4o', 'LLaVA 1.5'
}

/**
 * LLM 配置档案
 */
export interface LlmProfile {
  id: string;                           // 配置实例的唯一ID (uuid)
  name: string;                         // 用户自定义名称，如 "我的本地 Ollama"
  templateId: string;                   // 关联的模板ID
  
  variableValues: Record<string, string>;  // 用户为模板变量填写的值
  // 例如: { apiKey: "sk-xxx", baseUrl: "api.openai.com", protocol: "https" }
  
  models: LlmModelInfo[];               // 该配置下可用的模型列表
}
```

### 6.4. 交互设计

#### 6.4.1. 全局设置页面 (Settings.vue)

新增一个 **"LLM 服务配置"** 卡片或标签页。

**主界面**：
- 展示所有已创建的 `LlmProfile` 列表
- 每个列表项显示：自定义名称、模板名称、模型数量
- 操作按钮：编辑、删除
- 底部按钮：**"添加 LLM 服务"**

**添加/编辑弹窗**：

1. **选择模板** (第一步)
   - 下拉框，列出所有可用的 `LlmApiTemplate`
   - 显示模板名称和分类标签（如 `[Vision]`, `[Chat]`）

2. **填写配置** (第二步)
   - **自定义名称**：文本输入框
   - **模板变量**：根据所选模板的 `variables` 动态生成表单
     - `type: 'string'` → 文本输入框
     - `type: 'password'` → 密码输入框
     - `type: 'enum'` → 下拉选择框

3. **管理模型** (第三步)
   - 动态列表，每行包含：
     - **模型ID**：文本输入框（如 `gpt-4o`）
     - **显示名称**：文本输入框（如 `GPT-4o`）
     - **删除按钮**
   - **添加模型**按钮

4. **保存/取消**按钮

#### 6.4.2. Smart OCR 工具页面 (ControlPanel.vue)

**引擎选择器改造**：

```
OCR引擎:
├── [本地引擎]
│   └── Tesseract.js
│
└── [VLM 引擎]
    ├── [我的 OpenAI] - GPT-4o
    ├── [我的本地 Ollama] - LLaVA
    └── [公司代理] - Gemini 2.0 Flash
```

**数据来源**：
- 从全局配置中心读取所有 `LlmProfile`
- 筛选出基于 `category: 'vision'` 模板的配置
- 遍历每个配置的 `models` 数组，生成选项
- 选项文本格式：`[配置名称] - 模型显示名称`

**选中后的数据结构** (扩展后的 `OcrEngineConfig`):
```typescript
// src/tools/smart-ocr/types.ts

export type OcrEngineConfig = 
  | {
      type: 'tesseract';
      name: string;
      language: string;
    }
  | {
      type: 'vlm';
      name: string;          // 显示名称，如 "[我的 OpenAI] - GPT-4o"
      profileId: string;     // 对应 LlmProfile 的 id
      modelId: string;       // 对应 LlmModelInfo 的 id
    };
```

### 6.5. 架构关系图

```mermaid
graph TD
    subgraph 应用内置预设
        T[LlmApiTemplate[]]
        T1[Vision 模板组]
        T2[Chat 模板组]
        T --> T1
        T --> T2
    end

    subgraph 全局设置页面
        A[LlmProfileSettings.vue]
        A -->|读取模板列表| T
        A -->|创建/编辑/删除| B[LlmProfile 列表]
        B -->|持久化| C{LlmProfileStore}
    end

    subgraph 本地存储
        C --> D([localStorage/Tauri Store])
    end

    subgraph Smart OCR 工具
        E[ControlPanel.vue]
        E -->|请求 category='vision' 的配置| C
        E -->|生成引擎选项| F[引擎下拉框]
        F -->|用户选择| G(engineConfig 状态)
    end

    subgraph OCR 执行流程
        H[useOcrRunner.ts]
        H -->|获取 Profile| C
        H -->|获取 Template| T
        H -->|构建请求| I{发送 VLM 请求}
        G --> H
    end

    style T fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    style C fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style D fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
```

### 6.6. 技术实现要点

#### 6.6.1. 配置管理 Composable

创建 `src/composables/useLlmProfiles.ts`，封装所有配置相关操作：

```typescript
export function useLlmProfiles() {
  const profiles = ref<LlmProfile[]>([]);
  
  // 加载配置
  const loadProfiles = async () => { /* ... */ };
  
  // 保存配置
  const saveProfile = async (profile: LlmProfile) => { /* ... */ };
  
  // 删除配置
  const deleteProfile = async (id: string) => { /* ... */ };
  
  // 根据分类筛选配置
  const getProfilesByCategory = (category: string) => { /* ... */ };
  
  // 根据 ID 获取配置
  const getProfileById = (id: string) => { /* ... */ };
  
  return {
    profiles,
    loadProfiles,
    saveProfile,
    deleteProfile,
    getProfilesByCategory,
    getProfileById
  };
}
```

#### 6.6.2. 请求构建逻辑

在 `src/tools/smart-ocr/composables/useOcrRunner.ts` 中实现：

```typescript
async function callVlmEngine(
  profile: LlmProfile,
  template: LlmApiTemplate,
  modelId: string,
  imageBase64: string,
  prompt: string
) {
  // 1. 替换 URL 模板中的变量
  const url = replaceVariables(template.urlTemplate, profile.variableValues);
  
  // 2. 替换 Headers 中的变量
  const headers = replaceVariables(template.headers, profile.variableValues);
  
  // 3. 替换 Body 模板中的变量
  const body = replaceVariables(template.bodyTemplate, {
    ...profile.variableValues,
    model: modelId,
    imageBase64,
    prompt
  });
  
  // 4. 发送请求
  const response = await fetch(url, {
    method: template.method,
    headers,
    body
  });
  
  return await response.json();
}
```

### 6.7. 实施计划 (Phase 3 扩展)

#### Phase 3.1: 基础架构搭建
- 创建 `src/config/llm-api-templates.ts`，定义至少一个 Vision 模板（OpenAI-Compatible）
- 创建 `src/types/llm-profiles.ts`，定义所有类型
- 实现 `src/composables/useLlmProfiles.ts`

#### Phase 3.2: 设置页面开发
- 在 `Settings.vue` 中新增 LLM 服务配置模块
- 实现配置列表展示
- 实现添加/编辑弹窗（含模板选择、变量填写、模型管理）

#### Phase 3.3: Smart OCR 集成
- 修改 `OcrEngineConfig` 类型定义
- 改造 `ControlPanel.vue` 的引擎选择器
- 在 `useOcrRunner.ts` 中实现 VLM 调用逻辑

#### Phase 3.4: 测试与优化
- 测试完整的创建→选择→调用流程
- 添加错误处理和用户反馈
- 优化 UI/UX 细节

### 6.8. 未来扩展

- **更多模板**：添加 Google Gemini、Anthropic Claude 等官方格式的模板
- **模板导入导出**：允许用户导入社区分享的自定义模板
- **使用统计**：记录每个配置的调用次数和成功率
- **成本估算**：集成 API 计费信息，帮助用户控制成本