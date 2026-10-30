# Live2D 集成方式调查

> 调查日期：2026-10-30。范围：AIO Hub 桌面端的应用内角色、语音交互形象和透明悬浮桌宠。本文记录选型与接入建议；尚未安装运行库、导入模型或验证真实窗口。

## 1. 结论

1. **优先采用 Web 渲染路线**：Vue 管理工作区和角色状态，Cubism Web 运行时在 Canvas 上绘制。当前 Tauri 可承载，后续 Electron 可复用渲染与角色控制层。
2. **官方 SDK 路线以 Cubism SDK for Web R5 为参照**：本次访问官方 latest release 跳转到 `5-r.5`，Samples 更新日志日期为 2026-04-02。这一代 Framework 要求 WebGL2，支持 Cubism 5.3 的混合模式与离屏绘制。[S1][S2]
3. **轻量封装优先考察 `live2d-web`**：已核对 npm `0.9.0` 发布包的 README、包元数据和 LICENSES.md；具备直接 JavaScript 入口，包含 Framework 5-r.5 适配与 WebGL shader，适合 Vue 外层封装。项目较新，作为 PoC 候选；生产选型仍需实际模型与 Tauri 资源协议走查。[S3]
4. **Pixi 路线按版本组合选择**：原版 `pixi-live2d-display` 稳定包为 2022 年发布的 `0.4.0`，依赖 Pixi 6；已有 Pixi 8 分支，但各分支支持的 Cubism 版本和新功能不同。[S4][S5]
5. **已有独立开源运行时**：Purism Core（MIT）重实现 Core，支持 MOC3、原生与 WASM；Ayagami（MIT / Apache-2.0 双许可）独立实现模型计算与渲染，动作、表情等高层能力仍在完善。初轮调查遗漏了这条路线，现补入第 3.6 节。[S13][S14]
6. **授权按实际采用组件区分**：使用官方 Core / Framework 时，自由导入模型很可能涉及官方“可扩展应用”规则；独立运行时应单独审查代码来源、模型许可和已有合同。开源替代的作者声明与独立法律结论分开记录。[S6][S7][S8][S13][S14]

建议顺序：明确是否采用官方 SDK 及模型来源 → 比较官方栈、Purism Core 与独立运行时的接入成本 → 用授权模型完成应用内 PoC → 接入音频与角色状态 → 按需扩展桌宠窗口。

## 2. 仓库现状与可复用能力

本节依据本地源码检查，与外部项目的功能声明分开记录。

| 项目 | 当前实现 | 对集成的影响 |
| --- | --- | --- |
| 前端 | 根 `package.json`：Vue 3、Vite 8、TypeScript，桌面端 Tauri 2 | 可用 Vue 组件托管 Canvas；运行库按需加载 |
| Live2D / Pixi | 本次仓库文本搜索未找到现成 Live2D 集成，根依赖中未配置 Pixi / Cubism | 需要新增渲染适配和角色资产管理 |
| 本地资源 | `src/composables/useAssetManager.ts` 已有 `convertFileSrc(..., "asset")`；`src-tauri/tauri.conf.json` 开启 asset protocol | 可借鉴本地资源 URL 生成；模型子资源加载仍需单独验证 |
| 安全配置 | 当前 Tauri 配置 `csp: null`，asset scope 范围较宽 | 模型导入应自行限定模型根目录与引用路径，避免将当前全局范围当作资产授权 |
| 独立窗口 | `src-tauri/src/commands/window_manager.rs` 已有工具/组件分离窗口、拖动、置顶与光标事件切换 | 可复用底层能力，桌宠需要专用窗口策略 |
| 透明窗口 | 所检查的两个创建入口仅在 Windows 分支调用 `transparent(true)` | macOS / Linux 透明桌宠需补平台实现与实际验证 |
| 工具窗口约束 | `create_tool_window` 有最小尺寸 400×300、固化后显示任务栏等行为 | 小尺寸桌宠宜单独配置窗口种类 |
| 平台门面 | `src/platform/modules/window.ts` 已封装部分基础窗口操作 | 新增桌宠宿主能力建议放入平台适配层 |
| 应用目录 | `src/utils/appPath.ts` 提供 `getAppConfigDir()` | 模型库、配置和缓存统一从该根目录解析 |
| 音频 | `src/components/common/AudioPlayer.vue` 使用 Web Audio 解码计算静态波形 | 可参考音频加载，但尚无本次可直接复用的实时口型分析管线 |
| 宿主演进 | `docs/Plan/electron-migration-master-plan.md` 已规划 Electron 与平台门面 | 角色控制层保持宿主无关，窗口与本地资源解析走适配器 |

