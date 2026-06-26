# PPT/PPTX 附件全链路支持与自动转换计划

本计划旨在为 AIO Hub 的附件系统提供完整的 PPT/PPTX 支持。通过复刻现有的 `.doc` -> `.docx` 自动转换与解析链路，实现新版 `.pptx` 的直接发送，以及旧版 `.ppt` 的自动转换与发送。

## 1. 现状分析

1. **新版 PPT (`.pptx`)**：
   - MIME 类型为 `application/vnd.openxmlformats-officedocument.presentationml.presentation`。
   - 在前端 `determineAssetType` 中匹配 `officedocument` 前缀，已被归类为 `"document"`。
   - 在 `asset-resolver.ts` 中会作为原生文档转成 Base64 发送给模型。
   - **痛点**：如果模型不支持原生文档，目前没有前端文本提取器。

2. **旧版 PPT (`.ppt`)**：
   - MIME 类型为 `application/vnd.ms-powerpoint`。
   - 在前端 `determineAssetType` 中不匹配任何文档前缀，被归类为 `"other"`。
   - 在 `asset-resolver.ts` 中，`"other"` 类型的附件会被直接跳过，导致**完全无法发送**。

## 2. 总体设计方案

我们将参考 `.doc` 的处理链路，实现以下全链路支持：

```
[用户上传 .ppt] ──> [Rust 后端检测到旧版 PPT] ──> [调用 LibreOffice 转换为 .pptx] ──> [以 .pptx 入库]
                                                                                   │
                                                                                   ▼
[用户上传 .pptx] ───────────────────────────────────────────────────────────> [归类为 "document"]
                                                                                   │
                                                                                   ▼
                                                                      [Base64 资源解析器]
                                                                                   │
                                                                                   ▼
                                                                      [发送给支持原生文档的模型]
```

### 2.1 前端：文件类型与 UI 适配

- 修改 `src/utils/fileTypeDetector.ts` 中的 `determineAssetType`，将 `.ppt`（`application/vnd.ms-powerpoint`）和 `.xls`（`application/vnd.ms-excel`）也归类为 `"document"`。
- 这样它们在前端会自动显示为文档长条卡片，并支持拖拽、预览等操作。

### 2.2 后端：旧版 `.ppt` 自动转换为 `.pptx`

- 在 Rust 后端 `config.rs` 中，新增 `is_legacy_ppt_document` 判定。
- 在 `document_converter.rs` 的 `prepare_import_source` 中，当检测到旧版 `.ppt` 时，调用 LibreOffice 或 Microsoft Office (PowerPoint COM) 转换器将其自动转换为 `.pptx`，然后再入库。
- **多后端支持**：
  - **LibreOffice**：跨平台支持，使用 `--convert-to pptx` 参数。
  - **Microsoft Office (PowerPoint COM)**：Windows 平台特有，通过 PowerShell 调用 `PowerPoint.Application` COM 自动化接口，在后台静默打开并另存为 `.pptx`。
- **安全降级**：如果当前配置的转换器不支持 PPT 转换（如 AbiWord、macOS textutil 等），则优雅降级，不进行转换，直接按原文件入库，并给出友好提示。

### 2.3 前端 UI：设置页面适配

- 在 `DocumentConversionSettingsDialog.vue` 中，将文案和逻辑从“自动转换旧版 DOC”扩展为“自动转换旧版 DOC/PPT”。

---

## 3. 详细修改范围与代码差异

### 3.1 前端：`src/utils/fileTypeDetector.ts`

修改 `determineAssetType` 函数，增加对 `.ppt` 和 `.xls` 的 MIME 类型前缀匹配：

```typescript
<<<<<<< SEARCH
export function determineAssetType(mimeType: string): Asset["type"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType.startsWith("application/pdf") ||
    mimeType.startsWith("application/msword") ||
    mimeType.startsWith("application/vnd.openxmlformats-officedocument") ||
    mimeType.startsWith("text/") ||
    isTextMimeType(mimeType)
  ) {
    return "document";
  }
  return "other";
}
=======
export function determineAssetType(mimeType: string): Asset["type"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType.startsWith("application/pdf") ||
    mimeType.startsWith("application/msword") ||
    mimeType.startsWith("application/vnd.ms-powerpoint") || // 旧版 PPT
    mimeType.startsWith("application/vnd.ms-excel") || // 旧版 Excel
    mimeType.startsWith("application/vnd.openxmlformats-officedocument") || // docx, xlsx, pptx
    mimeType.startsWith("text/") ||
    isTextMimeType(mimeType)
  ) {
    return "document";
  }
  return "other";
}
>>>>>>> REPLACE
```

### 3.2 后端：`src-tauri/src/commands/document_converter/config.rs`

新增 `is_legacy_ppt_document` 判定函数，并导出：

```rust
pub fn is_legacy_ppt_document(path: &Path, mime: &str) -> bool {
    path.extension()
        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("ppt"))
        .unwrap_or(false)
        || mime.starts_with("application/vnd.ms-powerpoint")
}
```

### 3.3 后端：`src-tauri/src/commands/document_converter/libreoffice.rs`

新增 `convert_legacy_ppt_to_pptx` 函数，用于将 `.ppt` 转换为 `.pptx`：

