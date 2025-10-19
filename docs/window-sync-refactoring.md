# 窗口分离状态同步重构方案 (v3.0 - 架构版)

> **文档定位**: 高层架构设计规格说明
> **受众**: 下游 AI 编码助手
> **产出物**: 架构图 + 组件接口定义 + 关键约束

---

## 1. 问题诊断

### 1.1 核心问题清单

| ID | 问题 | 类型 | 优先级 |
|----|------|------|--------|
| P1 | 手动遍历窗口进行消息推送，O(n)复杂度 | 性能 | 🔴 Critical |
| P2 | 缺乏统一的消息协议，格式不一致 | 架构 | 🔴 Critical |
| P3 | 多个 watch 导致重复推送同一状态 | 性能 | 🔴 Critical |
| P4 | 使用 setTimeout 延迟初始化，时序不可靠 | 可靠性 | 🔴 Critical |
| P5 | 分离窗口启动时缺失初始状态数据 | 功能 | 🔴 Critical |
| P6 | 全量推送大数据（5000条消息 = 5MB） | 性能 | 🟡 High |
| P7 | 组件内大量 `if (isDetached)` 分支逻辑 | 可维护性 | 🟡 High |
| P8 | 缺乏操作的幂等性保证，可能重复执行 | 可靠性 | 🟡 High |
| P9 | 无超时和重试机制 | 鲁棒性 | 🟡 High |
| P10 | 无握手协议，不知窗口连接状态 | 可靠性 | 🟡 High |

### 1.2 当前架构缺陷

```mermaid
graph TB
    subgraph "主窗口 (当前实现)"
        Store[Pinia Store]
        Watch1[Watch Messages]
        Watch2[Watch Session]
        Watch3[Watch Agent]
      
        Store --> Watch1
        Store --> Watch2
        Store --> Watch3
      
        Watch1 --> Loop1[遍历所有窗口]
        Watch2 --> Loop2[遍历所有窗口]
        Watch3 --> Loop3[遍历所有窗口]
      
        Loop1 --> Emit1[emit 'sync-messages']
        Loop2 --> Emit2[emit 'sync-session']
        Loop3 --> Emit3[emit 'sync-agent']
    end
  
    subgraph "分离窗口 (当前实现)"
        Delay[setTimeout 500ms]
        Listen1[listen 'sync-messages']
        Listen2[listen 'sync-session']
        Listen3[listen 'sync-agent']
      
        Delay --> Listen1
        Delay --> Listen2
        Delay --> Listen3
      
        Listen1 --> LocalState1[messages.value]
        Listen2 --> LocalState2[session.value]
        Listen3 --> LocalState3[agent.value]
    end
  
    Emit1 -.->|手动匹配| Listen1
    Emit2 -.->|手动匹配| Listen2
    Emit3 -.->|手动匹配| Listen3
  
    style Loop1 fill:#ff6b6b
    style Loop2 fill:#ff6b6b
    style Loop3 fill:#ff6b6b
    style Delay fill:#ff6b6b
```

**标注**: 红色节点为问题节点

---

## 2. 核心设计原则

### 2.1 四大支柱

```mermaid
mindmap
  root((窗口同步架构))
    单一数据源
      主窗口 = 权威来源
      分离窗口 = 只读视图
      所有修改经主窗口
    事件驱动通信
      标准化消息协议
      点对点 + 广播
      类型安全
    声明式同步
      自动 watch
      自动推送/接收
      零手动代码
    握手协议
      连接确认
      初始快照推送
      心跳检测
```

### 2.2 数据流向