本次未检查移动端；移动端接入另按 `mobile/AGENTS.md` 开展。

## 3. 路线比较

### 3.1 官方 Cubism SDK for Web

组成：[S1][S2][S8]

- **Core**：加载和计算模型的闭源运行库，官方 GitHub Samples 不包含 Core，需要从官方 SDK 获取。
- **Framework**：TypeScript 框架，管理模型、动作、表情、物理和 WebGL 渲染。
- **Samples**：示范资源加载、渲染循环、输入与窗口处理；应用需要抽取其中必要部分。

优点：直接跟随官方格式和渲染特性；能够掌控资源加载、更新顺序、状态恢复和卸载。

成本：需要维护模型加载、动作与参数协调、渲染循环、输入映射和资源释放。Vue 组件负责生命周期，渲染循环留在独立运行时内。

**本次查到的重要变化**：[S2]

- R5 已切换到 `WebGL2RenderingContext`，Cubism 5.3 混合模式使用 WebGL2 能力。
- Shader 从内嵌字符串改为外部 `.vert` / `.frag` 文件，生产构建必须正确发布并解析这些资源。
- R5 用 `CubismUpdateScheduler` 管理部分更新顺序。旧版教程里的逐帧参数更新示例需要按目标 SDK 重新核对。
- 半透明物体混合和动作停止等问题在 R5 的开发周期有修复；Core、Framework、Samples 应选兼容的一组版本。

适用：长期维护的角色能力、需要明确支持 Cubism 5.3 新渲染特性、希望减少对社区适配器的依赖。

### 3.2 `live2d-web`：直接 WebGL2 的高层封装

截至调查日，npm latest 为 **0.9.0，发布于 2026-09-01**；首个 npm 包创建于 2026-08-19。[S3]

已核对发布包内容：[S3]

- 主入口提供 `createLive2D`，可用 JavaScript 接入；React 是独立子入口。
- 包内有 Framework 5-r.5 适配代码和独立 shader 文件。
- README 提供动作播放、鼠标跟随、销毁，以及口型、表情等文档入口。
- Cubism Core 与角色模型需要应用自行提供。
- 包授权标记为 `SEE LICENSE IN LICENSES.md`：自身代码 MIT，内含 Framework 与 shader 使用 Live2D Open Software License；Core 适用单独的专有授权。

仓库当前 README 另声明多模型、wLipSync、MediaPipe 等能力。**这些属于上游当前源码声明，本次未逐项核实 `0.9.0` 的完整实现，也未运行验证。**

对 AIO Hub 的判断：可以用一个 Vue 组件托管实例，封装层比直接移植官方 Sample 更薄；项目发布历史较短，需要检查模型切换、销毁、本地 URL、shader 路径和透明背景。通过对比再决定生产采用，避免让业务代码绑定其私有内部对象。

### 3.3 PixiJS + Live2D 适配器

下表版本来自 npm registry 的当前 latest 标签与发布元数据；兼容描述来自维护者 README / peerDependencies。[S4][S5]

| 包 | 当前 latest / 发布日期 | 依赖或声明 | 评价 |
| --- | --- | --- | --- |
| `pixi-live2d-display` | `0.4.0` / 2022-09-04 | Pixi 6；README 要求 Core 2.1 或 4 | 适合维护既有项目，新接入优先比较当前方案 |
| `pixi-live2d-display-lipsyncpatch` | `0.5.0-ls-8` / 2025-06-02 | Pixi 7；维护者提供实时口型补丁 | 有现成口型能力，仍需确认新模型特性 |
| `@naari3/pixi-live2d-display` | `1.2.5` / 2025-11-30 | Pixi 8；README 明确要求 Core 5 | Pixi 8 候选；Cubism 5.3 新混合模式支持待验证 |
| `@jannchie/pixi-live2d-display` | `1.4.0` / 2026-07-17 | Pixi 8；README 仍标注 Core 2.1 或 4 | 发布较新与模型格式支持需分别判断 |
| `untitled-pixi-live2d-engine` | `1.4.0` / 2026-09-20 | Pixi `^8.13.1`、`@pixi/sound ^6.0.1` | npm 描述包含 Cubism 2–5、口型和并行动作；本次仅核对元数据，未深入审计 |

