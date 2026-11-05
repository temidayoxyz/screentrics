use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, RgbaImage};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use xcap::{Monitor, Window};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    index: usize,
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    primary: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    id: String,
    title: String,
    app: String,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sources {
    monitors: Vec<MonitorInfo>,
    windows: Vec<WindowInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrimaryBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Captured {
    id: String,
    width: u32,
    height: u32,
    thumb: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Thumb {
    id: String,
    thumb: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPayload {
    captures: Vec<serde_json::Value>,
    thumbs: Vec<Thumb>,
}

#[derive(Serialize, Deserialize, Default)]
struct LibraryFile {
    captures: Vec<serde_json::Value>,
}

fn captures_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("captures");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("library.json"))
}

fn safe_id(id: &str) -> Result<(), String> {
    if (8..=32).contains(&id.len()) && id.chars().all(|char| char.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Invalid capture.".into())
    }
}

fn new_id() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static NEXT: AtomicU32 = AtomicU32::new(1);
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let salt = NEXT.fetch_add(1, Ordering::Relaxed);
    format!("{millis:x}{salt:04x}")
}

fn jpeg_bytes(image: &RgbaImage, max_edge: u32, quality: u8) -> Result<Vec<u8>, String> {
    let (width, height) = (image.width(), image.height());
    let scale = (max_edge as f32 / width.max(height).max(1) as f32).min(1.0);
    let thumb_width = ((width as f32) * scale).round().max(1.0) as u32;
    let thumb_height = ((height as f32) * scale).round().max(1.0) as u32;
    let thumb = image::imageops::resize(
        image,
        thumb_width,
        thumb_height,
        image::imageops::FilterType::Triangle,
    );
    let rgb = image::DynamicImage::ImageRgba8(thumb).into_rgb8();
    let mut bytes = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(Cursor::new(&mut bytes), quality);
    encoder
        .encode(
            rgb.as_raw(),
            thumb_width,
            thumb_height,
            ExtendedColorType::Rgb8,
        )
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}

