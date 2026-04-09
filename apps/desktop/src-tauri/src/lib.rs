use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::{IpAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::Manager;
use url::form_urlencoded;

const DEFAULT_OVERLAY_PORT: u16 = 31_847;
const APP_STATE_FILENAME: &str = "app-state.json";
const TWITCH_SESSION_FILENAME: &str = "twitch-session.dat";
const TIP_PROVIDER_SESSION_FILENAME: &str = "tip-provider-session.dat";
const PORTABLE_EXE_SUFFIX: &str = "-portable";
const PORTABLE_DATA_DIRNAME: &str = "data";
#[cfg(not(target_os = "windows"))]
const TWITCH_SESSION_SERVICE: &str = "subathon-timer-desktop";
#[cfg(not(target_os = "windows"))]
const TWITCH_SESSION_ACCOUNT: &str = "twitch-session";
#[cfg(not(target_os = "windows"))]
const TIP_PROVIDER_SESSION_SERVICE: &str = "subathon-timer-desktop";
#[cfg(not(target_os = "windows"))]
const TIP_PROVIDER_SESSION_ACCOUNT: &str = "tip-provider-session";
const LEXEND_REGULAR_TTF: &[u8] = include_bytes!("../../../../public/fonts/Lexend-Regular.ttf");
const LEXEND_BOLD_TTF: &[u8] = include_bytes!("../../../../public/fonts/Lexend-Bold.ttf");
const GRAPH_ICON_GIF: &[u8] = include_bytes!("../../public/assets/graph_icon.gif");

struct OverlayServerRuntime {
    overlay_base_url: Option<String>,
    overlay_preview_base_url: Option<String>,
    overlay_lan_base_url: Option<String>,
    overlay_lan_access_enabled: bool,
    shutdown: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
}

struct OverlayServerHandle {
    shared_state: Arc<RwLock<OverlayState>>,
    runtime: Mutex<OverlayServerRuntime>,
}

#[derive(Default)]
struct StreamlabsAuthRuntime {
    last_result: Option<StreamlabsOAuthResult>,
}

struct StreamlabsAuthHandle {
    runtime: Arc<Mutex<StreamlabsAuthRuntime>>,
}

impl Drop for OverlayServerHandle {
    fn drop(&mut self) {
        if let Ok(mut runtime) = self.runtime.lock() {
            stop_overlay_server(&mut runtime);
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverlayRule {
    label: String,
    value: String,
    marker_shape: Option<String>,
    marker_tone: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverlayPreviewState {
    eyebrow: String,
    title: String,
    summary: String,
    delta: String,
    tone: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverlayTransform {
    x: i32,
    y: i32,
    scale: f32,
}

impl Default for OverlayTransform {
    fn default() -> Self {
        Self {
            x: 0,
            y: 0,
            scale: 1.0,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WheelOverlaySegment {
    id: String,
    label: String,
    chance: String,
    outcome: String,
    outcome_type: String,
    color: Option<String>,
    min_subs: Option<u32>,
    time_delta_seconds: Option<i64>,
    timeout_seconds: Option<u32>,
    timeout_target: Option<String>,
    moderation_required: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WheelOverlaySpinState {
    status: String,
    active_segment_id: Option<String>,
    result_title: Option<String>,
    result_summary: Option<String>,
    requires_moderation: bool,
    auto_apply: bool,
    is_test: bool,
}

impl Default for WheelOverlaySpinState {
    fn default() -> Self {
        Self {
            status: "idle".into(),
            active_segment_id: None,
            result_title: None,
            result_summary: None,
            requires_moderation: false,
            auto_apply: false,
            is_test: false,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverlayState {
    timer_seconds: u64,
    uptime_seconds: u64,
    timer_status: String,
    timer_theme: String,
    timer_overlay_transform: OverlayTransform,
    reason_overlay_transform: OverlayTransform,
    wheel_overlay_transform: OverlayTransform,
    graph_points: Vec<u64>,
    wheel_segments: Vec<WheelOverlaySegment>,
    wheel_spin: WheelOverlaySpinState,
    wheel_text_scale: f32,
    incentive_rules: Vec<OverlayRule>,
    overlay_preview: OverlayPreviewState,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            timer_seconds: 6 * 60 * 60,
            uptime_seconds: 0,
            timer_status: "paused".into(),
            timer_theme: "app".into(),
            timer_overlay_transform: OverlayTransform::default(),
            reason_overlay_transform: OverlayTransform::default(),
            wheel_overlay_transform: OverlayTransform::default(),
            graph_points: vec![6 * 60 * 60],
            wheel_segments: vec![],
            wheel_spin: WheelOverlaySpinState::default(),
            wheel_text_scale: 0.55,
            incentive_rules: vec![
                OverlayRule {
                    label: "T1 Sub".into(),
                    value: "+60s".into(),
                    marker_shape: Some("square".into()),
                    marker_tone: Some("blue".into()),
                },
                OverlayRule {
                    label: "T2 Sub".into(),
                    value: "+120s".into(),
                    marker_shape: Some("square".into()),
                    marker_tone: Some("mint".into()),
                },
                OverlayRule {
                    label: "T3 Sub".into(),
                    value: "+300s".into(),
                    marker_shape: Some("square".into()),
                    marker_tone: Some("green".into()),
                },
                OverlayRule {
                    label: "100 Bits".into(),
                    value: "+12s".into(),
                    marker_shape: Some("diamond".into()),
                    marker_tone: Some("cyan".into()),
                },
            ],
            overlay_preview: OverlayPreviewState {
                eyebrow: "Recent event".into(),
                title: "Waiting for activity".into(),
                summary: "The next Twitch or manual timer event will appear here.".into(),
                delta: "+00:00".into(),
                tone: "neutral".into(),
            },
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
    overlay_base_url: Option<String>,
    overlay_preview_base_url: Option<String>,
    overlay_lan_base_url: Option<String>,
    overlay_lan_access_enabled: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamlabsOAuthResult {
    status: String,
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverlaySyncPayload {
    timer_seconds: u64,
    uptime_seconds: u64,
    timer_status: String,
    timer_theme: String,
    timer_overlay_transform: OverlayTransform,
    reason_overlay_transform: OverlayTransform,
    wheel_overlay_transform: OverlayTransform,
    graph_points: Vec<u64>,
    wheel_segments: Vec<WheelOverlaySegment>,
    wheel_spin: WheelOverlaySpinState,
    wheel_text_scale: f32,
    incentive_rules: Vec<OverlayRule>,
    overlay_preview: OverlayPreviewState,
}

fn portable_storage_dir() -> Result<Option<PathBuf>, String> {
    let exe_path = env::current_exe()
        .map_err(|error| format!("failed to resolve current executable path: {error}"))?;
    let stem = exe_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    if !stem.ends_with(PORTABLE_EXE_SUFFIX) {
        return Ok(None);
    }

    let Some(parent) = exe_path.parent() else {
        return Err("failed to resolve portable executable directory".into());
    };

    Ok(Some(parent.join(PORTABLE_DATA_DIRNAME)))
}

fn app_storage_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    if let Some(dir) = portable_storage_dir()? {
        return Ok(dir);
    }

    app.path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))
}

fn app_state_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app_storage_dir(app).map(|dir| dir.join(APP_STATE_FILENAME))
}

fn twitch_session_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app_storage_dir(app).map(|dir| dir.join(TWITCH_SESSION_FILENAME))
}

fn tip_provider_session_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<PathBuf, String> {
    app_storage_dir(app).map(|dir| dir.join(TIP_PROVIDER_SESSION_FILENAME))
}

fn load_native_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Option<Value>, String> {
    let path = app_state_path(app)?;

    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read native app state: {error}"))?;

    serde_json::from_str::<Value>(&raw)
        .map(Some)
        .map_err(|error| format!("failed to parse native app state: {error}"))
}

fn save_native_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    snapshot: &Value,
) -> Result<(), String> {
    let path = app_state_path(app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create app data dir: {error}"))?;
    }

    let payload = serde_json::to_vec_pretty(snapshot)
        .map_err(|error| format!("failed to serialize native app state: {error}"))?;
    let temp_path = path.with_extension("json.tmp");

    fs::write(&temp_path, payload)
        .map_err(|error| format!("failed to write native app state: {error}"))?;

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("failed to replace native app state: {error}"))?;
    }

    fs::rename(&temp_path, &path)
        .map_err(|error| format!("failed to finalize native app state: {error}"))?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn protect_session_payload(payload: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Error;
    use std::ptr::null_mut;
    use std::slice;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: payload.len() as u32,
        pbData: payload.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    let result = unsafe {
        CryptProtectData(
            &mut input,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };

    if result == 0 {
        return Err(format!(
            "failed to encrypt secure Twitch session: {}",
            Error::last_os_error()
        ));
    }

    let encrypted =
        unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(encrypted)
}

#[cfg(target_os = "windows")]
fn unprotect_session_payload(payload: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Error;
    use std::ptr::null_mut;
    use std::slice;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: payload.len() as u32,
        pbData: payload.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    let result = unsafe {
        CryptUnprotectData(
            &mut input,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };

    if result == 0 {
        return Err(format!(
            "failed to decrypt secure Twitch session: {}",
            Error::last_os_error()
        ));
    }

    let decrypted =
        unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(decrypted)
}

#[cfg(not(target_os = "windows"))]
fn twitch_session_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(TWITCH_SESSION_SERVICE, TWITCH_SESSION_ACCOUNT)
        .map_err(|error| format!("failed to initialize secure Twitch session storage: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn tip_provider_session_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(TIP_PROVIDER_SESSION_SERVICE, TIP_PROVIDER_SESSION_ACCOUNT)
        .map_err(|error| format!("failed to initialize secure tip provider session storage: {error}"))
}

#[cfg(target_os = "windows")]
fn load_native_twitch_session_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Option<Value>, String> {
    let path = twitch_session_path(app)?;

    if !path.exists() {
        return Ok(None);
    }

    let encrypted = fs::read(&path)
        .map_err(|error| format!("failed to read secure Twitch session: {error}"))?;
    let decrypted = unprotect_session_payload(&encrypted)?;
    let raw = String::from_utf8(decrypted)
        .map_err(|error| format!("failed to decode secure Twitch session: {error}"))?;

    serde_json::from_str::<Value>(&raw)
        .map(Some)
        .map_err(|error| format!("failed to parse secure Twitch session: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn load_native_twitch_session_snapshot() -> Result<Option<Value>, String> {
    let entry = twitch_session_entry()?;

    match entry.get_password() {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .map(Some)
            .map_err(|error| format!("failed to parse secure Twitch session: {error}")),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("failed to read secure Twitch session: {error}")),
    }
}

#[cfg(target_os = "windows")]
fn save_native_twitch_session_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    snapshot: &Value,
) -> Result<(), String> {
    let path = twitch_session_path(app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create secure Twitch session dir: {error}"))?;
    }

    let payload = serde_json::to_vec(snapshot)
        .map_err(|error| format!("failed to serialize secure Twitch session: {error}"))?;
    let encrypted = protect_session_payload(&payload)?;
    let temp_path = path.with_extension("dat.tmp");

    fs::write(&temp_path, encrypted)
        .map_err(|error| format!("failed to write secure Twitch session: {error}"))?;

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("failed to replace secure Twitch session: {error}"))?;
    }

    fs::rename(&temp_path, &path)
        .map_err(|error| format!("failed to finalize secure Twitch session: {error}"))?;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn save_native_twitch_session_snapshot(snapshot: &Value) -> Result<(), String> {
    let entry = twitch_session_entry()?;
    let payload = serde_json::to_string(snapshot)
        .map_err(|error| format!("failed to serialize secure Twitch session: {error}"))?;

    entry
        .set_password(&payload)
        .map_err(|error| format!("failed to store secure Twitch session: {error}"))
}

#[cfg(target_os = "windows")]
fn clear_native_twitch_session_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    let path = twitch_session_path(app)?;

    if !path.exists() {
        return Ok(());
    }

    fs::remove_file(&path)
        .map_err(|error| format!("failed to clear secure Twitch session: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn clear_native_twitch_session_snapshot() -> Result<(), String> {
    let entry = twitch_session_entry()?;

    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("failed to clear secure Twitch session: {error}")),
    }
}

#[cfg(target_os = "windows")]
fn load_native_tip_provider_session_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Option<Value>, String> {
    let path = tip_provider_session_path(app)?;

    if !path.exists() {
        return Ok(None);
    }

    let encrypted = fs::read(&path)
        .map_err(|error| format!("failed to read secure tip provider session: {error}"))?;
    let decrypted = unprotect_session_payload(&encrypted)?;
    let raw = String::from_utf8(decrypted)
        .map_err(|error| format!("failed to decode secure tip provider session: {error}"))?;

    serde_json::from_str::<Value>(&raw)
        .map(Some)
        .map_err(|error| format!("failed to parse secure tip provider session: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn load_native_tip_provider_session_snapshot() -> Result<Option<Value>, String> {
    let entry = tip_provider_session_entry()?;

    match entry.get_password() {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .map(Some)
            .map_err(|error| format!("failed to parse secure tip provider session: {error}")),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("failed to read secure tip provider session: {error}")),
    }
}

#[cfg(target_os = "windows")]
fn save_native_tip_provider_session_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    snapshot: &Value,
) -> Result<(), String> {
    let path = tip_provider_session_path(app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create secure tip provider session dir: {error}"))?;
    }

    let payload = serde_json::to_vec(snapshot)
        .map_err(|error| format!("failed to serialize secure tip provider session: {error}"))?;
    let encrypted = protect_session_payload(&payload)?;
    let temp_path = path.with_extension("dat.tmp");

    fs::write(&temp_path, encrypted)
        .map_err(|error| format!("failed to write secure tip provider session: {error}"))?;

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("failed to replace secure tip provider session: {error}"))?;
    }

    fs::rename(&temp_path, &path)
        .map_err(|error| format!("failed to finalize secure tip provider session: {error}"))?;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn save_native_tip_provider_session_snapshot(snapshot: &Value) -> Result<(), String> {
    let entry = tip_provider_session_entry()?;
    let payload = serde_json::to_string(snapshot)
        .map_err(|error| format!("failed to serialize secure tip provider session: {error}"))?;

    entry
        .set_password(&payload)
        .map_err(|error| format!("failed to store secure tip provider session: {error}"))
}

#[cfg(target_os = "windows")]
fn clear_native_tip_provider_session_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    let path = tip_provider_session_path(app)?;

    if !path.exists() {
        return Ok(());
    }

    fs::remove_file(&path)
        .map_err(|error| format!("failed to clear secure tip provider session: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn clear_native_tip_provider_session_snapshot() -> Result<(), String> {
    let entry = tip_provider_session_entry()?;

    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("failed to clear secure tip provider session: {error}")),
    }
}

fn load_overlay_lan_access_enabled<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    load_native_snapshot(app)
        .ok()
        .flatten()
        .and_then(|snapshot| {
            snapshot
                .get("settings")
                .and_then(|settings| settings.get("overlayLanAccessEnabled"))
                .and_then(Value::as_bool)
        })
        .unwrap_or(false)
}

fn build_bootstrap_state(runtime: &OverlayServerRuntime) -> BootstrapState {
    BootstrapState {
        overlay_base_url: runtime.overlay_base_url.clone(),
        overlay_preview_base_url: runtime.overlay_preview_base_url.clone(),
        overlay_lan_base_url: runtime.overlay_lan_base_url.clone(),
        overlay_lan_access_enabled: runtime.overlay_lan_access_enabled,
    }
}

fn render_streamlabs_auth_html(title: &str, body: &str, tone: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Streamlabs Authorization</title>
    <style>
      :root {{
        color-scheme: dark;
        font-family: "Segoe UI", system-ui, sans-serif;
        --bg: #090b10;
        --panel: rgba(15, 18, 25, 0.94);
        --border: rgba(255, 255, 255, 0.12);
        --text: #f4f4f5;
        --muted: #afb4c3;
        --accent: #38d7ff;
        --ok: #67ee93;
        --error: #ff6b8a;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(56, 215, 255, 0.12), transparent 24%),
          linear-gradient(180deg, #07090d 0%, var(--bg) 100%);
        color: var(--text);
      }}
      .card {{
        width: min(520px, 100%);
        display: grid;
        gap: 12px;
        padding: 22px 24px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--panel);
        box-shadow: 0 24px 48px rgba(0,0,0,0.32);
      }}
      .eyebrow {{
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
      }}
      h1 {{
        margin: 0;
        font-size: 24px;
      }}
      p {{
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }}
      .tone-success h1 {{ color: var(--ok); }}
      .tone-error h1 {{ color: var(--error); }}
      code {{
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        color: var(--text);
      }}
    </style>
  </head>
  <body>
    <div class="card tone-{tone}">
      <div class="eyebrow">Subathon Timer</div>
      <h1>{title}</h1>
      <p>{body}</p>
      <p>You can close this browser tab and return to the desktop app.</p>
    </div>
  </body>
</html>"#
    )
}

#[tauri::command]
fn get_bootstrap_state(overlay_server: tauri::State<'_, OverlayServerHandle>) -> BootstrapState {
    if let Ok(runtime) = overlay_server.runtime.lock() {
        return build_bootstrap_state(&runtime);
    }

    BootstrapState {
        overlay_base_url: None,
        overlay_preview_base_url: None,
        overlay_lan_base_url: None,
        overlay_lan_access_enabled: false,
    }
}

#[tauri::command]
fn sync_overlay_state(
    payload: OverlaySyncPayload,
    overlay_server: tauri::State<'_, OverlayServerHandle>,
) -> Result<(), String> {
    let mut shared_state = overlay_server
        .shared_state
        .write()
        .map_err(|_| "overlay state lock poisoned".to_string())?;

    *shared_state = OverlayState {
        timer_seconds: payload.timer_seconds,
        uptime_seconds: payload.uptime_seconds,
        timer_status: payload.timer_status,
        timer_theme: payload.timer_theme,
        timer_overlay_transform: payload.timer_overlay_transform,
        reason_overlay_transform: payload.reason_overlay_transform,
        wheel_overlay_transform: payload.wheel_overlay_transform,
        graph_points: payload.graph_points,
        wheel_segments: payload.wheel_segments,
        wheel_spin: payload.wheel_spin,
        wheel_text_scale: payload.wheel_text_scale,
        incentive_rules: payload.incentive_rules,
        overlay_preview: payload.overlay_preview,
    };

    Ok(())
}

#[tauri::command]
fn set_overlay_network_mode(
    lan_enabled: bool,
    overlay_server: tauri::State<'_, OverlayServerHandle>,
    streamlabs_auth: tauri::State<'_, StreamlabsAuthHandle>,
) -> Result<BootstrapState, String> {
    let mut runtime = overlay_server
        .runtime
        .lock()
        .map_err(|_| "overlay runtime lock poisoned".to_string())?;

    if runtime.overlay_lan_access_enabled == lan_enabled
        && runtime.overlay_preview_base_url.is_some()
    {
        return Ok(build_bootstrap_state(&runtime));
    }

    stop_overlay_server(&mut runtime);
    *runtime = spawn_overlay_server(
        Arc::clone(&overlay_server.shared_state),
        Arc::clone(&streamlabs_auth.runtime),
        lan_enabled,
    );

    Ok(build_bootstrap_state(&runtime))
}

#[tauri::command]
fn load_native_app_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<Value>, String> {
    load_native_snapshot(&app)
}

#[tauri::command]
fn save_native_app_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    snapshot: Value,
) -> Result<(), String> {
    save_native_snapshot(&app, &snapshot)
}

#[tauri::command]
fn load_native_twitch_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<Value>, String> {
    #[cfg(target_os = "windows")]
    {
        load_native_twitch_session_snapshot(&app)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        load_native_twitch_session_snapshot()
    }
}

#[tauri::command]
fn save_native_twitch_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    snapshot: Value,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        save_native_twitch_session_snapshot(&app, &snapshot)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        save_native_twitch_session_snapshot(&snapshot)
    }
}

#[tauri::command]
fn clear_native_twitch_session<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        clear_native_twitch_session_snapshot(&app)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        clear_native_twitch_session_snapshot()
    }
}