`oh-my-live2d` 属于更高层的网页角色包装，本次查到 latest 为 `0.19.3`（2024-05-09）。AIO Hub 的桌面窗口、音频和资产管理已有自身体系，建议优先评估底层渲染适配，避免同时维护两套控制入口。[S4]

**判断原则**：能载入一个 Cubism 5 模型，仅说明该模型用到的特性可以工作。Cubism 5.3 的混合模式、离屏绘制、遮罩和物理等能力需要分别核对；升级 Core 也无法代替上层渲染适配。[S2]

如果未来还有大量 Pixi 精灵、粒子或场景合成需求，Pixi 路线的价值更高。当前仓库尚无 Pixi 基础，单角色展示可先比较直接 WebGL 路线。

### 3.4 外部 VTube Studio 联动

VTube Studio 提供本地 WebSocket API，默认端口 8001；插件经过用户授权后，可以加载模型、切换表情/热键、注入参数等。[S9]

集成结构：AIO Hub 提交角色状态或音频分析结果 → 连接 VTube Studio → 由 VTube Studio 负责模型展示。

优点：现有 VTube Studio 用户可以沿用其角色配置和渲染环境，适合直播、VTuber 或已有虚拟形象工作流。

代价：用户需要另行运行和配置 VTube Studio；AIO Hub 的独立角色窗口与 VTube Studio 需要分别管理。该 API 主要提供联动控制，应用内直接显示仍需另选渲染或捕获方案。

授权分别遵守 VTube Studio API 使用规定与模型许可；外部联动和内嵌 SDK 的发布形态应分别审查。

### 3.5 Native SDK / Unity / Python Sidecar

官方另有 Native SDK，适合已有原生渲染或游戏引擎的应用。[S10]

对 AIO Hub 的工程判断：

- Native / Unity 需要额外的渲染窗口、嵌入、打包和跨进程控制；当前 Vue 工作区更容易复用 Web 方案。
- Python Sidecar 还会增加解释器和图形依赖的分发成本。
- 若未来需要独立于 WebView 的长期常驻渲染进程，再专项比较这些方案。

### 3.6 兼容 Live2D 模型的独立开源运行时（同日补充）

“角色驱动”可以拆为输入控制、模型计算和渲染/动作管理。鼠标、音频或面捕映射为参数属于应用控制逻辑；官方 Core 负责模型顶点等计算，适用专有许可。后者已有开源重实现。[S11][S13][S14]

| 项目 | 作用与许可 | 对 AIO Hub 的判断 |
| --- | --- | --- |
| Purism Core | MIT，C99 重实现 Core，读取 MOC3，提供原生与 Emscripten/WASM 构建 | 保留模型格式、替换底层 Core 的优先实验候选 |
| Ayagami | MIT / Apache-2.0 双许可，Rust 实现模型计算与 wgpu 渲染，支持浏览器演示 | 减少对官方整套运行时依赖的候选，需要额外 Web 适配和高层功能 |

**Purism Core**：维护者声明支持 Core v5 / v6 API、ABI，并提供两套 WASM 构建。兼容文档将 v5 对应 Cubism 5.1 SDK，将 v6 对应 Cubism 5.3 SDK。采用时匹配宿主加载接口、内存及渲染能力，尤其检查 5.3 的离屏绘制与混合模式。本次仅核对文档，兼容程度与速度尚未实测。[S13]

**Ayagami**：维护者声明采用独立黑盒实现；当前 README 将物理引擎及 SDK 5.3 渲染特性标为已完成，动作文件、表情文件、Pose 文件、C API 和可嵌入 Web 组件仍列为待完成，API 也标注不稳定。可直接写参数与展示模型，但完整桌宠仍需补动作调度等功能。[S14]

