use serde_json::json;
use tauri::State;
use crate::sidecar::{self, SidecarState};

// ── Init / Shutdown ────────────────────────────────────────────────────

#[tauri::command]
pub async fn init_engine(
    app: tauri::AppHandle,
    state: State<'_, SidecarState>,
) -> Result<serde_json::Value, String> {
    sidecar::spawn_sidecar(&app, &state)?;
    sidecar::send_request(&state, "init", json!({}))
}

#[tauri::command]
pub async fn shutdown_engine(
    state: State<'_, SidecarState>,
) -> Result<(), String> {
    sidecar::kill_sidecar(&state);
    Ok(())
}

// ── Reference Photos ───────────────────────────────────────────────────

#[tauri::command]
pub async fn add_reference(
    state: State<'_, SidecarState>,
    path: String,
    slot_id: Option<String>,
) -> Result<serde_json::Value, String> {
    sidecar::send_request(
        &state,
        "add_reference",
        json!({ "path": path, "slot_id": slot_id }),
    )
}

#[tauri::command]
pub async fn remove_reference(
    state: State<'_, SidecarState>,
    reference_id: String,
) -> Result<serde_json::Value, String> {
    sidecar::send_request(
        &state,
        "remove_reference",
        json!({ "reference_id": reference_id }),
    )
}

#[tauri::command]
pub async fn clear_references(
    state: State<'_, SidecarState>,
) -> Result<serde_json::Value, String> {
    sidecar::send_request(&state, "clear_references", json!({}))
}

// ── Sorting ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_sorting(
    state: State<'_, SidecarState>,
    config: serde_json::Value,
) -> Result<serde_json::Value, String> {
    sidecar::send_request(&state, "start_sorting", config)
}

#[tauri::command]
pub async fn pause_sorting(
    state: State<'_, SidecarState>,
) -> Result<serde_json::Value, String> {
    sidecar::send_request(&state, "pause", json!({}))
}

#[tauri::command]
pub async fn resume_sorting(
    state: State<'_, SidecarState>,
) -> Result<serde_json::Value, String> {
    sidecar::send_request(&state, "resume", json!({}))
}

#[tauri::command]
pub async fn stop_sorting(
    state: State<'_, SidecarState>,
) -> Result<serde_json::Value, String> {
    sidecar::send_request(&state, "stop", json!({}))
}

// ── System Info ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_system_info(
    state: State<'_, SidecarState>,
) -> Result<serde_json::Value, String> {
    sidecar::send_request(&state, "system_info", json!({}))
}
