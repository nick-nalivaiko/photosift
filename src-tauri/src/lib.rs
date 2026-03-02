mod sidecar;
mod commands;

use sidecar::SidecarState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState::new())
        .invoke_handler(tauri::generate_handler![
            commands::init_engine,
            commands::shutdown_engine,
            commands::add_reference,
            commands::remove_reference,
            commands::clear_references,
            commands::start_sorting,
            commands::pause_sorting,
            commands::resume_sorting,
            commands::stop_sorting,
            commands::get_system_info,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<SidecarState>() {
                    sidecar::kill_sidecar(&state);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
