use font_kit::source::SystemSource;
use std::collections::BTreeSet;

#[tauri::command]
pub fn get_system_fonts() -> Result<Vec<String>, String> {
    let source = SystemSource::new();
    let families = source.all_families().map_err(|e| e.to_string())?;

    // 去重 + 排序（BTreeSet 自动排序）
    let unique: BTreeSet<String> = families
        .into_iter()
        .filter(|name| !name.starts_with('.')) // 过滤隐藏字体
        .collect();

    Ok(unique.into_iter().collect())
}
