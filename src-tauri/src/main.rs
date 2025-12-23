// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // 解决 WebKitGTK 在某些 Linux 发行版（如 Arch/CachyOS + Wayland）上的渲染崩溃问题
        // 主要是因为内置图形库与宿主系统 Mesa 驱动的 ABI 冲突
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    aio_hub_lib::run()
}