#[tauri::command]
fn load_native_tip_provider_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<Value>, String> {
    #[cfg(target_os = "windows")]
    {
        load_native_tip_provider_session_snapshot(&app)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        load_native_tip_provider_session_snapshot()
    }
}

#[tauri::command]
fn save_native_tip_provider_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    snapshot: Value,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        save_native_tip_provider_session_snapshot(&app, &snapshot)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        save_native_tip_provider_session_snapshot(&snapshot)
    }
}

#[tauri::command]
fn clear_native_tip_provider_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        clear_native_tip_provider_session_snapshot(&app)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        clear_native_tip_provider_session_snapshot()
    }
}

#[tauri::command]
fn consume_streamlabs_oauth_result(
    streamlabs_auth: tauri::State<'_, StreamlabsAuthHandle>,
) -> Result<Option<StreamlabsOAuthResult>, String> {
    let mut runtime = streamlabs_auth
        .runtime
        .lock()
        .map_err(|_| "streamlabs auth lock poisoned".to_string())?;

    Ok(runtime.last_result.take())
}

#[tauri::command]
fn cancel_streamlabs_oauth(
    streamlabs_auth: tauri::State<'_, StreamlabsAuthHandle>,
) -> Result<(), String> {
    let mut runtime = streamlabs_auth
        .runtime
        .lock()
        .map_err(|_| "streamlabs auth lock poisoned".to_string())?;

    runtime.last_result = None;
    Ok(())
}