fn data_url(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

fn store_image(app: &AppHandle, image: RgbaImage) -> Result<Captured, String> {
    if image.width() < 2 || image.height() < 2 {
        return Err("The capture was too small.".into());
    }
    let id = new_id();
    let dir = captures_dir(app)?;
    image
        .save(dir.join(format!("{id}.png")))
        .map_err(|error| format!("Could not save the capture. {error}"))?;
    let thumb = jpeg_bytes(&image, 720, 72)?;
    fs::write(dir.join(format!("{id}.jpg")), &thumb).map_err(|error| error.to_string())?;
    Ok(Captured {
        id,
        width: image.width(),
        height: image.height(),
        thumb: data_url("image/jpeg", &thumb),
    })
}

fn monitor_name(monitor: &Monitor, index: usize) -> String {
    monitor
        .friendly_name()
        .or_else(|_| monitor.name())
        .unwrap_or_else(|_| format!("Screen {}", index + 1))
}

fn primary_monitor(monitors: &[Monitor]) -> Result<&Monitor, String> {
    monitors
        .iter()
        .find(|monitor| monitor.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or_else(|| "No screen was found.".into())
}

fn useful_window(window: &Window) -> Option<WindowInfo> {
    let title = window.title().unwrap_or_default();
    let app = window.app_name().unwrap_or_default();
    let width = window.width().unwrap_or(0);
    let height = window.height().unwrap_or(0);
    if title.trim().is_empty() || width < 80 || height < 80 || window.is_minimized().unwrap_or(false)
    {
        return None;
    }
    let blocked = [
        "Program Manager",
        "Windows Input Experience",
        "MSCTFIME UI",
    ];
    if blocked.iter().any(|name| title.eq_ignore_ascii_case(name))
        || title.to_lowercase().contains("screentrics")
        || app.to_lowercase().contains("screentrics")
    {
        return None;
    }
    Some(WindowInfo {
        id: window.id().ok()?.to_string(),
        title,
        app,
        width,
        height,
    })
}

#[tauri::command]
pub async fn list_sources() -> Result<Sources, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let monitors = Monitor::all().map_err(|error| error.to_string())?;
        let monitors = monitors
            .iter()
            .enumerate()
            .map(|(index, monitor)| MonitorInfo {
                index,
                name: monitor_name(monitor, index),
                width: monitor.width().unwrap_or(0),
                height: monitor.height().unwrap_or(0),
                x: monitor.x().unwrap_or(0),
                y: monitor.y().unwrap_or(0),
                primary: monitor.is_primary().unwrap_or(false),
            })
            .collect();
        let mut windows = Window::all()
            .map_err(|error| error.to_string())?
            .iter()
            .filter_map(useful_window)
            .collect::<Vec<_>>();
        windows.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        windows.truncate(60);
        Ok(Sources { monitors, windows })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn primary_bounds() -> Result<PrimaryBounds, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let monitors = Monitor::all().map_err(|error| error.to_string())?;
        let monitor = primary_monitor(&monitors)?;
        Ok(PrimaryBounds {
            x: monitor.x().map_err(|error| error.to_string())?,
            y: monitor.y().map_err(|error| error.to_string())?,
            width: monitor.width().map_err(|error| error.to_string())?,
            height: monitor.height().map_err(|error| error.to_string())?,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn capture_monitor(app: AppHandle, index: usize) -> Result<Captured, String> {
    let image = tauri::async_runtime::spawn_blocking(move || {
        let monitors = Monitor::all().map_err(|error| error.to_string())?;
        let monitor = monitors
            .get(index)
            .ok_or("That screen is no longer available.")?;
        monitor.capture_image().map_err(|error| {
            format!("Could not capture the screen. {error}")
        })
    })
    .await
    .map_err(|error| error.to_string())??;
    store_image(&app, image)
}

#[tauri::command]
pub async fn capture_window(app: AppHandle, id: String) -> Result<Captured, String> {
    let image = tauri::async_runtime::spawn_blocking(move || {
        let windows = Window::all().map_err(|error| error.to_string())?;
        let window = windows
            .into_iter()
            .find(|window| window.id().map(|value| value.to_string()).unwrap_or_default() == id)
            .ok_or("That window is no longer open.")?;
        window
            .capture_image()
            .map_err(|error| format!("Could not capture that window. {error}"))
    })
    .await
    .map_err(|error| error.to_string())??;
    store_image(&app, image)
}

#[tauri::command]
pub async fn capture_region(
    app: AppHandle,
    nx: f64,
    ny: f64,
    nw: f64,
    nh: f64,
) -> Result<Captured, String> {
    let image = tauri::async_runtime::spawn_blocking(move || {
        let monitors = Monitor::all().map_err(|error| error.to_string())?;
        let monitor = primary_monitor(&monitors)?.clone();
        let frame_width = monitor.width().map_err(|error| error.to_string())?;
        let frame_height = monitor.height().map_err(|error| error.to_string())?;
        let mut x = (nx.clamp(0.0, 1.0) * frame_width as f64).floor() as u32;
        let mut y = (ny.clamp(0.0, 1.0) * frame_height as f64).floor() as u32;
        let mut width = (nw.clamp(0.0, 1.0) * frame_width as f64).round().max(1.0) as u32;
        let mut height = (nh.clamp(0.0, 1.0) * frame_height as f64).round().max(1.0) as u32;
        if x >= frame_width {
            x = frame_width.saturating_sub(1);
        }
        if y >= frame_height {
            y = frame_height.saturating_sub(1);
        }
        width = width.min(frame_width - x).max(1);
        height = height.min(frame_height - y).max(1);
        monitor.capture_region(x, y, width, height).map_err(|error| {
            format!("Could not capture that area. {error}")
        })
    })
    .await
    .map_err(|error| error.to_string())??;
    store_image(&app, image)
}

#[tauri::command]
pub fn load_library(app: AppHandle) -> Result<LibraryPayload, String> {
    let path = library_path(&app)?;
    let library = if path.exists() {
        let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
        serde_json::from_str::<LibraryFile>(&text).unwrap_or_default()
    } else {
        LibraryFile::default()
    };
    let dir = captures_dir(&app)?;
    let mut thumbs = Vec::new();
    for capture in &library.captures {
        let Some(id) = capture.get("id").and_then(|value| value.as_str()) else {
            continue;
        };
        if safe_id(id).is_err() {
            continue;
        }
        let thumb_path = dir.join(format!("{id}.jpg"));
        if let Ok(bytes) = fs::read(thumb_path) {
            thumbs.push(Thumb {
                id: id.to_string(),
                thumb: data_url("image/jpeg", &bytes),
            });
        }
    }
    Ok(LibraryPayload {
        captures: library.captures,
        thumbs,
    })
}

#[tauri::command]
pub fn save_library(app: AppHandle, captures: Vec<serde_json::Value>) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let file = LibraryFile { captures };
    let json = serde_json::to_string_pretty(&file).map_err(|error| error.to_string())?;
    fs::write(dir.join("library.json"), json).map_err(|error| error.to_string())?;

    let keep: std::collections::HashSet<String> = file
        .captures
        .iter()
        .filter_map(|capture| capture.get("id").and_then(|value| value.as_str()))
        .filter(|id| safe_id(id).is_ok())
        .map(|id| id.to_string())
        .collect();
    let captures_dir = dir.join("captures");
    if let Ok(entries) = fs::read_dir(&captures_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            if !keep.contains(stem) {
                let _ = fs::remove_file(path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn load_image(app: AppHandle, id: String) -> Result<String, String> {
    safe_id(&id)?;
    let path = captures_dir(&app)?.join(format!("{id}.png"));
    let bytes = fs::read(&path).map_err(|_| "This capture's image is missing.".to_string())?;
    Ok(data_url("image/png", &bytes))
}

#[tauri::command]
pub fn pick_save_path(default_name: String, extension: String) -> Option<String> {
    let label = extension.to_uppercase();
    let mut path = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter(&label, &[extension.as_str()])
        .save_file()?;
    if path.extension().is_none() {
        path.set_extension(extension);
    }
    Some(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn write_export(path: String, data_base64: String) -> Result<(), String> {
    let raw = data_base64
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(data_base64.as_str());
    let bytes = STANDARD
        .decode(raw.trim())
        .map_err(|_| "Could not read the exported file.".to_string())?;
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
    }
    fs::write(path, bytes).map_err(|error| format!("Could not write the file. {error}"))
}