**两者的范围不同**：Purism Core 只替换核心计算库，动作、物理、表情与渲染仍需配套实现；Ayagami 同时提供模型驱动和渲染。若 Purism Core 上层继续使用官方 Framework，Framework 的许可边界仍然存在。若希望构建采用宽松开源许可的完整栈，要逐个核对上层组件。[S8][S13][S14]

项目作者关于免版税、无需官方许可的说法作为其声明记录；本调查未独立验证法律地位。角色素材授权、已有合同义务与分发安排仍需核对。

### 3.7 更换模型生态：Inochi2D

Inochi2D SDK 为 BSD-2-Clause，提供自己的实时 2D puppet 标准及 Creator 建模工具，使用 INP / INX 等格式。它适合愿意采用另一套制作流程的自有角色；对已有 MOC3 资产，不能将其作为相同加载接口的直接替换。本次未调查模型转换工具及效果。[S15]

## 4. 角色素材与资产导入

### 4.1 最小资产集合

官方 Samples 使用 `.model3.json` 描述模型资源；典型资源包括 `.moc3`、纹理、动作、表情、物理与姿势文件。[S1][S11]

```text
character/
  character.model3.json
  character.moc3
  textures/*.png
  motions/*.motion3.json
  expressions/*.exp3.json
  character.physics3.json
  character.pose3.json
```

动作、表情、物理等按模型实际提供的资源加载。导入器应解析 `FileReferences`、`Groups`、`HitAreas` 等信息，建立该模型的可用能力清单。[S11]

静态 PNG / PSD 需要先经过角色分层和 Live2D 建模导出，才能成为可操控的运行时模型；Cubism 编辑工程 `.cmo3` 与运行时模型包应区分处理。[S1][S11]

### 4.2 AIO Hub 建议的导入策略

1. 首期接受目录或 `.model3.json`，选择模型后将依赖复制到应用模型库。ZIP 支持按产品需求后置。
2. 应用根目录通过 `getAppConfigDir()` 取得，建议在其下设角色模型库；记录模型入口、作者、来源、授权说明和用户映射。
3. 本地资源解析先完成文件系统路径规范化、根目录约束，再转为宿主可访问 URL。
4. 对模型 JSON 内的相对资源引用，统一由 `ModelAssetResolver` 处理；需要适配运行库自身的 URL 解析或加载器。重点检查盘符、中文、空格、`#`、`%` 和多层子目录。
5. 运行时的父目录引用只有在规范化后仍位于已导入模型根目录内时才可接受；ZIP 条目解压前拒绝绝对路径、越界路径和符号链接等危险条目。
6. 检查压缩前后大小、文件数量、纹理尺寸和 `.moc3` 版本/一致性，设置可配置的资源预算。检查数据按格式读取，角色素材只接受必要的数据类型。
7. 不直接用通用 JSON IPC 数字数组搬运整套纹理和模型。优先本地协议或明确的二进制加载路径，资源按需缓存。

本地路径示例中的 `convertFileSrc` 只解决宿主访问入口；纹理跨域、相对路径基址和 shader 加载仍需运行态验证。

## 5. 接入 AIO Hub 的建议结构

以下为拟议职责划分，文件尚未创建：

```text
Vue 工作区 / 聊天角色区域 / 悬浮角色窗口
                 ↓
AvatarController（加载、动作、表情、注视、说话状态）
       ├─ AvatarRenderer（官方 SDK 或社区适配器）
       ├─ ModelAssetResolver（目录、路径、资源 URL、预算）
       ├─ AudioLipSync（音频时钟、音量包络、口型参数）
       └─ AvatarHost（窗口、置顶、鼠标事件、宿主生命周期）
```

- 聊天、Agent 和音频业务只提交抽象状态及明确的角色命令。
- 渲染器通过模型能力清单查找动作组、表情和参数；角色配置保存用户选择的映射。
- 桌宠与应用内预览复用同一套接口；是否同时保留两个渲染实例按窗口与资源需求决定。
- Tauri / Electron 的路径、窗口和事件能力留在宿主适配层。
- 角色状态配置可用项目已有配置管理工具；大体积模型文件由模型库负责。

如最终做成独立工具或插件，再依照仓库的工具注册与插件规范确定正式目录。此阶段先明确边界。

### 5.1 口型与语音