fn format_http_response(status_line: &str, content_type: &str, body: &str) -> Vec<u8> {
    format!(
        "{status_line}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .into_bytes()
}

fn format_http_binary_response(status_line: &str, content_type: &str, body: &[u8]) -> Vec<u8> {
    let mut response = format!(
        "{status_line}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: public, max-age=31536000, immutable\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    response.extend_from_slice(body);
    response
}

fn timer_overlay_html() -> &'static str {
    r##"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Subathon Timer Overlay</title>
    <style>
      @font-face {
        font-family: "Lexend";
        src: url("/fonts/Lexend-Regular.ttf") format("truetype");
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: "Lexend";
        src: url("/fonts/Lexend-Bold.ttf") format("truetype");
        font-weight: 700;
        font-style: normal;
      }
      :root {
        color-scheme: dark;
        font-family: "Segoe UI", system-ui, sans-serif;
        --font-display: "Lexend", "Trebuchet MS", "Segoe UI", sans-serif;
        --font-mono: "JetBrains Mono", "Cascadia Mono", monospace;
        --panel: rgba(8, 8, 10, 0.94);
        --border: rgba(255,255,255,0.08);
        --text: #f5f5f5;
        --muted: #a1a1aa;
        --accent: #22d3ee;
        --panel-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
        --offset-x: 0px;
        --offset-y: 0px;
        --overlay-scale: 1;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: transparent;
        color: var(--text);
      }
      .canvas {
        transform: translate(var(--offset-x), var(--offset-y)) scale(var(--overlay-scale));
        transform-origin: center center;
        transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .stage {
        width: min(560px, calc(100vw - 48px));
        display: grid;
        justify-items: center;
        gap: 10px;
        padding: 18px 20px 16px;
        border: 1px solid var(--border);
        background:
          linear-gradient(180deg, rgba(8, 8, 11, 0.92), rgba(8, 8, 11, 0.84)),
          radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 52%);
        box-shadow: var(--panel-shadow);
        text-align: center;
        backdrop-filter: blur(12px);
      }
      .kicker {
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 10px;
        font-weight: 700;
        color: var(--muted);
      }
      .clock {
        font-family: var(--font-mono);
        font-size: clamp(50px, 8vw, 76px);
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.05em;
        margin: 4px 0;
      }
      .meta {
        display: flex;
        gap: 6px 10px;
        flex-wrap: wrap;
        justify-content: center;
        color: var(--muted);
        font-size: 10px;
      }
      .rules {
        width: 100%;
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 14px;
      }
      .rule {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border);
        font-size: 12px;
      }
      .rule-copy {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .rule-marker {
        display: inline-block;
        flex-shrink: 0;
        width: 10px;
        height: 10px;
        border-radius: 3px;
        background: var(--accent);
        box-shadow: 0 0 10px rgba(34, 211, 238, 0.3);
      }
      .rule-marker--diamond {
        width: 9px;
        height: 9px;
        border-radius: 2px;
        transform: rotate(45deg);
      }
      .rule-marker--pill {
        width: 14px;
        height: 8px;
        border-radius: 999px;
      }
      .rule-marker--blue {
        background: linear-gradient(180deg, #60a5fa 0%, #2563eb 100%);
        box-shadow: 0 0 12px rgba(59, 130, 246, 0.38);
      }
      .rule-marker--mint {
        background: linear-gradient(180deg, #5eead4 0%, #14b8a6 100%);
        box-shadow: 0 0 12px rgba(45, 212, 191, 0.34);
      }
      .rule-marker--green {
        background: linear-gradient(180deg, #4ade80 0%, #16a34a 100%);
        box-shadow: 0 0 12px rgba(74, 222, 128, 0.34);
      }
      .rule-marker--cyan {
        background: linear-gradient(180deg, #67e8f9 0%, #06b6d4 100%);
        box-shadow: 0 0 12px rgba(34, 211, 238, 0.38);
      }
      .rule-marker--lime {
        background: linear-gradient(180deg, #bef264 0%, #22c55e 100%);
        box-shadow: 0 0 12px rgba(132, 204, 22, 0.34);
      }
      .rule strong { color: var(--accent); }
      .chart {
        width: 100%;
        margin-top: 2px;
        padding: 6px 8px;
        border: 1px solid var(--border);
        background: rgba(34, 211, 238, 0.035);
      }
      .chart-viewport {
        position: relative;
        width: 100%;
        overflow: visible;
      }
      .graph-icon {
        position: absolute;
        left: 100%;
        width: 44px;
        height: auto;
        pointer-events: none;
        user-select: none;
        transform: translate(-46%, -50%);
      }
      svg {
        width: 100%;
        height: 88px;
        display: block;
      }
      .grid { stroke: rgba(255,255,255,0.06); stroke-width: 1; fill: none; }
      .area { opacity: 0.95; }
      .line { stroke: var(--accent); stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      body[data-theme="app"] .stage {
        width: min(520px, calc(100vw - 48px));
        gap: 14px;
        padding: 26px 22px 22px;
        border-color: rgba(84, 130, 255, 0.16);
        border-radius: 20px;
        background:
          linear-gradient(180deg, rgba(6, 14, 32, 0.96) 0%, rgba(3, 8, 24, 0.94) 100%),
          radial-gradient(circle at top center, rgba(44, 117, 255, 0.22) 0%, rgba(44, 117, 255, 0.04) 54%, transparent 72%);
        box-shadow: 0 18px 44px rgba(1, 6, 20, 0.52);
      }
      body[data-theme="app"] .kicker {
        font-size: 12px;
        letter-spacing: 0.16em;
        color: #dbe7ff;
      }
      body[data-theme="app"] .meta {
        display: none;
      }
      body[data-theme="app"] .clock {
        font-family: var(--font-display);
        font-size: clamp(68px, 9vw, 96px);
        color: #f8fbff;
        text-shadow: 0 0 22px rgba(93, 176, 255, 0.18);
      }
      body[data-theme="app"] .rules {
        width: min(100%, 330px);
        margin-top: 2px;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      body[data-theme="app"] .rule {
        padding-bottom: 0;
        border-bottom: none;
        font-size: 18px;
        color: #d8e5ff;
      }
      body[data-theme="app"] .rule strong {
        color: #f8fbff;
        font-size: 17px;
      }
      body[data-theme="app"] .rule--tone-blue .rule-copy {
        color: #6eb7ff;
      }
      body[data-theme="app"] .rule--tone-mint .rule-copy {
        color: #65efd4;
      }
      body[data-theme="app"] .rule--tone-green .rule-copy {
        color: #5ce488;
      }
      body[data-theme="app"] .rule--tone-cyan .rule-copy {
        color: #69e6ff;
      }
      body[data-theme="app"] .rule--tone-lime .rule-copy {
        color: #a7f36b;
      }
      body[data-theme="app"] .chart {
        margin-top: 4px;
        padding: 14px 14px 10px;
        border-radius: 14px;
        border-color: rgba(94, 125, 255, 0.2);
        background:
          linear-gradient(180deg, rgba(10, 24, 48, 0.88) 0%, rgba(6, 14, 28, 0.92) 100%),
          radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 70%);
      }
      body[data-theme="app"] svg {
        height: 214px;
      }
      body[data-theme="app"] .graph-icon {
        width: 68px;
        transform: translate(-38%, -44%);
      }
      body[data-theme="app"] .grid {
        stroke: rgba(173, 203, 255, 0.14);
      }
      body[data-theme="app"] .line {
        stroke: #00c8ff;
        stroke-width: 3;
      }
      body[data-theme="original"] .stage {
        width: min(520px, calc(100vw - 40px));
        gap: 10px;
        padding: 22px 20px 18px;
        border-color: rgba(255,255,255,0.08);
        border-radius: 20px;
        background:
          linear-gradient(180deg, rgba(9, 9, 12, 0.7) 0%, rgba(9, 9, 12, 0.38) 100%),
          radial-gradient(circle at top center, rgba(255, 255, 255, 0.05), transparent 70%);
        box-shadow: 0 16px 38px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(10px);
      }
      body[data-theme="original"] .kicker {
        display: none;
      }
      body[data-theme="original"] .clock {
        font-family: var(--font-display);
        font-size: clamp(68px, 9.2vw, 104px);
        font-weight: 700;
        color: #ffffff;
      }
      body[data-theme="original"] .meta {
        gap: 0;
        font-size: clamp(15px, 1.9vw, 22px);
        color: #cfcfcf;
      }
      body[data-theme="original"] .rules {
        width: 100%;
        margin-top: 4px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 16px;
      }
      body[data-theme="original"] .rule {
        justify-content: space-between;
        gap: 6px;
        padding-bottom: 0;
        border-bottom: none;
        font-size: clamp(15px, 1.7vw, 18px);
        color: #ffffff;
      }
      body[data-theme="original"] .rule strong {
        color: #ffffff;
      }
      body[data-theme="original"] .chart {
        margin-top: 4px;
        padding: 8px 12px 2px;
        border: none;
        background: transparent;
      }
      body[data-theme="original"] svg {
        height: 112px;
      }
      body[data-theme="original"] .graph-icon {
        width: 52px;
        transform: translate(-48%, -50%);
      }
      body[data-theme="original"] .grid {
        display: none;
      }
      body[data-theme="original"] .line {
        stroke: #ffffff;
        stroke-width: 5;
      }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="stage">
        <div class="kicker">Stream Uptime</div>
        <div class="clock" id="clock">00:00:00</div>
        <div class="meta" id="meta">Uptime 00:00:00 · paused</div>
        <div class="rules" id="rules"></div>
        <div class="chart">
          <div class="chart-viewport">
            <svg viewBox="0 0 520 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#1ac9ff" stop-opacity="0.42"></stop>
                  <stop offset="100%" stop-color="#1ac9ff" stop-opacity="0.04"></stop>
                </linearGradient>
              </defs>
              <path class="grid" d="M 10 20 L 510 20 M 10 60 L 510 60 M 10 100 L 510 100"></path>
              <path class="area" id="area" fill="url(#area-fill)"></path>
              <path class="line" id="line"></path>
            </svg>
            <img class="graph-icon" id="graph-icon" src="/assets/graph_icon.gif" alt="" />
          </div>
        </div>
      </div>
    </div>
    <script>
      document.body.dataset.theme = 'app';
    </script>
    <script>
      const isStudioPreview = new URLSearchParams(window.location.search).get('studio') === '1';
      function formatDuration(totalSeconds) {
        const safe = Math.max(0, Math.floor(totalSeconds));
        const hours = Math.floor(safe / 3600);
        const minutes = Math.floor((safe % 3600) / 60);
        const seconds = safe % 60;
        return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
      }
      function buildLinePath(points, width, height, padding) {
        if (!points.length) return '';
        const min = Math.min(...points);
        const max = Math.max(...points);
        const usableWidth = width - padding * 2;
        const usableHeight = height - padding * 2;
        return points.map((point, index) => {
          const normalized = max === min ? 0.5 : (point - min) / (max - min);
          const x = padding + (usableWidth * index) / Math.max(points.length - 1, 1);
          const y = padding + (1 - normalized) * usableHeight;
          return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(' ');
      }
      function buildAreaPath(points, width, height, padding) {
        if (!points.length) return '';
        const min = Math.min(...points);
        const max = Math.max(...points);
        const usableWidth = width - padding * 2;
        const usableHeight = height - padding * 2;
        const baselineY = height - padding;
        const pathPoints = points.map((point, index) => {
          const normalized = max === min ? 0.5 : (point - min) / (max - min);
          const x = padding + (usableWidth * index) / Math.max(points.length - 1, 1);
          const y = padding + (1 - normalized) * usableHeight;
          return { x, y };
        });
        const firstPoint = pathPoints[0];
        const lastPoint = pathPoints[pathPoints.length - 1];
        const line = pathPoints.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
        return `M ${firstPoint.x.toFixed(2)} ${baselineY.toFixed(2)} ${line} L ${lastPoint.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
      }
      function getLastPointTop(points, height, padding) {
        if (!points.length) return null;
        const min = Math.min(...points);
        const max = Math.max(...points);
        const usableHeight = height - padding * 2;
        const normalized = max === min ? 0.5 : (points[points.length - 1] - min) / (max - min);
        const y = padding + (1 - normalized) * usableHeight;
        return (y / height) * 100;
      }
      function renderRules(rules) {
        const root = document.getElementById('rules');
        root.innerHTML = '';
        rules.slice(0, 6).forEach((rule) => {
          const row = document.createElement('div');
          row.className = `rule${rule.markerTone ? ` rule--tone-${rule.markerTone}` : ''}`;
          const marker = rule.markerShape
            ? `<span class="rule-marker rule-marker--${rule.markerShape}${rule.markerTone ? ` rule-marker--${rule.markerTone}` : ''}"></span>`
            : '';
          row.innerHTML = `<span class="rule-copy">${marker}<span>${rule.label}</span></span><strong>${rule.value}</strong>`;
          root.appendChild(row);
        });
      }
      function clamp(value, min, max) {
        if (min > max) {
          return Math.round((min + max) / 2);
        }

        return Math.round(Math.max(min, Math.min(max, value)));
      }
      function roundScale(value) {
        return Math.max(0.1, Math.round(value * 100) / 100);
      }
      function clampCanvasTransform(transform) {
        const canvas = document.querySelector('.canvas');
        if (!canvas) {
          return { x: 0, y: 0, scale: 1 };
        }

        const width = canvas.offsetWidth || 0;
        const height = canvas.offsetHeight || 0;
        const viewportWidth = window.innerWidth || width;
        const viewportHeight = window.innerHeight || height;

        if (!width || !height || !viewportWidth || !viewportHeight) {
          return {
            x: Math.round(transform.x || 0),
            y: Math.round(transform.y || 0),
            scale: roundScale(transform.scale || 1),
          };
        }

        const requestedScale = Math.max(0.1, transform.scale || 1);
        const scale = roundScale(Math.min(requestedScale, viewportWidth / width, viewportHeight / height));
        const maxX = Math.max(0, (viewportWidth - width * scale) / 2);
        const maxY = Math.max(0, (viewportHeight - height * scale) / 2);

        return {
          x: clamp(transform.x || 0, -maxX, maxX),
          y: clamp(transform.y || 0, -maxY, maxY),
          scale,
        };
      }
      async function refresh() {
        try {
          const response = await fetch('/api/state', { cache: 'no-store' });
          if (!response.ok) return;
          const payload = await response.json();
          const theme = payload.timerTheme || 'app';
          const points = payload.graphPoints || [];
          const transform = payload.timerOverlayTransform || { x: 0, y: 0, scale: 1 };
          document.body.dataset.theme = theme;
          document.getElementById('clock').textContent = formatDuration(payload.timerSeconds);
          document.getElementById('meta').textContent =
            theme === 'original'
              ? `Uptime ${formatDuration(payload.uptimeSeconds)}`
              : `Uptime ${formatDuration(payload.uptimeSeconds)} · ${payload.timerStatus}`;
          renderRules(payload.incentiveRules || []);
          document.getElementById('line').setAttribute('d', buildLinePath(points, 520, 120, 10));
          document.getElementById('area').setAttribute('d', theme === 'app' ? buildAreaPath(points, 520, 120, 10) : '');
          const graphIcon = document.getElementById('graph-icon');
          const iconTop = getLastPointTop(points, 120, 10);
          graphIcon.style.display = iconTop == null ? 'none' : 'block';
          if (iconTop != null) {
            graphIcon.style.top = `${iconTop}%`;
          }
          const boundedTransform = isStudioPreview ? { x: 0, y: 0, scale: 1 } : clampCanvasTransform(transform);
          document.documentElement.style.setProperty('--offset-x', `${boundedTransform.x}px`);
          document.documentElement.style.setProperty('--offset-y', `${boundedTransform.y}px`);
          document.documentElement.style.setProperty('--overlay-scale', String(boundedTransform.scale));
        } catch (_) {}
      }
      refresh();
      window.setInterval(refresh, 80);
    </script>
  </body>
</html>"##
}

fn reason_overlay_html() -> &'static str {
    r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Subathon Reason Overlay</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Segoe UI", system-ui, sans-serif;
        --bg: transparent;
        --panel: rgba(9, 9, 11, 0.92);
        --border: rgba(255,255,255,0.08);
        --text: #fafafa;
        --muted: #a1a1aa;
        --pos: #22c55e;
        --neg: #ef4444;
        --offset-x: 0px;
        --offset-y: 0px;
        --overlay-scale: 1;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: var(--bg);
        color: var(--text);
      }
      .canvas {
        transform: translate(var(--offset-x), var(--offset-y)) scale(var(--overlay-scale));
        transform-origin: center center;
        transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .card {
        width: min(480px, 100%);
        display: grid;
        gap: 8px;
        padding: 16px 18px;
        border: 1px solid var(--border);
        background: var(--panel);
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        backdrop-filter: blur(10px);
        border-left: 3px solid rgba(34, 211, 238, 0.7);
      }
      body[data-theme="app"] .card {
        width: min(420px, 100%);
        padding: 12px 14px;
        gap: 6px;
        border-left-color: rgba(34, 211, 238, 0.5);
      }
      .label {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #71717a;
        font-weight: 700;
      }
      .title {
        font-size: clamp(1.4rem, 3vw, 1.9rem);
        line-height: 1.1;
        color: #fafafa;
        font-weight: 700;
      }
      body[data-theme="app"] .title {
        font-size: clamp(1.1rem, 2.6vw, 1.5rem);
      }
      .summary {
        font-size: 13px;
        color: #a1a1aa;
        max-width: 52ch;
      }
      body[data-theme="app"] .summary {
        font-size: 12px;
      }
      .delta {
        font-size: 20px;
        font-family: "JetBrains Mono", "Cascadia Mono", monospace;
        font-weight: 700;
      }
      body[data-theme="app"] .delta {
        font-size: 16px;
      }
      .delta.pos { color: var(--pos); }
      .delta.neg { color: var(--neg); }
      .delta.neutral { color: #d4d4d8; }
    </style>
  </head>
  <body data-theme="app">
    <div class="canvas">
      <div class="card">
        <div class="label" id="label">Recent event</div>
        <div class="title" id="title">Waiting for activity</div>
        <div class="summary" id="summary">The next Twitch or manual timer event will appear here.</div>
        <div class="delta pos" id="delta">+00:00</div>
      </div>
    </div>
    <script>
      const isStudioPreview = new URLSearchParams(window.location.search).get('studio') === '1';
      function clamp(value, min, max) {
        if (min > max) {
          return Math.round((min + max) / 2);
        }

        return Math.round(Math.max(min, Math.min(max, value)));
      }
      function roundScale(value) {
        return Math.max(0.1, Math.round(value * 100) / 100);
      }
      function clampCanvasTransform(transform) {
        const canvas = document.querySelector('.canvas');
        if (!canvas) {
          return { x: 0, y: 0, scale: 1 };
        }

        const width = canvas.offsetWidth || 0;
        const height = canvas.offsetHeight || 0;
        const viewportWidth = window.innerWidth || width;
        const viewportHeight = window.innerHeight || height;

        if (!width || !height || !viewportWidth || !viewportHeight) {
          return {
            x: Math.round(transform.x || 0),
            y: Math.round(transform.y || 0),
            scale: roundScale(transform.scale || 1),
          };
        }

        const requestedScale = Math.max(0.1, transform.scale || 1);
        const scale = roundScale(Math.min(requestedScale, viewportWidth / width, viewportHeight / height));
        const maxX = Math.max(0, (viewportWidth - width * scale) / 2);
        const maxY = Math.max(0, (viewportHeight - height * scale) / 2);

        return {
          x: clamp(transform.x || 0, -maxX, maxX),
          y: clamp(transform.y || 0, -maxY, maxY),
          scale,
        };
      }
      async function refresh() {
        try {
          const response = await fetch('/api/state', { cache: 'no-store' });
          if (!response.ok) return;
          const payload = await response.json();
          const preview = payload.overlayPreview || {};
          const transform = payload.reasonOverlayTransform || { x: 0, y: 0, scale: 1 };
          document.body.dataset.theme = payload.timerTheme || 'app';
          document.getElementById('label').textContent = preview.eyebrow || 'Recent event';
          document.getElementById('title').textContent = preview.title || 'Waiting for activity';
          document.getElementById('summary').textContent = preview.summary || 'The next Twitch or manual timer event will appear here.';
          document.getElementById('delta').textContent = preview.delta || '+00:00';
          document.getElementById('delta').className = `delta ${preview.tone === 'negative' ? 'neg' : preview.tone === 'positive' ? 'pos' : 'neutral'}`;
          const boundedTransform = isStudioPreview ? { x: 0, y: 0, scale: 1 } : clampCanvasTransform(transform);
          document.documentElement.style.setProperty('--offset-x', `${boundedTransform.x}px`);
          document.documentElement.style.setProperty('--offset-y', `${boundedTransform.y}px`);
          document.documentElement.style.setProperty('--overlay-scale', String(boundedTransform.scale));
        } catch (_) {}
      }
      refresh();
      window.setInterval(refresh, 80);
    </script>
  </body>
</html>"#
}

fn wheel_overlay_html() -> &'static str {
    r##"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Subathon Wheel Overlay</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Segoe UI", system-ui, sans-serif;
        --text: #f4f4f5;
        --muted: #cbd5e1;
        --accent: #22d3ee;
        --offset-x: 0px;
        --offset-y: 0px;
        --overlay-scale: 1;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: transparent;
        color: var(--text);
      }
      .canvas {
        transform: translate(var(--offset-x), var(--offset-y)) scale(var(--overlay-scale));
        transform-origin: center center;
        transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .stage {
        width: min(560px, calc(100vw - 48px));
        display: none;
        gap: 16px;
        justify-items: center;
        padding: 20px 22px 18px;
        border-radius: 20px;
        border: 1px solid rgba(34, 211, 238, 0.18);
        background:
          linear-gradient(180deg, rgba(7, 11, 18, 0.94) 0%, rgba(5, 8, 14, 0.98) 100%),
          radial-gradient(circle at top, rgba(34, 211, 238, 0.1), transparent 54%);
        box-shadow: 0 22px 48px rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(12px);
        transform-origin: center center;
        will-change: transform, opacity, filter;
      }
      .stage.visible { display: grid; }
      .stage.entering {
        animation: wheelOverlayEnter 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .stage.phase-visible {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }
      .stage.exiting {
        animation: wheelOverlayExit 360ms cubic-bezier(0.4, 0, 1, 1) both;
      }
      .copy {
        display: grid;
        gap: 6px;
        text-align: center;
      }
      .stage.spinning .title {
        animation: wheelOverlayPulse 1250ms ease-in-out infinite;
      }
      .stage.result .copy {
        animation: wheelOverlayResultReveal 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .stage.result:not(.studio) {
        width: min(940px, calc(100vw - 72px));
        max-width: 100%;
        min-height: 280px;
        gap: 18px;
        align-content: center;
        justify-items: center;
        padding: 36px 48px 32px;
        box-sizing: border-box;
        border-radius: 30px;
        background:
          radial-gradient(circle at top, rgba(156, 240, 0, 0.18), transparent 42%),
          radial-gradient(circle at 18% 78%, rgba(34, 211, 238, 0.12), transparent 36%),
          linear-gradient(180deg, rgba(9, 13, 20, 0.97) 0%, rgba(5, 8, 14, 1) 100%);
        border-color: rgba(156, 240, 0, 0.2);
        box-shadow: 0 28px 68px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(156, 240, 0, 0.08);
      }
      .stage.result:not(.studio) .copy {
        gap: 18px;
      }
      .stage.result:not(.studio) .eyebrow {
        color: #c7ff5e;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.18em;
      }
      .stage.result:not(.studio) .winner {
        display: grid;
        gap: 14px;
        justify-items: center;
        width: min(100%, 720px);
      }
      .stage.result:not(.studio) .title {
        max-width: 100%;
        font-size: clamp(48px, 8vw, 88px);
        line-height: 0.96;
        letter-spacing: -0.04em;
        text-shadow: 0 0 30px rgba(199, 255, 94, 0.18);
        overflow-wrap: anywhere;
        text-wrap: balance;
      }
      .stage.result:not(.studio) .summary {
        width: min(100%, 40ch);
        max-width: 100%;
        font-size: 19px;
        line-height: 1.5;
        color: rgba(226, 232, 240, 0.92);
        text-wrap: balance;
      }
      .stage.result:not(.studio) .wheel-wrap {
        display: none;
      }
      .stage.result:not(.studio).test {
        border-color: rgba(34, 211, 238, 0.2);
        background:
          radial-gradient(circle at top, rgba(34, 211, 238, 0.18), transparent 42%),
          radial-gradient(circle at 18% 78%, rgba(156, 240, 0, 0.1), transparent 36%),
          linear-gradient(180deg, rgba(9, 13, 20, 0.97) 0%, rgba(5, 8, 14, 1) 100%);
      }
      .stage.result:not(.studio).test .eyebrow {
        color: var(--accent);
      }
      .stage.result:not(.studio).test .title {
        text-shadow: 0 0 30px rgba(34, 211, 238, 0.2);
      }
      .eyebrow {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .title {
        font-size: clamp(22px, 4vw, 34px);
        font-weight: 700;
        line-height: 1.05;
      }
      .summary {
        font-size: 13px;
        line-height: 1.5;
        color: var(--muted);
      }
      .wheel-wrap {
        width: min(100%, 420px);
      }
      svg {
        width: 100%;
        height: auto;
        display: block;
        overflow: visible;
      }
      .rotor {
        transform-origin: 50% 50%;
      }
      .rotor.spinning {
        transition: transform 1800ms cubic-bezier(0.12, 0.8, 0.12, 1);
      }
      .pointer {
        fill: #facc15;
        filter: drop-shadow(0 0 14px rgba(250, 204, 21, 0.38));
      }
      .hub {
        fill: rgba(6, 11, 18, 0.96);
        stroke: rgba(255, 255, 255, 0.08);
        stroke-width: 1.2;
      }
      .label {
        font-size: 4px;
        font-weight: 700;
        text-anchor: middle;
        dominant-baseline: middle;
        pointer-events: none;
      }
      .result {
        justify-self: center;
        min-width: 0;
        max-width: 34ch;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
        text-align: center;
        color: rgba(226, 232, 240, 0.86);
        opacity: 0;
        transform: translateY(12px) scale(0.96);
        transition:
          opacity 220ms ease,
          transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .result.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .stage.result:not(.studio) .result {
        width: min(520px, 100%);
        max-width: 100%;
        padding: 14px 18px;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(199, 255, 94, 0.18);
        font-size: 14px;
        font-weight: 700;
        line-height: 1.45;
        color: rgba(241, 245, 249, 0.94);
      }
      .stage.result:not(.studio).test .result {
        border-color: rgba(34, 211, 238, 0.18);
      }
      @keyframes wheelOverlayEnter {
        from {
          opacity: 0;
          transform: translate3d(0, 36px, 0) scale(0.94);
          filter: blur(10px);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }
      @keyframes wheelOverlayExit {
        from {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
        to {
          opacity: 0;
          transform: translate3d(0, -18px, 0) scale(0.97);
          filter: blur(8px);
        }
      }
      @keyframes wheelOverlayPulse {
        0%, 100% {
          text-shadow: 0 0 0 rgba(34, 211, 238, 0);
        }
        50% {
          text-shadow: 0 0 24px rgba(34, 211, 238, 0.18);
        }
      }
      @keyframes wheelOverlayResultReveal {
        from {
          opacity: 0;
          transform: translate3d(0, 14px, 0);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }
      }
    </style>
  </head>
  <body>
    <div class="canvas">
      <section class="stage" id="stage" aria-live="polite">
        <div class="copy">
          <div class="eyebrow" id="eyebrow">Gift bomb wheel</div>
          <div class="winner">
            <div class="title" id="title">Spinning now</div>
            <div class="summary" id="summary">The wheel is choosing the next outcome live on stream.</div>
          </div>
        </div>
        <div class="wheel-wrap">
          <svg viewBox="0 0 100 100" role="img" aria-label="Wheel overlay">
            <polygon class="pointer" points="50,2 55,12 45,12"></polygon>
            <g id="rotor" class="rotor"></g>
            <circle class="hub" cx="50" cy="50" r="8"></circle>
          </svg>
        </div>
        <div class="result" id="result"></div>
      </section>
    </div>
    <script>
      const isStudioPreview = new URLSearchParams(window.location.search).get('studio') === '1';
      const stage = document.getElementById('stage');
      const rotor = document.getElementById('rotor');
      const eyebrow = document.getElementById('eyebrow');
      const title = document.getElementById('title');
      const summary = document.getElementById('summary');
      const result = document.getElementById('result');
      const fallbackPalette = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#65a30d', '#ea580c'];
      const OVERLAY_INTRO_MS = 320;
      const OVERLAY_OUTRO_MS = 360;
      const OVERLAY_SPIN_REVEAL_MS = 1800;
      let rotation = 0;
      let lastSpinKey = null;
      let overlayPhase = isStudioPreview ? 'visible' : 'hidden';
      let displayedSpin = { status: 'idle' };
      let phaseTimer = null;
      let revealTimer = null;
      let activeCycleKey = null;
      let revealUnlocked = false;
      let latestSourceSpin = { status: 'idle' };

      function polar(radius, angleDegrees) {
        const radians = ((angleDegrees - 90) * Math.PI) / 180;
        return {
          x: 50 + radius * Math.cos(radians),
          y: 50 + radius * Math.sin(radians),
        };
      }

      function slicePath(startAngle, endAngle) {
        const start = polar(46, startAngle);
        const end = polar(46, endAngle);
        const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
        return `M 50 50 L ${start.x} ${start.y} A 46 46 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
      }

      function normalizeDegrees(value) {
        const normalized = value % 360;
        return normalized < 0 ? normalized + 360 : normalized;
      }

      function wheelLabel(segment) {
        if (segment.outcomeType === 'time' && typeof segment.timeDeltaSeconds === 'number') {
          const amount = Math.round(segment.timeDeltaSeconds);
          const sign = amount < 0 ? '-' : '+';
          const abs = Math.abs(amount);
          if (abs >= 3600 && abs % 3600 === 0) return `${sign}${abs / 3600}h`;
          if (abs >= 60 && abs % 60 === 0) return `${sign}${abs / 60}m`;
          return `${sign}${abs}s`;
        }
        if (segment.outcomeType === 'timeout') {
          return segment.timeoutTarget === 'random' ? 'Rand TO' : 'Self TO';
        }
        return String(segment.label || 'Result').slice(0, 14);
      }

      function contrastColor(hex) {
        const clean = String(hex || '#7c3aed').replace('#', '');
        const r = parseInt(clean.slice(0, 2), 16) / 255;
        const g = parseInt(clean.slice(2, 4), 16) / 255;
        const b = parseInt(clean.slice(4, 6), 16) / 255;
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return luminance > 0.55 ? '#111114' : '#f4f4f5';
      }

      function buildWheel(segments) {
        const sliceAngle = segments.length > 0 ? 360 / segments.length : 360;
        rotor.innerHTML = '';
        segments.forEach((segment, index) => {
          const startAngle = index * sliceAngle;
          const endAngle = startAngle + sliceAngle;
          const centerAngle = startAngle + sliceAngle / 2;
          const fill = segment.color || fallbackPalette[index % fallbackPalette.length];

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', slicePath(startAngle, endAngle));
          path.setAttribute('fill', fill);
          path.setAttribute('stroke', 'rgba(0,0,0,0.28)');
          path.setAttribute('stroke-width', '0.35');
          rotor.appendChild(path);

          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('class', 'label');
          text.setAttribute('fill', contrastColor(fill));
          const labelPoint = polar(30, centerAngle);
          text.setAttribute('x', String(labelPoint.x));
          text.setAttribute('y', String(labelPoint.y));
          text.textContent = wheelLabel(segment);
          rotor.appendChild(text);
        });
      }

      function updateRotation(segments, spin) {
        if (!spin || spin.status !== 'spinning' || !spin.activeSegmentId || segments.length === 0) {
          rotor.classList.remove('spinning');
          return;
        }

        const spinKey = `${spin.status}:${spin.activeSegmentId}`;
        if (lastSpinKey === spinKey) {
          return;
        }

        const index = segments.findIndex((segment) => segment.id === spin.activeSegmentId);
        if (index < 0) {
          return;
        }

        lastSpinKey = spinKey;
        const sliceAngle = 360 / segments.length;
        const centerAngle = index * sliceAngle + sliceAngle / 2;
        const currentRotation = normalizeDegrees(rotation);
        const targetRotation = normalizeDegrees(360 - centerAngle);
        let delta = targetRotation - currentRotation;
        while (delta <= 0) delta += 360;
        const previousRotation = rotation;
        const nextRotation = previousRotation + 6 * 360 + delta;
        rotation = nextRotation;

        rotor.classList.remove('spinning');
        rotor.style.transform = `rotate(${previousRotation}deg)`;
        rotor.getBoundingClientRect();

        window.requestAnimationFrame(() => {
          rotor.classList.add('spinning');
          rotor.style.transform = `rotate(${nextRotation}deg)`;
        });
      }

      function clearPhaseTimer() {
        if (phaseTimer !== null) {
          window.clearTimeout(phaseTimer);
          phaseTimer = null;
        }
      }

      function clearRevealTimer() {
        if (revealTimer !== null) {
          window.clearTimeout(revealTimer);
          revealTimer = null;
        }
      }

      function applyPhase(nextPhase) {
        overlayPhase = nextPhase;
        stage.classList.toggle('visible', nextPhase !== 'hidden');
        stage.classList.toggle('entering', nextPhase === 'entering');
        stage.classList.toggle('phase-visible', nextPhase === 'visible');
        stage.classList.toggle('exiting', nextPhase === 'exiting');
        stage.classList.toggle('studio', isStudioPreview);
      }

      applyPhase(overlayPhase);

      function clamp(value, min, max) {
        if (min > max) {
          return Math.round((min + max) / 2);
        }

        return Math.round(Math.max(min, Math.min(max, value)));
      }

      function roundScale(value) {
        return Math.max(0.1, Math.round(value * 100) / 100);
      }

      function clampCanvasTransform(transform) {
        const canvas = document.querySelector('.canvas');
        if (!canvas) {
          return { x: 0, y: 0, scale: 1 };
        }

        const width = canvas.offsetWidth || 0;
        const height = canvas.offsetHeight || 0;
        const viewportWidth = window.innerWidth || width;
        const viewportHeight = window.innerHeight || height;

        if (!width || !height || !viewportWidth || !viewportHeight) {
          return {
            x: Math.round(transform.x || 0),
            y: Math.round(transform.y || 0),
            scale: roundScale(transform.scale || 1),
          };
        }

        const requestedScale = Math.max(0.1, transform.scale || 1);
        const scale = roundScale(Math.min(requestedScale, viewportWidth / width, viewportHeight / height));
        const maxX = Math.max(0, (viewportWidth - width * scale) / 2);
        const maxY = Math.max(0, (viewportHeight - height * scale) / 2);

        return {
          x: clamp(transform.x || 0, -maxX, maxX),
          y: clamp(transform.y || 0, -maxY, maxY),
          scale,
        };
      }

      async function refresh() {
        try {
          const response = await fetch('/api/state', { cache: 'no-store' });
          if (!response.ok) return;
          const payload = await response.json();
          const segments = Array.isArray(payload.wheelSegments) ? payload.wheelSegments : [];
          const liveSpin = payload.wheelSpin || { status: 'idle' };
          const spin = isStudioPreview && liveSpin.status === 'idle' && segments[0]
            ? {
                status: 'spinning',
                activeSegmentId: segments[0].id,
                resultTitle: 'Overlay placement',
                resultSummary: 'Use the Overlay Studio sliders to place and scale the wheel before the next gifted-sub spin.',
                requiresModeration: Boolean(segments[0].moderationRequired),
                autoApply: false,
              }
            : liveSpin;
          const isPlacementPreview = isStudioPreview && liveSpin.status === 'idle';
          latestSourceSpin = spin;
          const transform = payload.wheelOverlayTransform || { x: 0, y: 0, scale: 1 };

          const hasActiveSpin = isStudioPreview || (spin && spin.status !== 'idle' && spin.activeSegmentId);

          if (hasActiveSpin) {
            clearPhaseTimer();
            const cycleKey = spin.activeSegmentId || null;

            if (cycleKey && activeCycleKey !== cycleKey) {
              activeCycleKey = cycleKey;
              revealUnlocked = false;
              clearRevealTimer();
              displayedSpin = {
                ...spin,
                status: 'spinning',
                resultTitle: 'Selecting outcome',
                resultSummary: 'Wheel animation in progress.',
              };
              revealTimer = window.setTimeout(() => {
                revealTimer = null;
                revealUnlocked = true;
                if (latestSourceSpin.status === 'ready' && latestSourceSpin.activeSegmentId === cycleKey) {
                  displayedSpin = latestSourceSpin;
                }
              }, OVERLAY_SPIN_REVEAL_MS);
            } else if (revealUnlocked && spin.status === 'ready') {
              displayedSpin = spin;
            } else if (!revealUnlocked) {
              displayedSpin = {
                ...displayedSpin,
                activeSegmentId: spin.activeSegmentId,
                requiresModeration: Boolean(spin.requiresModeration),
                autoApply: Boolean(spin.autoApply),
              };
            }

            if (overlayPhase === 'hidden' || overlayPhase === 'exiting') {
              applyPhase('entering');
              phaseTimer = window.setTimeout(() => {
                phaseTimer = null;
                applyPhase('visible');
              }, OVERLAY_INTRO_MS);
            } else if (overlayPhase === 'entering') {
              // keep the intro animation running
            } else if (overlayPhase !== 'visible') {
              applyPhase('visible');
            }
          } else if (overlayPhase !== 'hidden' && overlayPhase !== 'exiting') {
            clearPhaseTimer();
            clearRevealTimer();
            activeCycleKey = null;
            revealUnlocked = false;
            applyPhase('exiting');
            phaseTimer = window.setTimeout(() => {
              phaseTimer = null;
              displayedSpin = { status: 'idle' };
              applyPhase('hidden');
            }, OVERLAY_OUTRO_MS);
          } else if (!hasActiveSpin) {
            clearRevealTimer();
            activeCycleKey = null;
            revealUnlocked = false;
          }

          if (overlayPhase === 'hidden' || displayedSpin.status === 'idle' || !displayedSpin.activeSegmentId) {
            lastSpinKey = null;
            result.textContent = '';
            result.classList.remove('visible');
            return;
          }

          buildWheel(segments);
          updateRotation(segments, displayedSpin);
          stage.classList.toggle('spinning', displayedSpin.status === 'spinning');
          stage.classList.toggle('result', displayedSpin.status === 'ready');
          stage.classList.toggle('test', Boolean(displayedSpin.isTest));

          if (displayedSpin.status === 'spinning') {
            eyebrow.textContent = 'Gift bomb wheel';
            title.textContent = 'Spinning now';
            summary.textContent = isPlacementPreview
              ? 'Use the Overlay Studio sliders to place and scale the wheel before the next gifted-sub spin.'
              : 'The wheel is choosing the next outcome live on stream.';
            result.textContent = '';
            result.classList.remove('visible');
          } else {
            eyebrow.textContent = isPlacementPreview
              ? 'Wheel preview'
              : (displayedSpin.isTest ? 'Test result' : 'Wheel picked');
            title.textContent = displayedSpin.resultTitle || 'Result ready';
            summary.textContent = displayedSpin.isTest
              ? 'This test spin announced the winner in chat and stopped before applying anything.'
              : displayedSpin.autoApply
                ? 'Gifted subs triggered this result live and the outcome is moving through its apply flow now.'
                : 'The wheel landed on this outcome and is waiting for the streamer to apply it from the Wheel page.';
            result.textContent = displayedSpin.requiresModeration
              ? 'Reconnect Twitch before timeout outcomes can run.'
              : displayedSpin.isTest
                ? 'Preview only. No action was applied.'
                : (displayedSpin.autoApply ? 'Chat announcement sent. Applying after the reveal.' : 'Chat announcement sent. Waiting for manual apply.');
            result.classList.add('visible');
          }

          const boundedTransform = clampCanvasTransform(transform);
          document.documentElement.style.setProperty('--offset-x', `${boundedTransform.x}px`);
          document.documentElement.style.setProperty('--offset-y', `${boundedTransform.y}px`);
          document.documentElement.style.setProperty('--overlay-scale', String(boundedTransform.scale));
        } catch (_) {}
      }

      refresh();
      window.setInterval(refresh, 80);
    </script>
  </body>
</html>"##
}

fn handle_streamlabs_auth_callback(
    query: &str,
    streamlabs_auth: Arc<Mutex<StreamlabsAuthRuntime>>,
) -> Vec<u8> {
    let params: std::collections::HashMap<String, String> =
        form_urlencoded::parse(query.as_bytes()).into_owned().collect();

    if let Some(error) = params.get("error") {
        let description = params
            .get("error_description")
            .cloned()
            .unwrap_or_else(|| error.clone());

        if let Ok(mut runtime) = streamlabs_auth.lock() {
            runtime.last_result = Some(StreamlabsOAuthResult {
                status: "error".into(),
                code: None,
                state: params.get("state").cloned(),
                error: Some(description.clone()),
            });
        }

        return format_http_response(
            "HTTP/1.1 400 Bad Request",
            "text/html; charset=utf-8",
            &render_streamlabs_auth_html("Authorization cancelled", &description, "error"),
        );
    }

    let code = match params.get("code") {
        Some(code) if !code.trim().is_empty() => code.clone(),
        _ => {
            if let Ok(mut runtime) = streamlabs_auth.lock() {
                runtime.last_result = Some(StreamlabsOAuthResult {
                    status: "error".into(),
                    code: None,
                    state: params.get("state").cloned(),
                    error: Some("Streamlabs did not return an authorization code.".into()),
                });
            }

            return format_http_response(
                "HTTP/1.1 400 Bad Request",
                "text/html; charset=utf-8",
                &render_streamlabs_auth_html(
                    "Authorization failed",
                    "Streamlabs did not return an authorization code to the desktop app.",
                    "error",
                ),
            );
        }
    };

    let state = params.get("state").cloned();

    if let Ok(mut runtime) = streamlabs_auth.lock() {
        runtime.last_result = Some(StreamlabsOAuthResult {
            status: "success".into(),
            code: Some(code),
            state: state.clone(),
            error: None,
        });
    }

    format_http_response(
        "HTTP/1.1 200 OK",
        "text/html; charset=utf-8",
        &render_streamlabs_auth_html(
            "Streamlabs approved",
            "The desktop app received the Streamlabs authorization callback and is finishing the connection now.",
            "success",
        ),
    )
}

fn try_handle_connection(
    mut stream: TcpStream,
    shared_state: Arc<RwLock<OverlayState>>,
    streamlabs_auth: Arc<Mutex<StreamlabsAuthRuntime>>,
) {
    let mut request_line = String::new();
    {
        let mut reader = BufReader::new(&stream);
        if reader.read_line(&mut request_line).is_err() {
            return;
        }
    }

    let request_target = request_line.split_whitespace().nth(1).unwrap_or("/");
    let mut request_target_parts = request_target.splitn(2, '?');
    let path = request_target_parts.next().unwrap_or("/");
    let query = request_target_parts.next().unwrap_or("");

    let response = match path {
        "/health" => format_http_response("HTTP/1.1 200 OK", "text/plain; charset=utf-8", "ok"),
        "/api/state" => match shared_state.read() {
            Ok(state) => match serde_json::to_string(&*state) {
                Ok(json) => format_http_response(
                    "HTTP/1.1 200 OK",
                    "application/json; charset=utf-8",
                    &json,
                ),
                Err(_) => format_http_response(
                    "HTTP/1.1 500 Internal Server Error",
                    "text/plain; charset=utf-8",
                    "serialization failed",
                ),
            },
            Err(_) => format_http_response(
                "HTTP/1.1 500 Internal Server Error",
                "text/plain; charset=utf-8",
                "state unavailable",
            ),
        },
        "/overlay/timer" | "/" => format_http_response(
            "HTTP/1.1 200 OK",
            "text/html; charset=utf-8",
            timer_overlay_html(),
        ),
        "/fonts/Lexend-Regular.ttf" => {
            format_http_binary_response("HTTP/1.1 200 OK", "font/ttf", LEXEND_REGULAR_TTF)
        }
        "/fonts/Lexend-Bold.ttf" => {
            format_http_binary_response("HTTP/1.1 200 OK", "font/ttf", LEXEND_BOLD_TTF)
        }
        "/assets/graph_icon.gif" => {
            format_http_binary_response("HTTP/1.1 200 OK", "image/gif", GRAPH_ICON_GIF)
        }
        "/overlay/reason" => format_http_response(
            "HTTP/1.1 200 OK",
            "text/html; charset=utf-8",
            reason_overlay_html(),
        ),
        "/overlay/wheel" => format_http_response(
            "HTTP/1.1 200 OK",
            "text/html; charset=utf-8",
            wheel_overlay_html(),
        ),
        "/auth/streamlabs/callback" => handle_streamlabs_auth_callback(query, streamlabs_auth),
        _ => format_http_response(
            "HTTP/1.1 404 Not Found",
            "text/plain; charset=utf-8",
            "not found",
        ),
    };

    let _ = stream.write_all(&response);
    let _ = stream.flush();
}

fn resolve_overlay_lan_base_url() -> Option<String> {
    match local_ip_address::local_ip().ok()? {
        IpAddr::V4(address) if address.is_private() => {
            Some(format!("http://{address}:{DEFAULT_OVERLAY_PORT}"))
        }
        _ => None,
    }
}

fn stop_overlay_server(runtime: &mut OverlayServerRuntime) {
    runtime.shutdown.store(true, Ordering::Relaxed);

    if let Some(handle) = runtime.thread_handle.take() {
        let _ = handle.join();
    }

    runtime.overlay_base_url = None;
    runtime.overlay_preview_base_url = None;
    runtime.overlay_lan_base_url = None;
}

fn spawn_overlay_server(
    shared_state: Arc<RwLock<OverlayState>>,
    streamlabs_auth: Arc<Mutex<StreamlabsAuthRuntime>>,
    lan_enabled: bool,
) -> OverlayServerRuntime {
    let shutdown = Arc::new(AtomicBool::new(false));
    let bind_host = if lan_enabled { "0.0.0.0" } else { "127.0.0.1" };
    let listener = match TcpListener::bind((bind_host, DEFAULT_OVERLAY_PORT)) {
        Ok(listener) => listener,
        Err(_) => {
            return OverlayServerRuntime {
                overlay_base_url: None,
                overlay_preview_base_url: None,
                overlay_lan_base_url: None,
                overlay_lan_access_enabled: lan_enabled,
                shutdown,
                thread_handle: None,
            }
        }
    };

    if listener.set_nonblocking(true).is_err() {
        return OverlayServerRuntime {
            overlay_base_url: None,
            overlay_preview_base_url: None,
            overlay_lan_base_url: None,
            overlay_lan_access_enabled: lan_enabled,
            shutdown,
            thread_handle: None,
        };
    }

    let overlay_preview_base_url = Some(format!("http://127.0.0.1:{DEFAULT_OVERLAY_PORT}"));
    let overlay_lan_base_url = if lan_enabled {
        resolve_overlay_lan_base_url()
    } else {
        None
    };
    let overlay_base_url = if lan_enabled {
        overlay_lan_base_url
            .clone()
            .or_else(|| overlay_preview_base_url.clone())
    } else {
        overlay_preview_base_url.clone()
    };
    let state_for_thread = Arc::clone(&shared_state);
    let auth_for_thread = Arc::clone(&streamlabs_auth);
    let shutdown_for_thread = Arc::clone(&shutdown);

    let handle = std::thread::spawn(move || {
        while !shutdown_for_thread.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => try_handle_connection(
                    stream,
                    Arc::clone(&state_for_thread),
                    Arc::clone(&auth_for_thread),
                ),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(_) => break,
            }
        }
    });

    OverlayServerRuntime {
        overlay_base_url,
        overlay_preview_base_url,
        overlay_lan_base_url,
        overlay_lan_access_enabled: lan_enabled,
        shutdown,
        thread_handle: Some(handle),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state = Arc::new(RwLock::new(OverlayState::default()));
    let streamlabs_auth_runtime = Arc::new(Mutex::new(StreamlabsAuthRuntime::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup({
            let shared_state = Arc::clone(&shared_state);
            let streamlabs_auth_runtime = Arc::clone(&streamlabs_auth_runtime);

            move |app| {
                let app_handle = app.handle().clone();
                let lan_enabled = load_overlay_lan_access_enabled(&app_handle);
                let overlay_server = OverlayServerHandle {
                    shared_state: Arc::clone(&shared_state),
                    runtime: Mutex::new(spawn_overlay_server(
                        Arc::clone(&shared_state),
                        Arc::clone(&streamlabs_auth_runtime),
                        lan_enabled,
                    )),
                };
                let streamlabs_auth = StreamlabsAuthHandle {
                    runtime: Arc::clone(&streamlabs_auth_runtime),
                };

                app.manage(overlay_server);
                app.manage(streamlabs_auth);
                Ok(())
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_state,
            set_overlay_network_mode,
            sync_overlay_state,
            load_native_app_state,
            save_native_app_state,
            load_native_twitch_session,
            save_native_twitch_session,
            clear_native_twitch_session,
            load_native_tip_provider_session,
            save_native_tip_provider_session,
            clear_native_tip_provider_session,
            consume_streamlabs_oauth_result,
            cancel_streamlabs_oauth
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
