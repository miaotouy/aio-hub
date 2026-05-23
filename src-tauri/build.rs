fn main() {
    // 监听 public/skills 目录变化，确保 dev 模式下资源文件变更能触发重编译
    println!("cargo:rerun-if-changed=../public/skills");
    tauri_build::build()
}
