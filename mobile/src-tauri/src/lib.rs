// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod llm_file_transport;
mod token_counting;
mod validation;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(llm_file_transport::NativeRequestState::default())
        .manage(validation::ValidationState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            llm_file_transport::send_llm_file_request,
            llm_file_transport::cancel_llm_file_request,
            token_counting::count_tokens,
            token_counting::count_tokens_batch,
            validation::run_platform_file_validation,
            validation::cleanup_platform_file_validation,
            validation::terminate_for_validation,
            validation::prepare_sqlite_crash_validation,
            validation::run_sqlite_validation,
            validation::cancel_sqlite_validation,
            validation::reset_sqlite_validation_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