官方提供音量驱动口型和模型口型参数分组机制；Web 侧也有独立 MotionSync 方案。[S11][S12]

建议首期使用 **实际播放音频 → Web Audio 分析 → RMS / 平滑包络 → 模型口型参数**：

- `Groups` 中的 `LipSync` 信息和实际参数共同决定口型映射；预留用户调整。
- 音频分析与声音播放共用时钟和播放管线，避免角色口型领先/滞后。
- 暂停、跳转、打断与播放结束都应更新口型状态；同一 HTMLMediaElement 的分析源集中管理。
- 先实现稳定的嘴部开合。需要音素或母音区分时再比较 MotionSync / wLipSync 与音素时序来源。
- 对 `AudioContext.resume()` 和用户手势要求保留交互处理；前端模型切换时释放旧分析节点与订阅。

本次未找到 LLM Chat 可直接复用的实时口型通道，语音业务接线需要独立实施。

### 5.2 动作、表情和 Agent 状态

建议建立显式映射，例如：空闲、倾听、思考、说话、被打断。实际动作组和表情以模型清单为准。

- 用户可将状态绑定到模型实际具有的动作或表情。
- LLM 若提出情绪标签，由应用白名单转换为角色命令。
- 每帧参数写入由一个运行时统一协调；按目标 SDK 的更新顺序处理动作、表情、物理与口型，避免相互覆盖。[S2][S11]
- 默认鼠标跟随限于所属 Canvas / 窗口。全局桌面鼠标跟随属于额外宿主能力。

### 5.3 透明桌宠窗口

建议分成独立宿主能力，在应用内渲染稳定后推进：

- 专用轻量入口与窗口种类，按需支持透明背景、关闭窗口装饰、置顶、隐藏任务栏、拖动和缩放。
- 初期提供“交互 / 穿透”切换及可恢复的托盘入口；逐像素穿透留待真实平台实现比较。
- 模型 HitArea 用于角色内部点击交互。原生桌面穿透还需要窗口系统配合；整个窗口穿透后，窗口内鼠标监听也会受影响。
- Canvas 透明、页面根背景、窗口透明与阴影应协同配置，并检查半透明边缘。
- 多显示器缩放、屏幕热插拔和窗口位置恢复需要宿主处理。
- 当前 Windows 窗口代码可提供基础；Linux / macOS 桌宠透明度和输入事件行为待实际验证。

本节为对本地窗口代码的集成判断，尚无桌宠真实窗口实测结果。

## 6. 授权与发布边界

本节主要覆盖采用官方 Core / Framework 的路线，依据官方公开条款整理；具体归类及合同条件以 Live2D 的书面回复为准。采用第 3.6 节的独立实现时，按实际组成重新审查，官方 SDK 的发行规则不能直接套用为独立实现已成立的义务，也不能据仓库许可证推导整体免责。[S6][S7][S8][S13][S14]

### 6.1 四层许可分别处理

| 层 | 核对事项 |
| --- | --- |
| 社区封装 | 自身许可证、修改与再分发要求；包内可能同时包含其他许可证的代码 |
| Cubism Framework | Live2D Open Software License、第三方声明与发布要求 |
| Cubism Core | Live2D Proprietary Software License、获取方式、再分发与发布授权 |
| 角色模型 | 角色版权、建模与素材许可、商用、内置分发、修改和宣传使用权限 |

AIO Hub 主仓的 Apache-2.0 授权需要与这些第三方组成的许可边界清楚区分。第三方代码和 Core 的发布方式应单独登记。

### 6.2 固定角色与自由导入

官方专有协议对一般用户/小规模企业的通常豁免设有条件，同时明确可扩展应用另行处理。官方可扩展应用页面描述了通过添加/组合文件与数据使用不定数量模型等情形。[S6][S7]

因此建议按产品形态向官方确认：

| 形态 | 本次判断 |
| --- | --- |
| 固定内置的一组授权角色 | 按常规发布类别与发行方条件核对；同时取得模型内置分发许可 |
| 用户导入任意本地模型 / 社区角色市场 | 与“可扩展应用”描述高度相关，发布前应申请分类确认与审核 |
| 用户自行下载 Core / 通过插件装入 | 仍需按实际应用功能和发布方式确认许可，不能仅凭下载分离推定豁免 |
| 仅做本地开发验证 | 核对 SDK 和素材允许的开发使用范围，与公开发布分开处理 |
| VTube Studio 外部控制插件 | 分别核对 API、应用商店/分发规则及模型使用许可 |

