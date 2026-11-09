//! Native Screentrics window. Library JSON and `captures/` stay where they are.

use std::time::{SystemTime, UNIX_EPOCH};

use rune::tok::motion;
use rune::{AppSpec, Cx, El, Pixels, ScrollSpec, TextEdit, col, el, row, text};
use rune_kit::{
    Button, ButtonVariant, Kit, SegmentedControl, Switch, TextInput, WindowTitlebar,
};
use serde_json::{Value, json};

use crate::capture::{self, Captured};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Library,
    Editor,
    Picker,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Theme {
    System,
    Light,
    Dark,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PickerKind {
    Windows,
    Screens,
}

pub struct State {
    theme: Theme,
    screen: Screen,
    picker: PickerKind,
    items: Vec<Value>,
    selected: Option<usize>,
    title: TextEdit,
    notice: String,
    error: String,
    monitors: Vec<capture::MonitorInfo>,
    windows: Vec<capture::WindowInfo>,
    preview: Option<Pixels>,
    motion: bool,
}

fn load() -> State {
    let theme = theme_from_args();
    match capture::load_library() {
        Ok(library) => State {
            theme,
            screen: Screen::Library,
            picker: PickerKind::Screens,
            items: library.captures,
            selected: None,
            title: TextEdit::new(""),
            notice: String::new(),
            error: String::new(),
            monitors: Vec::new(),
            windows: Vec::new(),
            preview: None,
            motion: false,
        },
        Err(error) => State {
            theme,
            screen: Screen::Library,
            picker: PickerKind::Screens,
            items: Vec::new(),
            selected: None,
            title: TextEdit::new(""),
            notice: String::new(),
            error,
            monitors: Vec::new(),
            windows: Vec::new(),
            preview: None,
            motion: false,
        },
    }
}

fn theme_from_args() -> Theme {
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .position(|arg| arg == "--theme")
        .and_then(|index| args.get(index + 1))
        .map(|value| match value.as_str() {
            "dark" => Theme::Dark,
            "light" => Theme::Light,
            _ => Theme::System,
        })
        .unwrap_or(Theme::System)
}

fn is_dark(theme: Theme, cx: &Cx<State>) -> bool {
    match theme {
        Theme::Dark => true,
        Theme::Light => false,
        Theme::System => cx.system_dark(),
    }
}

fn persist(state: &State) {
    if rune::tooling::headless_run().is_some() {
        return;
    }
    let _ = capture::save_library(state.items.clone());
}

fn style_number(doc: &Value, key: &str, fallback: f64) -> f64 {
    doc.get("style")
        .and_then(|style| style.get(key))
        .and_then(|value| value.as_f64())
        .unwrap_or(fallback)
}

fn step_style(state: &mut State, key: &str, delta: f64, min: f64, max: f64) {
    let Some(index) = state.selected else {
        return;
    };
    let Some(doc) = state.items.get_mut(index) else {
        return;
    };
    if !doc.get("style").is_some_and(|style| style.is_object()) {
        doc["style"] = json!({});
    }
    let next = (style_number(doc, key, 0.0) + delta).clamp(min, max);
    doc["style"][key] = json!(next);
    persist(state);
}

fn reset_frame(state: &mut State) {
    let Some(index) = state.selected else {
        return;
    };
    let Some(doc) = state.items.get_mut(index) else {
        return;
    };
    doc["style"]["scale"] = json!(1.0);
    for key in ["focusX", "focusY", "rotateX", "rotateY", "rotateZ"] {
        doc["style"][key] = json!(0.0);
    }
    persist(state);
}

fn open_editor(state: &mut State, index: usize) {
    state.selected = Some(index);
    state.screen = Screen::Editor;
    state.motion = false;
    let title = state.items[index]["title"].as_str().unwrap_or("").to_string();
    state.title = TextEdit::new(&title);
    state.preview = load_preview(state.items[index]["id"].as_str().unwrap_or(""));
}

fn load_preview(id: &str) -> Option<Pixels> {
    let path = capture::app_data_dir().join("captures").join(format!("{id}.png"));
    let image = image::open(path).ok()?.to_rgba8();
    let pixels = Pixels::new();
    pixels.set(image.width(), image.height(), image.into_raw());
    Some(pixels)
}

fn remember(state: &mut State, captured: Captured, title: String) {
    let doc = json!({
        "id": captured.id,
        "title": title,
        "createdAt": now_ms(),
        "width": captured.width,
        "height": captured.height,
        "style": {
            "padding": 64,
            "backgroundMode": "wallpaper",
            "wallpaper": 0,
            "backgroundColor": "#ffffff",
            "backgroundImage": null,
            "blur": 0,
            "noise": 0,
            "borderStyle": 0,
            "radius": 14,
            "borderColor": "#ffffff",
            "thickness": 0,
            "shadowBlur": 36,
            "shadowY": 18,
            "shadowOpacity": 22,
            "scale": 1,
            "focusX": 0,
            "focusY": 0,
            "rotateX": 0,
            "rotateY": 0,
            "rotateZ": 0
        },
        "annotations": [],
        "crop": { "x": 0, "y": 0, "w": 1, "h": 1 },
        "motion": { "duration": 5, "zooms": [], "texts": [], "images": [] }
    });
    state.items.insert(0, doc);
    persist(state);
    open_editor(state, 0);
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn capture_screen(state: &mut State, index: usize, title: String) {
    match capture::capture_monitor_blocking(index) {
        Ok(captured) => {
            state.notice = "Saved the screen.".into();
            state.error.clear();
            remember(state, captured, title);
        }
        Err(error) => state.error = error,
    }
}

fn view(state: &State, cx: &mut Cx<State>) -> El {
    let dark = is_dark(state.theme, cx);
    let kit = Kit::neutral(dark);
    let theme_tokens = rune::tok::theme(dark);
    let body = col()
        .key("body")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .fill(theme_tokens.bg)
        .padding(16.0)
        .gap(12.0)
        .child(match state.screen {
            Screen::Library => library(state, &kit),
            Screen::Editor => editor(state, &kit),
            Screen::Picker => picker(state, &kit),
        });
    let titlebar = WindowTitlebar::from_insets(cx.chrome_insets(), 1.0)
        .leading(text("Screentrics").font(kit.ty.ui_medium).color(kit.c.text_base))
        .trailing(theme_switch(state, &kit))
        .fill(kit.c.bg_deep)
        .build(&kit);
    col()
        .key("window")
        .w_full()
        .h_full()
        .fill(theme_tokens.bg)
        .child(titlebar)
        .child(body)
        .child(status_line(state, &kit))
}

fn theme_switch(state: &State, kit: &Kit) -> El {
    let dark = matches!(state.theme, Theme::Dark);
    Switch::new(dark)
        .label("Dark theme")
        .hide_label()
        .on_toggle(|state: &mut State| {
            state.theme = if matches!(state.theme, Theme::Dark) {
                Theme::Light
            } else {
                Theme::Dark
            };
        })
        .build(kit)
        .key("theme")
}

fn status_line(state: &State, kit: &Kit) -> El {
    let message = if !state.error.is_empty() {
        state.error.clone()
    } else if !state.notice.is_empty() {
        state.notice.clone()
    } else {
        String::new()
    };
    if message.is_empty() {
        return el().key("status").h(0.0);
    }
    text(message)
        .key("status")
        .font(kit.ty.caption())
        .color(if state.error.is_empty() { kit.c.text_muted } else { kit.c.danger.fg })
        .wrap()
        .padding(16.0)
}

fn library(state: &State, kit: &Kit) -> El {
    let mut list = col()
        .key("captures")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .gap(8.0)
        .scroll(ScrollSpec { stick_bottom: false });
    if state.items.is_empty() {
        list = list.child(
            text("No captures yet. Take a screen, a window, or an area.")
                .key("empty")
                .font(kit.ty.body)
                .color(kit.c.text_muted)
                .wrap(),
        );
    }
    for (index, doc) in state.items.iter().enumerate() {
        let title = doc["title"].as_str().unwrap_or("Untitled").to_string();
        let detail = format!(
            "{} × {}",
            doc["width"].as_u64().unwrap_or(0),
            doc["height"].as_u64().unwrap_or(0)
        );
        list = list.child(capture_row(kit, index, title, detail));
    }
    col()
        .key("library")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .gap(16.0)
        .child(library_actions(kit))
        .child(
            text("Library")
                .key("heading")
                .font(kit.ty.ui_medium)
                .color(kit.c.text_base),
        )
        .child(kit.scroll_bar(list))
}

fn library_actions(kit: &Kit) -> El {
    row()
        .key("capture-actions")
        .role("toolbar")
        .w_full()
        .gap(8.0)
        .child(
            Button::new("Area")
                .on_press(|state: &mut State| {
                    match capture::capture_region_blocking(0.25, 0.25, 0.5, 0.5) {
                        Ok(captured) => {
                            state.notice = "Saved the area.".into();
                            state.error.clear();
                            remember(state, captured, "Area".into());
                        }
                        Err(error) => state.error = error,
                    }
                })
                .build(kit)
                .key("capture-area"),
        )
        .child(
            Button::new("Window")
                .on_press(|state: &mut State| {
                    state.picker = PickerKind::Windows;
                    match capture::list_sources_blocking() {
                        Ok(sources) => {
                            state.windows = sources.windows;
                            state.monitors = sources.monitors;
                            state.error.clear();
                            state.screen = Screen::Picker;
                        }
                        Err(error) => state.error = error,
                    }
                })
                .build(kit)
                .key("capture-window"),
        )
        .child(
            Button::new("Screen")
                .on_press(|state: &mut State| {
                    state.picker = PickerKind::Screens;
                    match capture::list_sources_blocking() {
                        Ok(sources) => {
                            state.monitors = sources.monitors;
                            state.windows = sources.windows;
                            state.error.clear();
                            state.screen = Screen::Picker;
                        }
                        Err(error) => state.error = error,
                    }
                })
                .build(kit)
                .key("capture-screen"),
        )
}

fn capture_row(kit: &Kit, index: usize, title: String, detail: String) -> El {
    let label = format!("{title}, {detail}");
    row()
        .key(format!("capture-{index}"))
        .role("button")
        .label(label)
        .focusable(true)
        .focus_ring(2.0, 2.0, kit.c.border_focus)
        .w_full()
        .min_h(44.0)
        .px(12.0)
        .gap(12.0)
        .center_y()
        .radius(kit.radius.md)
        .fill(kit.c.layer_01)
        .hover(kit.c.hover)
        .on_press(move |state: &mut State| open_editor(state, index))
        .child(
            text(title)
                .font(kit.ty.ui)
                .color(kit.c.text_base)
                .grow(1.0)
                .shrink()
                .min_w(0.0),
        )
        .child(text(detail).font(kit.ty.caption()).color(kit.c.text_muted))
}

fn picker(state: &State, kit: &Kit) -> El {
    let mut list = col()
        .key("sources")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .gap(8.0)
        .scroll(ScrollSpec { stick_bottom: false });
    match state.picker {
        PickerKind::Screens => {
            if state.monitors.is_empty() {
                list = list.child(empty_line(kit, "No screens were found."));
            }
            for monitor in &state.monitors {
                let index = monitor.index;
                let name = monitor.name.clone();
                let label = format!("{} {}×{}", name, monitor.width, monitor.height);
                list = list.child(
                    Button::new(label)
                        .variant(ButtonVariant::Outline)
                        .on_press(move |state: &mut State| capture_screen(state, index, name.clone()))
                        .build(kit)
                        .key(format!("screen-{index}")),
                );
            }
        }
        PickerKind::Windows => {
            if state.windows.is_empty() {
                list = list.child(empty_line(kit, "No windows were found."));
            }
            for (index, window) in state.windows.iter().enumerate() {
                let id = window.id.clone();
                let title = window.title.clone();
                list = list.child(
                    Button::new(format!("{title} — {}", window.app))
                        .variant(ButtonVariant::Outline)
                        .on_press(move |state: &mut State| match capture::capture_window_blocking(id.clone()) {
                            Ok(captured) => {
                                state.notice = "Saved the window.".into();
                                state.error.clear();
                                remember(state, captured, title.clone());
                            }
                            Err(error) => state.error = error,
                        })
                        .build(kit)
                        .key(format!("window-{index}")),
                );
            }
        }
    }
    col()
        .key("picker")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .gap(12.0)
        .child(
            Button::new("Back")
                .variant(ButtonVariant::Ghost)
                .on_press(|state: &mut State| state.screen = Screen::Library)
                .build(kit)
                .key("back"),
        )
        .child(
            text(if state.picker == PickerKind::Screens { "Screens" } else { "Windows" })
                .font(kit.ty.ui_medium)
                .color(kit.c.text_base),
        )
        .child(kit.scroll_bar(list))
}

fn empty_line(kit: &Kit, message: &str) -> El {
    text(message).key("empty").font(kit.ty.body).color(kit.c.text_muted).wrap()
}

fn editor(state: &State, kit: &Kit) -> El {
    let doc = state.selected.and_then(|index| state.items.get(index));
    row()
        .key("editor")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .gap(16.0)
        .child(stage(state, kit, doc).grow(1.0).shrink().min_w(0.0))
        .child(inspector(state, kit, doc).w(280.0).max_w(280.0).shrink().min_w(0.0))
}

fn stage(state: &State, kit: &Kit, doc: Option<&Value>) -> El {
    let mut column = col()
        .key("stage")
        .grow(1.0)
        .min_w(0.0)
        .min_h(0.0)
        .gap(12.0)
        .child(editor_toolbar(kit, state.motion));
    column = column.child(match (doc, state.preview.as_ref()) {
        (Some(doc), Some(pixels)) => wallpaper(kit, doc, pixels),
        (Some(_), None) => empty_line(kit, "This capture's image is missing."),
        (None, _) => empty_line(kit, "Open a capture from the library to edit it."),
    });
    if state.motion {
        column = column.child(motion_note(kit, doc));
    }
    column
}

fn editor_toolbar(kit: &Kit, motion_on: bool) -> El {
    row()
        .key("editor-tools")
        .role("toolbar")
        .w_full()
        .gap(8.0)
        .center_y()
        .child(
            Button::new("Library")
                .variant(ButtonVariant::Ghost)
                .on_press(|state: &mut State| {
                    state.screen = Screen::Library;
                    state.preview = None;
                })
                .build(kit)
                .key("back"),
        )
        .child(
            SegmentedControl::new(&["Still", "Motion"], Some(if motion_on { 1 } else { 0 }))
                .label("Editor mode")
                .fit()
                .on_pick(|state: &mut State, index, _| state.motion = index == 1)
                .build(kit)
                .key("mode"),
        )
}

fn wallpaper(kit: &Kit, doc: &Value, pixels: &Pixels) -> El {
    let scale = style_number(doc, "scale", 1.0).clamp(1.0, 3.0) as f32;
    let focus_x = style_number(doc, "focusX", 0.0).clamp(-100.0, 100.0) as f32;
    let focus_y = style_number(doc, "focusY", 0.0).clamp(-100.0, 100.0) as f32;
    let rotate_z = style_number(doc, "rotateZ", 0.0).clamp(-60.0, 60.0);
    let radius = style_number(doc, "radius", 14.0).clamp(0.0, 64.0) as f32;
    let (image_w, image_h) = pixels.size();
    let fit = 280.0 / (image_w.max(image_h) as f32).max(1.0);
    let base_w = image_w as f32 * fit;
    let base_h = image_h as f32 * fit;
    let shot_w = base_w * scale;
    let shot_h = base_h * scale;
    let shift_x = focus_x / 100.0 * base_w * 0.75;
    let shift_y = focus_y / 100.0 * base_h * 0.75;
    let origin_x = (base_w - shot_w) / 2.0 + shift_x;
    let origin_y = (base_h - shot_h) / 2.0 + shift_y;
    el()
        .key("wallpaper")
        .role("img")
        .label("Capture on wallpaper")
        .size(base_w + 48.0, base_h + 48.0)
        .self_center()
        .radius(radius)
        .clip_rounded(radius)
        .fill(kit.c.layer_02)
        .child(
            el()
                .key("shot")
                .size(shot_w, shot_h)
                .absolute(24.0 + origin_x, 24.0 + origin_y)
                .radius(radius)
                .clip_rounded(radius)
                .rotate(rotate_z.to_radians() as f32)
                .motion(motion::SNAPPY)
                .pixels(pixels),
        )
}

fn motion_note(kit: &Kit, doc: Option<&Value>) -> El {
    let (zooms, texts, images, duration) = doc
        .map(|doc| {
            let motion = &doc["motion"];
            (
                motion["zooms"].as_array().map(|items| items.len()).unwrap_or(0),
                motion["texts"].as_array().map(|items| items.len()).unwrap_or(0),
                motion["images"].as_array().map(|items| items.len()).unwrap_or(0),
                motion["duration"].as_f64().unwrap_or(5.0),
            )
        })
        .unwrap_or((0, 0, 0, 5.0));
    text(format!(
        "Motion {duration:.1}s · {zooms} zooms · {texts} captions · {images} images. WebM export needs a video encoder Rune does not ship."
    ))
    .key("motion-summary")
    .font(kit.ty.caption())
    .color(kit.c.text_muted)
    .wrap()
}

fn inspector(state: &State, kit: &Kit, doc: Option<&Value>) -> El {
    let mut column = col()
        .key("inspector")
        .role("complementary")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .gap(12.0)
        .scroll(ScrollSpec { stick_bottom: false })
        .child(
            text("Inspector")
                .font(kit.ty.ui_medium)
                .color(kit.c.text_base),
        )
        .child(
            TextInput::new(&state.title)
                .label("Title")
                .placeholder("Title")
                .width(None)
                .disabled(doc.is_none())
                .on_edit(|state: &mut State| &mut state.title)
                .on_change(|state: &mut State, _| {
                    let Some(index) = state.selected else {
                        return;
                    };
                    if let Some(doc) = state.items.get_mut(index) {
                        doc["title"] = json!(state.title.text);
                        persist(state);
                    }
                })
                .build(kit),
        );
    if let Some(doc) = doc {
        column = column
            .child(slider(kit, "scale", "Scale", style_number(doc, "scale", 1.0), 1.0, 3.0, 0.1))
            .child(slider(kit, "focusX", "Position X", style_number(doc, "focusX", 0.0), -100.0, 100.0, 5.0))
            .child(slider(kit, "focusY", "Position Y", style_number(doc, "focusY", 0.0), -100.0, 100.0, 5.0))
            .child(slider(kit, "rotateX", "Rotate X", style_number(doc, "rotateX", 0.0), -60.0, 60.0, 2.0))
            .child(slider(kit, "rotateY", "Rotate Y", style_number(doc, "rotateY", 0.0), -60.0, 60.0, 2.0))
            .child(slider(kit, "rotateZ", "Rotate Z", style_number(doc, "rotateZ", 0.0), -60.0, 60.0, 2.0))
            .child(
                Button::new("Reset frame")
                    .variant(ButtonVariant::Ghost)
                    .on_press(reset_frame)
                    .build(kit)
                    .key("reset-frame"),
            )
            .child(
                Button::new("Export PNG")
                    .variant(ButtonVariant::Contrast)
                    .on_press(|state: &mut State| export_png(state))
                    .build(kit)
                    .key("export-png"),
            )
            .child(
                text(format!(
                    "{} marks stay in the document.",
                    doc["annotations"].as_array().map(|items| items.len()).unwrap_or(0)
                ))
                .font(kit.ty.caption())
                .color(kit.c.text_muted)
                .wrap(),
            );
    }
    kit.scroll_bar(column)
}

fn slider(kit: &Kit, key: &str, label: &str, value: f64, min: f64, max: f64, step: f64) -> El {
    let fraction = ((value - min) / (max - min)).clamp(0.0, 1.0) as f32;
    let key_owned = key.to_string();
    row()
        .key(key)
        .role("slider")
        .label(label)
        .focusable(true)
        .focus_ring(2.0, 2.0, kit.c.border_focus)
        .w_full()
        .min_h(32.0)
        .gap(8.0)
        .center_y()
        .range_value(value, min, max)
        .range_step(step)
        .on_step(move |state: &mut State, steps: i32, _| {
            step_style(state, &key_owned, step * f64::from(steps), min, max);
        })
        .child(text(label).font(kit.ty.small).color(kit.c.text_muted).w(88.0))
        .child(
            el()
                .key("track")
                .grow(1.0)
                .h(4.0)
                .radius(2.0)
                .fill(kit.c.layer_03)
                .child(
                    el()
                        .h(4.0)
                        .w(120.0 * fraction)
                        .radius(2.0)
                        .fill(kit.c.bg_accent)
                        .motion(motion::SNAPPY),
                ),
        )
        .child(
            text(format!("{value:.1}"))
                .font(kit.ty.mono)
                .color(kit.c.text_base)
                .w(48.0),
        )
}

fn export_png(state: &mut State) {
    let Some(index) = state.selected else {
        return;
    };
    let id = state.items[index]["id"].as_str().unwrap_or("").to_string();
    let title = state.items[index]["title"].as_str().unwrap_or("capture").to_string();
    let Some(path) = capture::pick_save_path(title, "png".into()) else {
        return;
    };
    let source = capture::app_data_dir().join("captures").join(format!("{id}.png"));
    match std::fs::copy(source, path) {
        Ok(_) => {
            state.notice = "Exported the PNG.".into();
            state.error.clear();
        }
        Err(error) => state.error = error.to_string(),
    }
}

pub fn run() {
    rune::run(AppSpec {
        scenes: &[
            ("editor", |state: &mut State| {
                if state.items.is_empty() {
                    state.screen = Screen::Editor;
                } else {
                    open_editor(state, state.selected.unwrap_or(0));
                }
            }),
            ("dark", |state| state.theme = Theme::Dark),
            ("light", |state| state.theme = Theme::Light),
        ],
        ..AppSpec::new("Screentrics", (1100.0, 720.0), load, view)
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};

    #[test]
    fn library_names_every_control() {
        let env = Env { system_dark: false, scale: 2.0 };
        let mut runtime = Runtime::new(load(), view, (1100.0, 720.0), env);
        runtime.frame(0.0);
        let tree = runtime.accessibility_json().to_string();
        for name in ["Dark theme", "Area", "Window", "Screen", "Library"] {
            assert!(tree.contains(name), "missing {name} in {tree}");
        }
    }

    #[test]
    fn editor_scene_keeps_a_logical_focus_order() {
        let env = Env { system_dark: true, scale: 1.0 };
        let mut state = load();
        state.screen = Screen::Editor;
        let mut runtime = Runtime::new(state, view, (480.0, 640.0), env);
        runtime.frame(0.0);
        let tree = runtime.accessibility_json().to_string();
        for name in ["Library", "Editor mode", "Title"] {
            assert!(tree.contains(name), "missing {name}");
        }
        assert!(tree.find("Library").unwrap() < tree.find("Title").unwrap());
    }
}
