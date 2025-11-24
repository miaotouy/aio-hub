import { RenderPreset } from '../types';

export const complexRenderingTestPreset: RenderPreset = {
  id: "complex-rendering-test",
  name: "模拟科幻感量子协议监控台",
  description: "高强度渲染测试：SVG绘图、CSS变量深度集成、复杂Grid布局、KaTeX、Mermaid、嵌套HTML与思考链混合",
  content: `<think>
正在初始化渲染引擎压力测试协议...
[系统自检] 核心温度正常
[加载模块] KaTeX... OK
[加载模块] Mermaid... OK
[加载模块] HTML Parser V2... 
[加载模块] SVG Renderer... OK
[加载模块] CSS Variable Injector... OK

<think>检测到深层嵌套结构，启动递归解析模式...</think> OK

正在尝试解码加密的量子态数据流...
分析波函数坍缩概率... $\\psi(x) = \\sum_{n=0}^{\\infty} c_n \\phi_n(x)$
解码完成。准备渲染仪表盘。
</think>

<div style="font-family: 'JetBrains Mono', Consolas, monospace; background: var(--vscode-editor-background); color: var(--text-color); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">

  <!-- Header -->
  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 20px;">
    <div style="display: flex; align-items: center; gap: 15px;">
      <div style="width: 40px; height: 40px; background: linear-gradient(135deg, var(--primary-color), var(--el-color-success)); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px var(--primary-color-light-5, rgba(64, 158, 255, 0.5));">
        <span style="font-size: 20px;">⚛️</span>
      </div>
      <div>
        <h2 style="margin: 0; font-size: 1.5em; color: var(--primary-color);">QECP 状态监控 V2</h2>
        <div style="font-size: 0.8em; color: var(--text-color-secondary);">Quantum Entanglement Communication Protocol v3.0</div>
      </div>
    </div>
    <div style="text-align: right;">
      <div style="background: var(--el-color-success-light-9); color: var(--el-color-success); padding: 4px 12px; border-radius: 100px; font-size: 0.85em; border: 1px solid var(--el-color-success-light-5); display: flex; align-items: center; gap: 6px;">
        <span style="display: inline-block; width: 8px; height: 8px; background: var(--el-color-success); border-radius: 50%; box-shadow: 0 0 8px var(--el-color-success);"></span>
        SYSTEM ONLINE
      </div>
    </div>
  </div>

  <!-- Grid Layout Dashboard -->
  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
    
    <!-- Panel 1: Theoretical Model (KaTeX & Markdown) -->
    <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px;; backdrop-filter: blur(var(--ui-blur))">
      <h3 style="margin-top: 0; border-bottom: 1px solid var(--border-color-light); padding-bottom: 10px; font-size: 1em; color: var(--el-color-warning);">
        📐 理论模型参数
      </h3>
      <p style="font-size: 0.9em; color: var(--text-color-secondary);">当前纠缠对的贝尔态密度矩阵：</p>
      
      $$
      \\rho = \\frac{1}{2} \\left( |00\\rangle + |11\\rangle \\right) \\left( \\langle 00| + \\langle 11| \\right)
      $$
      
      <div style="margin-top: 10px; font-size: 0.9em; margin-bottom: 15px;">
        **关键指标监控：**
        - 保真度 (Fidelity): $F(\\rho, \\sigma) = \\left( \\text{tr} \\sqrt{\\sqrt{\\rho} \\sigma \\sqrt{\\rho}} \\right)^2 \\approx 0.998$
        - 纠缠熵: $S(\\rho_A) = -\\text{tr}(\\rho_A \\ln \\rho_A) = 1$
        - 违反 CHSH 不等式: $S = 2\\sqrt{2} > 2$
      </div>

      <!-- New Section: Bloch Sphere Visualization (Full Width) -->
      <div style="border-top: 1px dashed var(--border-color); padding-top: 15px;">
        <h4 style="margin: 0 0 15px 0; font-size: 0.9em; color: var(--el-color-primary); text-align: center;">🔵 量子比特状态投影 (Bloch Sphere Projection)</h4>
        
        <div style="display: flex; flex-direction: column; gap: 15px;">
          <!-- SVG: Dual Qubit State (Centered & Larger) -->
          <div style="display: flex; justify-content: center; background: var(--container-bg); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color-light);">
            <svg width="240" height="120" viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg">
              <!-- Qubit A -->
              <circle cx="60" cy="60" r="40" fill="none" stroke="var(--border-color)" stroke-width="1.5" />
              <ellipse cx="60" cy="60" rx="40" ry="12" fill="none" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="3 3" opacity="0.5" />
              <line x1="60" y1="60" x2="60" y2="25" stroke="var(--el-color-warning)" stroke-width="2.5" stroke-linecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="8s" repeatCount="indefinite" />
              </line>
              <text x="50" y="115" font-size="12" fill="var(--text-color-secondary)" font-family="monospace" font-weight="bold">|ψ⟩A</text>
  
              <!-- Qubit B -->
              <circle cx="180" cy="60" r="40" fill="none" stroke="var(--border-color)" stroke-width="1.5" />
              <ellipse cx="180" cy="60" rx="40" ry="12" fill="none" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="3 3" opacity="0.5" />
              <line x1="180" y1="60" x2="180" y2="95" stroke="var(--el-color-primary)" stroke-width="2.5" stroke-linecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 180 60" to="-360 180 60" dur="8s" repeatCount="indefinite" />
              </line>
              <text x="170" y="115" font-size="12" fill="var(--text-color-secondary)" font-family="monospace" font-weight="bold">|φ⟩B</text>
  
              <!-- Entanglement Link (More Dynamic) -->
              <path d="M 105 60 Q 120 40 135 60" fill="none" stroke="var(--el-color-success)" stroke-width="2" stroke-dasharray="4 4">
                <animate attributeName="d" values="M 105 60 Q 120 40 135 60; M 105 60 Q 120 80 135 60; M 105 60 Q 120 40 135 60" dur="3s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.3; 1; 0.3" dur="1.5s" repeatCount="indefinite" />
              </path>
            </svg>
          </div>

          <!-- Parameter Matrix (Horizontal Layout) -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 0.8em;">
            <div style="background: var(--container-bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color-light); text-align: center;">
              <div style="color: var(--text-color-secondary); font-size: 0.8em; margin-bottom: 4px;">Alpha (α)</div>
              <div style="color: var(--el-color-primary); font-family: monospace; font-weight: bold;">0.707</div>
            </div>
            <div style="background: var(--container-bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color-light); text-align: center;">
              <div style="color: var(--text-color-secondary); font-size: 0.8em; margin-bottom: 4px;">Beta (β)</div>
              <div style="color: var(--el-color-warning); font-family: monospace; font-weight: bold;">0.707</div>
            </div>
            <div style="background: var(--container-bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color-light); text-align: center;">
              <div style="color: var(--text-color-secondary); font-size: 0.8em; margin-bottom: 4px;">Phase (θ)</div>
              <div style="color: var(--text-color); font-family: monospace; font-weight: bold;">π/4</div>
            </div>
            <div style="background: var(--container-bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color-light); text-align: center;">
              <div style="color: var(--text-color-secondary); font-size: 0.8em; margin-bottom: 4px;">Spin</div>
              <div style="color: var(--el-color-success); font-family: monospace; font-weight: bold;">SYNC</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Panel 2: Network Topology (Mermaid) -->
    <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px; backdrop-filter: blur(var(--ui-blur));">
      <h3 style="margin-top: 0; border-bottom: 1px solid var(--border-color-light); padding-bottom: 10px; font-size: 1em; color: var(--el-color-success);">
        🕸️ 网络拓扑状态
      </h3>
      
\`\`\`mermaid
graph TD
    subgraph Quantum Layer
        A[Alice Node] -->|Quantum Channel| B(Entanglement Source)
        B -->|EPR Pair| C[Bob Node]
    end
    subgraph Classical Layer
        A -.->|Classical Channel| C
        D[Eve Interceptor] -.->|Attempt| A
    end
    style A fill:#1f6feb,stroke:#fff,stroke-width:2px,color:#fff
    style C fill:#1f6feb,stroke:#fff,stroke-width:2px,color:#fff
    style B fill:#d2a8ff,stroke:#fff,stroke-width:2px,stroke-dasharray: 5 5
    style D fill:#cf222e,stroke:#fff,stroke-width:2px,color:#fff
\`\`\`
    </div>

  </div>

  <!-- Panel 3: SVG Visualization (New!) -->
  <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px; margin-bottom: 20px; backdrop-filter: blur(var(--ui-blur));">
    <h3 style="margin-top: 0; border-bottom: 1px solid var(--border-color-light); padding-bottom: 10px; font-size: 1em; color: var(--primary-color);">
      📡 相位干涉雷达 (SVG Rendering)
    </h3>
    <div style="display: flex; gap: 20px; align-items: center;">
      <div style="flex: 0 0 200px; display: flex; justify-content: center;">
        <!-- SVG Radar -->
        <svg width="180" height="180" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <!-- Grid Circles -->
          <circle cx="100" cy="100" r="90" fill="none" stroke="var(--border-color)" stroke-width="1" />
          <circle cx="100" cy="100" r="60" fill="none" stroke="var(--border-color)" stroke-width="1" opacity="0.5" />
          <circle cx="100" cy="100" r="30" fill="none" stroke="var(--border-color)" stroke-width="1" opacity="0.3" />
          
          <!-- Crosshair -->
          <line x1="10" y1="100" x2="190" y2="100" stroke="var(--border-color)" stroke-width="1" />
          <line x1="100" y1="10" x2="100" y2="190" stroke="var(--border-color)" stroke-width="1" />
          
          <!-- Data Path (Waveform) -->
          <path d="M 20 100 Q 50 20 100 100 T 180 100" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" />
          
          <!-- Active Points -->
          <circle cx="50" cy="60" r="4" fill="var(--el-color-success)">
            <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="150" cy="140" r="4" fill="var(--el-color-danger)">
            <animate attributeName="r" values="4;6;4" dur="1.5s" repeatCount="indefinite" />
          </circle>
          
          <!-- Scanning Line -->
          <line x1="100" y1="100" x2="100" y2="10" stroke="var(--el-color-success)" stroke-width="2" stroke-opacity="0.5">
            <animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="4s" repeatCount="indefinite" />
          </line>
        </svg>
      </div>
      <div style="flex: 1; font-size: 0.9em;">
        <div style="margin-bottom: 10px;">
          <strong>干扰源定位：</strong> <span style="color: var(--el-color-danger);">扇区 A-7 (检测到异常)</span>
        </div>
        <div style="margin-bottom: 10px;">
          <strong>相位漂移：</strong> <span style="color: var(--el-color-warning);">Δφ = 0.04π</span>
        </div>
        <div style="background: var(--container-bg); padding: 10px; border-radius: 4px; border: 1px solid var(--border-color-light);">
          <code style="color: var(--el-color-info); font-size: 0.85em;">
            > Scanning frequency: 400THz<br>
            > Calibrating interferometers...<br>
            > Target locked: 2 entities
          </code>
        </div>
      </div>
    </div>
  </div>

  <!-- Panel 4: Data Stream (Complex Table) -->
  <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px; margin-bottom: 20px; backdrop-filter: blur(var(--ui-blur));">
    <h3 style="margin-top: 0; border-bottom: 1px solid var(--border-color-light); padding-bottom: 10px; font-size: 1em; color: var(--el-color-warning);">
      📊 实时数据流缓冲
    </h3>
    
    <!-- Markdown Table inside HTML container -->
    | 缓冲区 ID | 负载内容 (Payload) | 完整性校验 | 处理进度 |
    | :--- | :--- | :--- | :--- |
    | \`0x1A4F\` | **Key_Gen_Init** | $\\checkmark$ Pass | <div style="width: 100px; height: 6px; background: var(--border-color); border-radius: 3px;"><div style="width: 100%; height: 100%; background: var(--el-color-success); border-radius: 3px;"></div></div> |
    | \`0x1A50\` | \`{ "vector": [0, 1] }\` | $\\checkmark$ Pass | <div style="width: 100px; height: 6px; background: var(--border-color); border-radius: 3px;"><div style="width: 85%; height: 100%; background: var(--el-color-success); border-radius: 3px;"></div></div> |
    | \`0x1A51\` | *Noise_Correction* | ⚠️ **Warn** | <div style="width: 100px; height: 6px; background: var(--border-color); border-radius: 3px;"><div style="width: 45%; height: 100%; background: var(--el-color-warning); border-radius: 3px;"></div></div> |
    | \`0x1A52\` | ~~Decoherence~~ | ❌ **Fail** | <div style="width: 100px; height: 6px; background: var(--border-color); border-radius: 3px;"><div style="width: 10%; height: 100%; background: var(--el-color-danger); border-radius: 3px;"></div></div> |

  </div>

  <!-- Panel 5: System Logs (Nested Details) -->
  <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px; backdrop-filter: blur(var(--ui-blur));">
    <h3 style="margin-top: 0; border-bottom: 1px solid var(--border-color-light); padding-bottom: 10px; font-size: 1em; color: var(--el-color-info);">
      📜 系统日志 (Level 3)
    </h3>

    <details>
      <summary style="cursor: pointer; color: var(--text-color-secondary); padding: 5px 0;">点击展开详细调试日志</summary>
      
      <div style="padding: 10px; background: var(--container-bg); border-radius: 4px; margin-top: 10px; border: 1px solid var(--border-color);">
        
        **2025-11-24 16:20:01** [INFO] 初始化量子存储器...
        
        <details>
          <summary style="cursor: pointer; color: var(--primary-color); font-size: 0.9em;">查看内存堆栈快照</summary>
          
\`\`\`rust
struct QuantumMemory {
    qubits: Vec<Qubit>,
    coherence_time: Duration,
    error_rate: f64,
}

impl QuantumMemory {
    fn stabilize(&mut self) -> Result<(), DecoherenceError> {
        // 正在应用纠错码...
        self.apply_shor_code();
        Ok(())
    }
}
\`\`\`
        </details>

        **2025-11-24 16:20:05** [WARN] 发现退相干噪声，启动补偿算法。
        > 补偿系数: $\\alpha = 0.95e^{-i\\phi}$
        
        <div style="margin-top: 10px; padding: 8px; border-left: 3px solid var(--el-color-danger); background: var(--el-color-danger-light-9);">
          <strong>CRITICAL ERROR:</strong> 
          检测到外部探针尝试读取量子态，自毁程序已就绪。
        </div>
      </div>
    </details>
  </div>

</div>

<!-- Footer -->
<div style="text-align: center; margin-top: 20px; color: var(--text-color-secondary); font-size: 0.8em;">
  Rendered by **RichTextRenderer V2** | <span style="color: var(--el-color-success);">All Systems Operational</span>
</div>
`,
};