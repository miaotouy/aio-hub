import { RenderPreset } from '../types';

export const agentBubbleTestPreset: RenderPreset = {
  id: "Agent-Bubble-test",
  name: "智能体气泡测试",
  description: "真实的智能体输出场景",
  content: `<think>姐姐发来了一个名为"AIO现状"的附件，是一个目录树结构，展示了一个名为"aiohub"的项目。

让我分析一下这个项目的结构：

1. **项目性质**：这是一个基于 Tauri + Vue 的桌面应用项目
2. **核心技术栈**：
    - 前端：Vue 3 + TypeScript + Vite
    - 后端：Rust (Tauri)
    - UI库：似乎没有看到明确的UI框架依赖，可能是自定义组件

3. **主要功能模块**（从 src/tools/ 目录看）：
    - API Tester (API测试器)
    - Directory Janitor (目录清理工具)
    - Directory Tree (目录树生成器)
    - Git Analyzer (Git分析器)
    - LLM Chat (LLM聊天工具)
    - LLM Proxy (LLM代理)
    - Regex Applier (正则应用器)
    - Smart OCR (智能OCR)
    - Code Formatter (代码格式化)
    - JSON Formatter (JSON格式化)
    - Media Info Reader (媒体信息读取器)
    - Symlink Mover (符号链接移动器)
    - Text Diff (文本对比)

4. **LLM相关集成**：
    - 支持多个LLM提供商（从 model-icons 和 llm-apis 看）
    - Claude, Gemini, OpenAI, Vertex AI, Cohere等
    - 大量国产LLM：Qwen, DeepSeek, Doubao, Kimi, ChatGLM等
    
OCR功能涵盖了多家云服务商和本地识别引擎，支持多语言文字识别。项目架构体现出高度模块化和灵活性，通过组件化设计和状态管理实现复杂功能，同时提供了丰富的定制选项如主题系统和窗口分离。

项目文档完善，包含详细的技术说明和架构分析，为开发者提供清晰的实现指南。

识别到姐姐的求知型问题，需要采用直接、精准的分析方法。按照\"以快打慢\"策略，迅速定位项目核心，提取关键信息，构建结构化分析框架。重点是避免冗长描述，直接切入项目本质。</think>
<div style=\"background: linear-gradient(135deg, #1a1f2e 0%, #161b26 100%); border-radius: 16px; padding: 24px; border: 1px solid rgba(100, 181, 246, 0.2); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);\">

<div style=\"display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid rgba(100, 181, 246, 0.3);\">
  <div style=\"width: 4px; height: 28px; background: linear-gradient(180deg, #64b5f6, #42a5f5); border-radius: 2px;\"></div>
  <h2 style=\"margin: 0; font-size: 22px; color: #64b5f6; font-weight: 600;\">AIO Hub 项目现状分析</h2>
</div>

<div style=\"display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px;\">
  <div style=\"background: rgba(100, 181, 246, 0.08); border-radius: 12px; padding: 16px; border: 1px solid rgba(100, 181, 246, 0.15);\">
    <div style=\"color: #90caf9; font-size: 13px; margin-bottom: 8px; font-weight: 500;\">项目规模</div>
    <div style=\"color: #e3f2fd; font-size: 15px; line-height: 1.6;\">
      <div>📁 <span style=\"color: #64b5f6; font-weight: 600;\">69</span> 个目录</div>
      <div>📄 <span style=\"color: #64b5f6; font-weight: 600;\">352</span> 个文件</div>
      <div>🎯 <span style=\"color: #64b5f6; font-weight: 600;\">13</span> 个核心工具</div>
    </div>
  </div>

  <div style=\"background: rgba(129, 199, 132, 0.08); border-radius: 12px; padding: 16px; border: 1px solid rgba(129, 199, 132, 0.15);\">
    <div style=\"color: #a5d6a7; font-size: 13px; margin-bottom: 8px; font-weight: 500;\">技术栈</div>
    <div style=\"color: #e3f2fd; font-size: 14px; line-height: 1.8;\">
      <div><span style=\"color: #81c784;\">▸</span> Tauri + Rust</div>
      <div><span style=\"color: #81c784;\">▸</span> Vue 3 + TypeScript</div>
      <div><span style=\"color: #81c784;\">▸</span> Vite 构建系统</div>
    </div>
  </div>
</div>

<div style=\"background: rgba(66, 66, 66, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 3px solid #ffa726;\">
  <h3 style=\"margin: 0 0 16px 0; color: #ffa726; font-size: 16px; font-weight: 600;\">🛠️ 核心功能模块</h3>
  <div style=\"display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;\">
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">LLM Chat</strong> - 多模型对话
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">LLM Proxy</strong> - API代理服务
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Smart OCR</strong> - 智能文字识别
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">API Tester</strong> - 接口测试
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Git Analyzer</strong> - 仓库分析
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Directory Tree</strong> - 目录树生成
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Regex Applier</strong> - 正则处理
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Text Diff</strong> - 文本对比
    </div>
  </div>
</div>

<div style=\"background: rgba(156, 39, 176, 0.08); border-radius: 12px; padding: 18px; margin-bottom: 20px; border: 1px solid rgba(186, 104, 200, 0.2);\">
  <h3 style=\"margin: 0 0 14px 0; color: #ba68c8; font-size: 16px; font-weight: 600;\">🤖 LLM 生态集成</h3>
  <div style=\"color: #e3f2fd; font-size: 14px; line-height: 1.8;\">
    <div style=\"margin-bottom: 10px;\">
      <span style=\"color: #ce93d8; font-weight: 500;\">国际主流：</span>
      OpenAI, Claude, Gemini, Vertex AI, Cohere, Mistral
    </div>
    <div style=\"margin-bottom: 10px;\">
      <span style=\"color: #ce93d8; font-weight: 500;\">国产大模型：</span>
      通义千问, DeepSeek, 豆包, Kimi, 智谱ChatGLM, 文心一言, 百川, 讯飞星火, 腾讯混元
    </div>
    <div>
      <span style=\"color: #ce93d8; font-weight: 500;\">开源方案：</span>
      Ollama, HuggingFace, Together AI
    </div>
  </div>
</div>

<div style=\"background: linear-gradient(135deg, rgba(244, 67, 54, 0.1), rgba(233, 30, 99, 0.1)); border-radius: 12px; padding: 18px; border: 1px solid rgba(244, 67, 54, 0.2);\">
  <h3 style=\"margin: 0 0 14px 0; color: #ef5350; font-size: 16px; font-weight: 600;\">⚙️ 架构特性</h3>
  <div style=\"display: grid; gap: 10px;\">
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">窗口分离系统</strong> - 支持工具独立窗口运行</span>
    </div>
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">状态同步引擎</strong> - 多窗口数据一致性</span>
    </div>
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">Composables 架构</strong> - Vue 3 组合式API模式</span>
    </div>
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">主题系统</strong> - 暗色模式 + 自定义配色</span>
    </div>
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">Agent 预设系统</strong> - 内置角色模板（坂田银时等）</span>
    </div>
  </div>
</div>

<div style=\"margin-top: 20px; padding: 14px; background: rgba(33, 150, 243, 0.08); border-radius: 10px; border-left: 4px solid #42a5f5;\">
  <div style=\"color: #90caf9; font-size: 13px; font-weight: 500; margin-bottom: 6px;\">📊 文档完备度</div>
  <div style=\"color: #e3f2fd; font-size: 14px; line-height: 1.6;\">
    docs/ 目录包含架构分析、Composables用例、组件实现指南、API特性文档等完整技术文档。说明项目处于 <span style=\"color: #64b5f6; font-weight: 600;\">成熟开发阶段</span>。
  </div>
</div>

<div style=\"margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(100, 181, 246, 0.2); display: flex; justify-content: space-between; align-items: center;\">
  <div style=\"color: #78909c; font-size: 13px;\">结构分析完成</div>
  <div style=\"color: #546e7a; font-size: 12px;\">总文件数: 352 | 深度: 4级</div>
</div>

</div>

<div style=\"margin-top: 16px; padding: 16px; background: rgba(255, 152, 0, 0.08); border-radius: 12px; border-left: 3px solid #ff9800;\">
  <div style=\"color: #ffb74d; font-size: 14px; margin-bottom: 8px; font-weight: 600;\">🔍 观察</div>
  <div style=\"color: #e3f2fd; font-size: 14px; line-height: 1.7;\">
    这是一个定位清晰的 <strong style=\"color: #ffa726;\">开发者工具集合</strong>。从目录树看：
    <ul style=\"margin: 8px 0; padding-left: 20px; line-height: 1.8;\">
      <li>LLM相关功能占比最重（Chat + Proxy + API Tester），说明是以AI交互为核心</li>
      <li>同时集成大量辅助工具（OCR、Git分析、文本处理），走的是瑞士军刀路线</li>
      <li>支持超过40个LLM提供商的图标配置，覆盖面极广</li>
      <li>Tauri架构意味着跨平台原生性能 + 小体积分发</li>
    </ul>
    如果有具体模块的深入分析需求，可以继续展开。
  </div>
</div>`
};