### 6.3 可扩展应用的公开条件

2026-10-30 查阅的官方页面说明：[S7]

- 该类别发布前需要审核并签订专门的出版许可协议，适用于通常可豁免的一般用户和小规模企业。
- 审核条件包括有效收入模式；完全免费应用原则上不符合，另有满足特定条件的例外申请情形。
- 页面列有销售报告、收入分成、标识等要求。
- 一般用户/小规模企业公开分成为每笔销售 **300 日元或销售额的 20%，取较高者**；具体基数、收入范围、免费例外、平台与实际合同条件需由官方确认。

上述金额仅记录调查日页面，不作为 AIO Hub 成本承诺。AIO Hub 的免费开源形态若计划开放任意模型导入，建议在正式功能施工前提交具体说明，确认能否获批及适用方式。

## 7. 最小推进范围

### 第一步：产品与授权确认

确认首期是固定角色、自由导入，还是 VTube Studio 联动，并选定官方栈或独立运行时。采用官方组件时，将免费开源、桌面助手、聊天/语音、模型来源和分发方式写明，向 Live2D 查询适用类别。采用独立实现时核对完整组件清单和素材许可。

### 第二步：应用内小型 PoC

用一个合法可用于验证的模型，按授权目标选择对比官方 R5 / `live2d-web@0.9.0`、Purism Core WASM 或 Ayagami：

- 本地模型加载、动作、表情、鼠标注视和透明边缘。
- 实际 Tauri 环境的 WebGL2、本地资源协议与生产 shader 路径。
- 模型切换/关闭后释放 Canvas、GPU 纹理、动作与监听。
- 若用户目标素材含 Cubism 5.3 特性，用该类模型检查混合模式与离屏效果。

先覆盖用户实际使用的平台；Linux WebKitGTK 与 Windows WebView2 分别记录结果。PoC 只建立选型证据。

### 第三步：接入业务

抽象角色控制接口，接线播放音频与聊天状态，提供模型能力映射和可行动的加载错误。按项目要求运行类型检查、Vite 构建及相关验证。

### 第四步：按需增加桌宠

新增专用窗口策略与恢复入口，在真实宿主上检查透明、拖动、置顶、穿透和屏幕缩放。

性能建议：单角色先用 30 FPS 作为调优起点，限制绘制分辨率，窗口隐藏/功能关闭时停止渲染或释放资源，模型/动作按需加载。具体 CPU、GPU、内存与包体变化需 PoC 实测；本次未取得测量值。

## 8. 调查范围与待确认项

已完成：本地接入点阅读；官方 SDK 发布与变更核对；Context7 查询；社区包 npm 元数据核对；`live2d-web@0.9.0` 发布包 README、LICENSES.md 与 shader 布局检查；官方授权页和专有协议查阅。

待确认：Live2D 对 AIO Hub 具体功能的授权分类；Core 与模型实际获取/分发安排；真实模型兼容性；WebView2 / WebKitGTK 的 WebGL2 与透明效果；社区封装的生命周期和资源表现；语音业务接线。

本调查仅维护本文，未修改业务代码或依赖，未进行运行态或性能验证。后续同日补查了独立运行时的 README、构建说明及兼容性声明。

## 9. 来源

以下链接均为官方文档、项目维护者仓库或 npm 原始包元数据，访问日期为 2026-10-30。GitHub API 本次遇到匿名请求限流，发布信息转用 GitHub release 页面、raw 源文件与 npm registry 核对。