```mermaid
flowchart LR
    subgraph Main["主窗口"]
        Store[(Pinia Store)]
        SyncEngine[同步引擎]
        ActionHandler[操作处理器]
      
        Store --> SyncEngine
        ActionHandler --> Store
    end
  
    subgraph Bus["通信总线"]
        Protocol{消息协议}
    end
  
    subgraph Detached["分离窗口"]
        LocalState[(本地状态)]
        UIAdapter[UI适配器]
        ActionProxy[操作代理]
      
        LocalState --> UIAdapter
        UIAdapter --> ActionProxy
    end
  
    SyncEngine -->|state-sync| Protocol
    Protocol -->|state-sync| LocalState
  
    ActionProxy -->|action-request| Protocol
    Protocol -->|action-request| ActionHandler
  
    ActionHandler -->|action-response| Protocol
    Protocol -->|action-response| ActionProxy
  
    style Store fill:#4ecdc4
    style LocalState fill:#95e1d3
    style Protocol fill:#f38181
```

---

## 3. 目标架构

### 3.1 系统分层

```mermaid
graph TB
    subgraph L1["层级 1: 业务层"]
        Store[Pinia Store]
        UI[UI Components]
    end
  
    subgraph L2["层级 2: 适配层"]
        MainAdapter[主窗口适配器]
        DetachedAdapter[分离窗口适配器]
    end
  
    subgraph L3["层级 3: 同步层"]
        StateSync[状态同步引擎]
        ActionProxy[操作代理]
    end
  
    subgraph L4["层级 4: 通信层"]
        WindowSync[窗口通信总线]
        Protocol[消息协议]
    end
  
    subgraph L5["层级 5: 传输层"]
        Tauri[Tauri Event System]
    end
  
    Store --> MainAdapter
    MainAdapter --> StateSync
  
    UI --> DetachedAdapter
    DetachedAdapter --> StateSync
    DetachedAdapter --> ActionProxy
  
    StateSync --> WindowSync
    ActionProxy --> WindowSync
  
    WindowSync --> Protocol
    Protocol --> Tauri
  
    style L1 fill:#e3f2fd
    style L2 fill:#fff3e0
    style L3 fill:#f3e5f5
    style L4 fill:#e8f5e9
    style L5 fill:#fce4ec
```

### 3.2 核心组件

```mermaid
classDiagram
    class WindowSyncBus {
        <<singleton>>
        +windowLabel: string
        +windowType: string
        +connectedWindows: Map
        +syncState(key, data, version, target?)
        +requestAction(action, params, options?)
        +onMessage(type, handler)
        +onConnect(handler)
        +sendHandshake()
    }
  
    class StateSyncEngine {
        +stateKey: string
        +autoPush: boolean
        +autoReceive: boolean
        +enableDelta: boolean
        +sync()
        +receive()
    }
  
    class ActionProxy {
        +request(action, params)
        +handle(action, params)
    }
  
    class UIAdapter {
        <<abstract>>
        +render()
        +handleUserAction()
    }
  
    class MainAdapter {
        +state: Ref~Store~
        +onAction(action, params)
    }
  
    class DetachedAdapter {
        +localState: Ref
        +sendAction(action, params)
    }
  
    WindowSyncBus --> StateSyncEngine : uses
    WindowSyncBus --> ActionProxy : uses
    UIAdapter <|-- MainAdapter
    UIAdapter <|-- DetachedAdapter
    MainAdapter --> StateSyncEngine : creates
    DetachedAdapter --> StateSyncEngine : creates
    DetachedAdapter --> ActionProxy : creates
```

---

## 4. 消息协议规格

### 4.1 消息类型定义

```mermaid
stateDiagram-v2
    [*] --> Handshake: 窗口启动
    Handshake --> Connected: 握手成功
    Connected --> StateSync: 状态变更
    Connected --> ActionRequest: 用户操作
    Connected --> Heartbeat: 定时检测
    ActionRequest --> ActionResponse: 处理完成
    StateSync --> Connected
    ActionResponse --> Connected
    Heartbeat --> Connected: 正常
    Heartbeat --> Disconnected: 超时
    Disconnected --> Reconnecting: 自动重连
    Reconnecting --> Handshake: 重新握手
    Disconnected --> [*]: 窗口关闭
```

### 4.2 消息结构规范

