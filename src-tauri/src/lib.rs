mod capture;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            capture::list_sources,
            capture::primary_bounds,
            capture::capture_monitor,
            capture::capture_window,
            capture::capture_region,
            capture::load_library,
            capture::save_library,
            capture::load_image,
            capture::pick_save_path,
            capture::write_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Screentrics");
}