- **[S1] 官方 Web Samples**：[仓库与环境说明](https://github.com/Live2D/CubismWebSamples)、[当前 release 入口](https://github.com/Live2D/CubismWebSamples/releases/latest)、[R5 release](https://github.com/Live2D/CubismWebSamples/releases/tag/5-r.5)、[Samples 更新日志](https://github.com/Live2D/CubismWebSamples/blob/develop/CHANGELOG.md)。
- **[S2] 官方 Framework**：[更新日志](https://github.com/Live2D/CubismWebFramework/blob/develop/CHANGELOG.md)、[Cubism 5.3 新功能兼容说明](https://docs.live2d.com/en/cubism-sdk-manual/cubism-5-3-new-functions/)。Context7 同时查询了官方 Framework 的 shader 和 update scheduler API。
- **[S3] live2d-web**：[维护者仓库](https://github.com/Heonys/live2d-web)、[npm registry](https://registry.npmjs.org/live2d-web)、[0.9.0 元数据](https://registry.npmjs.org/live2d-web/0.9.0)、[包内许可说明的源码位置](https://github.com/Heonys/live2d-web/blob/main/packages/live2d-web/LICENSES.md)。调查中另下载并读取了 `0.9.0` 发布包内 README 与 LICENSES.md。
- **[S4] 原版与较高层封装**：[原版 README](https://github.com/guansss/pixi-live2d-display)、[原版 registry](https://registry.npmjs.org/pixi-live2d-display)、[oh-my-live2d registry](https://registry.npmjs.org/oh-my-live2d)。Context7 查询结果与原版 Pixi 6 要求一致。
- **[S5] Pixi 分支**：[naari3 仓库](https://github.com/naari3/pixi-live2d-display)、[naari3 registry](https://registry.npmjs.org/@naari3/pixi-live2d-display)、[Jannchie 仓库](https://github.com/Jannchie/pixi-live2d-display)、[Jannchie registry](https://registry.npmjs.org/@jannchie/pixi-live2d-display)、[口型补丁 registry](https://registry.npmjs.org/pixi-live2d-display-lipsyncpatch)、[Untitled 引擎 registry](https://registry.npmjs.org/untitled-pixi-live2d-engine)。
- **[S6] 官方许可**：[SDK Release License 总览](https://www.live2d.com/en/sdk/license/)、[Live2D Proprietary Software License Agreement](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)，重点参阅第 2 节和可扩展应用相关条款。
- **[S7] 官方可扩展应用规则与费率**：[Expandable Applications](https://www.live2d.com/en/sdk/license/expandable/)。
- **[S8] SDK 组成授权**：[Framework LICENSE.md](https://github.com/Live2D/CubismWebFramework/blob/develop/LICENSE.md)、[官方 Web SDK 下载入口](https://www.live2d.com/en/sdk/download/web/)。
- **[S9] VTube Studio 官方 API**：[API 文档](https://github.com/DenchiSoft/VTubeStudio)，参阅 Authentication、WebSocket Server、InjectParameterDataRequest、模型与表情相关章节。
- **[S10] 官方 Native SDK**：[Cubism Native Samples](https://github.com/Live2D/CubismNativeSamples)。
- **[S11] 官方模型与参数文档**：[模型参数更新](https://docs.live2d.com/cubism-sdk-manual/parameters/)、[Lip-sync](https://docs.live2d.com/cubism-sdk-manual/lipsync/)、[Web Samples 资源目录](https://github.com/Live2D/CubismWebSamples/tree/develop/Samples/Resources)。相关参数流程通过 Context7 同步查询。
- **[S12] 官方 MotionSync for Web**：[SDK 手册入口](https://docs.live2d.com/en/cubism-sdk-manual/top/)，参阅 Cubism SDK MotionSync Plugin for Web；本次仅确认产品文档入口。

- **[S13] Purism Core**：[维护者仓库与 MIT 许可](https://github.com/SakuraMotion/PurismCore)、[构建与 WASM 说明](https://github.com/SakuraMotion/PurismCore/blob/master/docs/BUILDING.md)、[API / ABI 兼容声明](https://github.com/SakuraMotion/PurismCore/blob/master/docs/COMPAT.md)。
- **[S14] Ayagami**：[维护者仓库](https://github.com/AyagamiDev/ayagami)、[README 功能完成情况与授权声明](https://raw.githubusercontent.com/AyagamiDev/ayagami/main/README.md)。
- **[S15] Inochi2D**：[SDK 仓库与 BSD-2-Clause 许可](https://github.com/Inochi2D/inochi2d)、[格式、建模及 WASM 说明](https://raw.githubusercontent.com/Inochi2D/inochi2d/main/README.md)。