| 消息类型 | 方向 | 触发时机 | 必需字段 | 幂等性 |
|---------|------|---------|---------|--------|
| `handshake` | 双向 | 窗口启动/重连 | `windowType`, `componentId?` | ✅ |
| `state-sync` | 主→分离 | 状态变更 | `stateType`, `version`, `isFull`, `data/patches` | ✅ |
| `action-request` | 分离→主 | 用户操作 | `action`, `params`, `requestId`, `idempotencyKey?` | ✅ |
| `action-response` | 主→分离 | 操作完成 | `requestId`, `success`, `data?`, `error?` | ✅ |
| `heartbeat` | 双向 | 定时（30s） | `sequence` | ✅ |

### 4.3 关键时序

#### 4.3.1 窗口初始化

```mermaid
sequenceDiagram
    participant D as 分离窗口
    participant B as 通信总线
    participant M as 主窗口
  
    D->>B: handshake {windowType, componentId}
    B->>M: 转发 handshake
    M->>M: 注册窗口信息
    M->>B: handshake (回应)
    B->>D: 转发 handshake
  
    Note over M: 触发 onConnect 事件
  
    M->>B: state-sync {chat-messages, isFull:true, data:[...]}
    M->>B: state-sync {chat-session, isFull:true, data:{...}}
    M->>B: state-sync {chat-agent, isFull:true, data:{...}}
  
    B->>D: 转发 state-sync (messages)
    B->>D: 转发 state-sync (session)
    B->>D: 转发 state-sync (agent)
  
    D->>D: 更新本地状态
    D->>D: 渲染UI
```

#### 4.3.2 用户操作流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant D as 分离窗口
    participant B as 通信总线
    participant M as 主窗口
    participant S as Store
  
    U->>D: 点击发送
    D->>D: 生成 requestId + idempotencyKey
    D->>B: action-request {action:'send-message', params:{content}, requestId, idempotencyKey}
    B->>M: 转发 action-request
  
    M->>M: 检查幂等性
  
    alt 首次请求
        M->>S: sendMessage(content)
        S->>S: 更新消息列表
        S->>M: 触发 watch
        M->>B: state-sync {chat-messages, version++, patches:[...]}
        M->>B: action-response {requestId, success:true}
    else 重复请求
        M->>B: action-response {requestId, success:true} (直接返回)
    end
  
    B->>D: 转发 state-sync
    D->>D: 应用状态更新
  
    B->>D: 转发 action-response
    D->>D: 解析响应，清理监听器
```

---

## 5. 关键技术约束

### 5.1 单例模式

**要求**: `WindowSyncBus` 必须在整个应用中全局唯一

**实现约束**:
- 使用模块级别的单例变量
- 提供 `getOrCreateInstance()` 工厂函数
- 禁止直接构造函数调用

### 5.2 增量更新策略

**触发条件**:
```
if (enableDelta && lastSyncedValue !== null) {
  patches = diff(lastValue, newValue)

  if (size(patches) < size(newValue) * deltaThreshold) {
    发送 patches
  } else {
    发送 full data
  }
}
```

**默认参数**:
- `enableDelta`: `true`
- `deltaThreshold`: `0.5`
- `debounce`: `100ms`

### 5.3 幂等性保证

**机制**:
1. 客户端生成唯一的 `idempotencyKey`
2. 服务端维护已处理键的缓存（LRU，最大1000条）
3. 重复请求直接返回成功响应

**键生成规则**:
```
idempotencyKey = `${action}-${用户ID}-${关键参数Hash}-${时间戳窗口}`
```

### 5.4 错误处理

**超时策略**:
- `action-request` 超时: 10秒
- `heartbeat` 超时: 60秒

**重试策略**:
- 最大重试次数: 3次
- 退避算法: 指数退避 (500ms * 2^attempt)

**降级策略**:
- 主窗口不可达 → 分离窗口进入只读模式
- 显示警告提示: "连接已断开，当前为只读模式"

---

## 6. 组件接口规格

### 6.1 WindowSyncBus 接口

```typescript
interface WindowSyncBus {
  // 基础信息
  readonly windowLabel: string
  readonly windowType: 'main' | 'detached-component' | 'detached-tool'
  readonly connectedWindows: ReadonlyMap<string, WindowInfo>