```rust
/// 使用 LibreOffice 将旧版 PPT 转换为 PPTX
pub async fn convert_legacy_ppt_to_pptx(
    source_path: &Path,
    output_dir: &Path,
    config: &DocumentConversionConfig,
) -> Result<PathBuf, String> {
    fs::create_dir_all(output_dir).map_err(|e| format!("创建文档转换目录失败: {}", e))?;

    let mut args = vec![
        "--headless".to_string(),
        "--nologo".to_string(),
        "--nofirststartwizard".to_string(),
        "--nolockcheck".to_string(),
        "--nodefault".to_string(),
    ];

    let profile_dir = if config.isolated_profile {
        let profile_dir = make_libreoffice_profile_dir()?;
        args.push(libreoffice_user_installation_arg(&profile_dir));
        Some(profile_dir)
    } else {
        None
    };

    args.extend([
        "--convert-to".to_string(),
        "pptx".to_string(),
        "--outdir".to_string(),
        output_dir.to_string_lossy().to_string(),
        source_path.to_string_lossy().to_string(),
    ]);

    let mut command = Command::new(config.libre_office_path.trim());
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = timeout(
        Duration::from_secs(config.timeout_seconds.max(10)),
        command.args(&args).output(),
    )
    .await
    .map_err(|_| "旧版 PPT 转换超时".to_string())?
    .map_err(|e| format!("执行 LibreOffice 失败: {}", e))?;

    if let Some(dir) = profile_dir {
        let _ = fs::remove_dir_all(dir);
    }

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("LibreOffice 转换失败: {}{}", stderr, stdout));
    }

    let stem = source_path
        .file_stem()
        .ok_or_else(|| "无法获取 PPT 文件名".to_string())?
        .to_string_lossy();
    let expected_path = output_dir.join(format!("{}.pptx", stem));
    if expected_path.exists() {
        return Ok(expected_path);
    }

    fs::read_dir(output_dir)
        .map_err(|e| format!("读取文档转换目录失败: {}", e))?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.extension()
                .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("pptx"))
                .unwrap_or(false)
        })
        .ok_or_else(|| "LibreOffice 已结束，但未找到转换后的 PPTX 文件".to_string())
}
```

### 3.4 后端：`src-tauri/src/commands/document_converter.rs`

修改 `prepare_import_source` 函数，使其支持 PPT 转换，并在非 LibreOffice 转换器时优雅降级：

```rust
// 导入新函数
pub use config::{active_document_conversion_config, is_legacy_word_document, is_legacy_ppt_document};

// 在 prepare_import_source 内部：
    let mime_type = crate::utils::mime::guess_mime_type(original_path);
    let is_doc = is_legacy_word_document(original_path, &mime_type);
    let is_ppt = is_legacy_ppt_document(original_path, &mime_type);

    if !is_doc && !is_ppt {
        return Ok(PreparedImportSource {
            path: original_path.to_path_buf(),
            cleanup_dir: None,
            warnings: Vec::new(),
        });
    }
```

在解析出转换器后，增加对 PPT 的转换器类型校验与降级提示：

```rust
    let resolved = match resolve_converter(conv_config).await {
        Ok(resolved) => {
            if is_ppt && resolved.provider != DocumentConverterProvider::LibreOffice {
                log::info!(
                    "[DocumentConverter] 检测到旧版 PPT，但当前转换器 {} 不支持 PPT 转换，按原文件入库: {}",
                    resolved.provider.label(),
                    original_path_str
                );
                let mut warning = converter_not_configured_warning(&file_name, original_path_str);
                warning.title = "旧版 PPT 未自动转换".to_string();
                warning.message = format!(
                    "检测到旧版 PowerPoint PPT 文件「{}」，但当前配置的转换器 {} 不支持 PPT 转换（仅 LibreOffice 支持）。文件已按原始 .ppt 入库，预览或后续处理可能受限。请在设置中配置并启用 LibreOffice 转换器。",
                    file_name,
                    resolved.provider.label()
                );
                return Ok(PreparedImportSource {
                    path: original_path.to_path_buf(),
                    cleanup_dir: None,
                    warnings: vec![warning],
                });
            }
            resolved
        }
        Err(message) => {
            // 原有错误处理逻辑...
        }
    };
```

在执行转换时，根据文件类型调用不同的转换函数：

```rust
    let converted_path = if is_ppt {
        libreoffice::convert_legacy_ppt_to_pptx(original_path, &output_dir, &resolved.config).await?
    } else {
        convert_legacy_doc_to_docx(original_path, &output_dir, &resolved).await?
    };
```

### 3.5 前端 UI：`src/tools/asset-manager/components/DocumentConversionSettingsDialog.vue`

修改设置页面的文案，使其更准确：

```vue
<<<<<<< SEARCH
      <div class="setting-item">
        <div class="setting-label">自动转换旧版 DOC</div>
        <el-switch v-model="localSettings.autoConvertLegacyDoc" />
      </div>
=======
      <div class="setting-item">
        <div class="setting-label">自动转换旧版 DOC/PPT</div>
        <el-switch v-model="localSettings.autoConvertLegacyDoc" />
      </div>
>>>>>>> REPLACE
```

---

## 4. 验证与测试计划

1. **前端类型检测验证**：
   - 拖入 `.pptx` 文件，验证其是否被正确识别为 `"document"`，并渲染为长条卡片。
   - 拖入 `.ppt` 文件，验证其是否被正确识别为 `"document"`，并渲染为长条卡片。

2. **后端自动转换验证**：
   - 在资产管理器设置中启用 LibreOffice 转换器。
   - 导入一个旧版 `.ppt` 文件，验证其是否在后台被自动转换为 `.pptx`，并以 `.pptx` 格式成功入库。
   - 切换转换器为 Microsoft Word COM，导入 `.ppt` 文件，验证其是否优雅降级，按原 `.ppt` 入库并弹出“未自动转换”的警告提示。

3. **发送端验证**：
   - 在 `llm-chat` 中，添加一个 `.pptx` 附件，选择支持原生文档的模型（如 Claude 3.5 Sonnet），发送消息，验证模型是否能正确读取并回答 PPT 中的内容。
