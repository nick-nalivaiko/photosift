use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::sync::{mpsc, Mutex};
use std::thread;
use tauri::{AppHandle, Manager, Emitter};

// ── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<u64>,
    pub method: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<serde_json::Value>,
    // For notifications:
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

type RpcResult = Result<serde_json::Value, String>;

// ── Sidecar State ──────────────────────────────────────────────────────

pub struct SidecarState {
    pub process: Mutex<Option<Child>>,
    pub request_id: Mutex<u64>,
    pub pending_requests: Mutex<HashMap<u64, mpsc::Sender<RpcResult>>>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            request_id: Mutex::new(0),
            pending_requests: Mutex::new(HashMap::new()),
        }
    }

    pub fn next_id(&self) -> u64 {
        let mut id = self.request_id.lock().unwrap();
        *id += 1;
        *id
    }
}

// ── Sidecar Management ────────────────────────────────────────────────

pub fn get_sidecar_path(app: &AppHandle) -> std::path::PathBuf {
    let resource_dir = app
        .path()
        .resource_dir()
        .expect("Failed to get resource dir");
    
    #[cfg(target_os = "windows")]
    let candidates = [
        resource_dir.join("binaries").join("photosift-engine-x86_64-pc-windows-msvc.exe"),
        resource_dir.join("binaries").join("photosift-engine.exe"),
        resource_dir.join("photosift-engine-x86_64-pc-windows-msvc.exe"),
        resource_dir.join("photosift-engine.exe"),
    ];
    #[cfg(not(target_os = "windows"))]
    let candidates = [
        resource_dir.join("binaries").join("photosift-engine"),
        resource_dir.join("photosift-engine"),
        resource_dir.join("binaries").join("photosift-engine"),
        resource_dir.join("photosift-engine"),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return candidate.clone();
        }
    }

    // Fallback: return the first candidate (will trigger dev-mode Python fallback)
    candidates[0].clone()
}

pub fn spawn_sidecar(app: &AppHandle, state: &tauri::State<'_, SidecarState>) -> Result<(), String> {
    let mut proc_lock = state.process.lock().unwrap();
    if proc_lock.is_some() {
        return Ok(());  // Already running
    }

    let sidecar_path = get_sidecar_path(app);
    
    let mut child = if sidecar_path.exists() {
        Command::new(&sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW on Windows
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?
    } else {
        // Dev mode: run Python directly from the .venv
        let project_root = std::env::current_dir()
            .unwrap()
            .parent()
            .unwrap_or(&std::env::current_dir().unwrap())
            .to_path_buf();
            
        let python_exe = project_root
            .join("python-engine")
            .join(".venv")
            .join("Scripts")
            .join("python.exe");
            
        let python_script = project_root
            .join("python-engine")
            .join("main.py");
        
        Command::new(&python_exe)
            .arg(&python_script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("Failed to spawn Python sidecar: {}", e))?
    };

    let stdout = child.stdout.take().ok_or("Failed to capture sidecar stdout")?;
    *proc_lock = Some(child);
    
    // Spawn reader thread
    let app_handle = app.clone();
    
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        while let Ok(bytes) = reader.read_line(&mut line) {
            if bytes == 0 {
                break; // EOF
            }
            if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(&line) {
                if let Some(id) = response.id {
                    let state = app_handle.state::<SidecarState>();
                    let mut reqs = state.pending_requests.lock().unwrap();
                    if let Some(sender) = reqs.remove(&id) {
                        if let Some(error) = response.error {
                            let _ = sender.send(Err(format!("Sidecar error: {}", error)));
                        } else {
                            let _ = sender.send(Ok(response.result.unwrap_or(serde_json::Value::Null)));
                        }
                    }
                } else if let Some(method) = response.method {
                    // It's a notification from Python! Emit it to React.
                    let params = response.params.unwrap_or(serde_json::Value::Null);
                    let _ = app_handle.emit(&method, params);
                }
            } else {
                eprintln!("Failed to parse JSON-RPC from Sidecar: {}", line);
            }
            line.clear();
        }
    });

    Ok(())
}

pub fn send_request(
    state: &tauri::State<'_, SidecarState>,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut proc_lock = state.process.lock().unwrap();
    let child = proc_lock.as_mut().ok_or("Sidecar not running")?;

    let id = state.next_id();
    let request = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: Some(id),
        method: method.to_string(),
        params,
    };

    let mut request_str = serde_json::to_string(&request)
        .map_err(|e| format!("Serialization error: {}", e))?;
    request_str.push('\n');

    let (tx, rx) = mpsc::channel();
    {
        let mut reqs = state.pending_requests.lock().unwrap();
        reqs.insert(id, tx);
    }

    // Write to stdin
    let stdin = child.stdin.as_mut().ok_or("No stdin")?;
    stdin
        .write_all(request_str.as_bytes())
        .map_err(|e| format!("Failed to write to sidecar: {}", e))?;
    stdin
        .flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;

    // Drop lock before waiting to prevent blocking process operations
    drop(proc_lock);

    // Block until response is received from stdout reader thread
    match rx.recv() {
        Ok(result) => result,
        Err(_) => Err("Failed to receive response from sidecar. Process might have crashed.".into()),
    }
}

pub fn kill_sidecar(state: &tauri::State<'_, SidecarState>) {
    let mut proc_lock = state.process.lock().unwrap();
    if let Some(mut child) = proc_lock.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}