  // 状态同步
  syncState(stateType: string, data: any, version: number, target?: string): Promise<void>

  // 操作请求
  requestAction<TParams, TResult>(
    action: string, 
    params: TParams, 
    options?: {retries?: number, idempotencyKey?: string}
  ): Promise<TResult>

  // 操作处理（主窗口）
  onActionRequest(handler: (action: string, params: any) => Promise<any>): UnlistenFn

  // 消息监听
  onMessage<TPayload>(type: WindowMessageType, handler: MessageHandler<TPayload>): Promise<UnlistenFn>

  // 连接事件
  onConnect(handler: (windowLabel: string) => void): UnlistenFn
  onDisconnect(handler: (windowLabel: string) => void): UnlistenFn

  // 生命周期
  cleanup(): void
}
```

### 6.2 StateSyncEngine 接口

```typescript
interface StateSyncEngine<T> {
  readonly stateKey: string
  readonly stateVersion: Ref<number>

  // 配置
  readonly autoPush: boolean
  readonly autoReceive: boolean
  readonly enableDelta: boolean

  // 手动控制
  manualPush(): Promise<void>
  manualReceive(newValue: T): void

  // 生命周期
  cleanup(): void
}
```

---

## 7. 实施策略

### 7.1 迁移路径

```mermaid
graph LR
    A[Phase 0<br/>修正关键问题] --> B[Phase 1<br/>构建通信层]
    B --> C[Phase 2<br/>Adapter改造]
    C --> D[Phase 3<br/>完整测试]
  
    A1[类型定义修正<br/>单例模式实现] -.-> A
    B1[WindowSyncBus<br/>StateSyncEngine] -.-> B
    C1[分离UI组件<br/>创建Adapter] -.-> C
    D1[E2E测试<br/>性能验证] -.-> D
```

### 7.2 验收标准

| 指标 | 目标值 | 测试方法 |
|-----|--------|---------|
| 消息推送延迟 | < 50ms | 时间戳对比 |
| 增量更新生效率 | > 80% | 日志统计 |
| 5000条消息同步 | < 200ms | 性能测试 |
| 断线重连成功率 | > 99% | 压力测试 |
| 操作幂等性 | 100% | 重复请求测试 |

### 7.3 关键里程碑

- ✅ **M1**: 通信层通过单元测试（握手、同步、请求-响应）
- ✅ **M2**: LLM Chat 完成 Adapter 改造，主/分离窗口功能对等
- ✅ **M3**: 所有组件分支逻辑 (`if isDetached`) 清理完毕
- ✅ **M4**: E2E 测试覆盖率 > 80%

---

## 8. 附录

### 8.1 术语表

| 术语 | 定义 |
|-----|------|
| 主窗口 | 拥有 Pinia Store 的权威窗口，所有状态修改的唯一来源 |
| 分离窗口 | 工具或组件的独立窗口，只读视图 + 操作代理 |
| 状态同步 | 主窗口主动推送状态到分离窗口 |
| 操作代理 | 分离窗口将用户操作转发到主窗口执行 |
| 幂等性 | 同一操作多次执行与一次执行结果相同 |
| 增量更新 | 仅传输状态的变化部分，而非完整数据 |

### 8.2 依赖库

| 库名 | 版本 | 用途 |
|-----|------|------|
| `fast-json-patch` | ^3.1.1 | 计算和应用 JSON 增量 |
| `@tauri-apps/api` | ^2.x | Tauri 窗口和事件通信 |
| `vue` | ^3.x | 响应式状态管理 |
| `pinia` | ^2.x | 主窗口状态存储 |

---

**文档版本**: 3.0 (架构版)
**最后更新**: 2025-01-XX
**输出格式**: 机器可读规格说明
**下游处理**: AI 编码助手自动实现