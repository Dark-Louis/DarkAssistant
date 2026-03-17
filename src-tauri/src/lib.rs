mod airi_settings;

use airi_settings::{
    airi_delete_setting, airi_get_all_settings, airi_get_setting, airi_set_setting,
    airi_set_settings,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            airi_get_setting,
            airi_set_setting,
            airi_delete_setting,
            airi_get_all_settings,
            airi_set_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
